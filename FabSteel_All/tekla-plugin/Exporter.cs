using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using Tekla.Structures.Geometry3d;
using Tekla.Structures.Model;
using TSMUI = Tekla.Structures.Model.UI;

namespace FabSteelExport
{
    public class ExportOptions
    {
        public bool OnlySelected = false;
        public bool IncludeBolts = true;
        public bool Gzip = true;
        /// <summary>Name of the Tekla report property that holds the bolt length (see README). Tried first.</summary>
        public string BoltLengthProperty = "LENGTH";
    }

    public class ExportResult
    {
        public int Parts, Bolts, GridX, GridY, Levels, BoltLengthMissing;
        public string Path;
        public long Bytes;
        public List<string> Warnings = new List<string>();
    }

    internal class GridLine { public string N; public double V; }

    /// <summary>
    /// Reads the open Tekla 2024 model and writes a .fabsteel file (JSON, gzip) that the
    /// FabSteel Structural Installer (Windows + Android) opens. Format: see docs/FORMAT.md
    /// </summary>
    public static class Exporter
    {
        static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        public static ExportResult Run(string path, ExportOptions opt, Action<string> log)
        {
            if (log == null) log = delegate { };
            var res = new ExportResult { Path = path };

            var model = new Model();
            if (!model.GetConnectionStatus())
                throw new InvalidOperationException("Tekla Structures is not running or no model is open.");

            // Work in the global coordinate system so every coordinate is global.
            var wph = model.GetWorkPlaneHandler();
            TransformationPlane oldPlane = wph.GetCurrentTransformationPlane();
            wph.SetCurrentTransformationPlane(new TransformationPlane());
            try
            {
                string modelName = SafeStr(delegate { return model.GetInfo().ModelName; });
                string projName = "", projNo = "", designer = "";
                try
                {
                    ProjectInfo pi = model.GetProjectInfo();
                    projName = pi.Name ?? ""; projNo = pi.ProjectNumber ?? ""; designer = pi.Designer ?? "";
                }
                catch { }
                if (string.IsNullOrEmpty(projName)) projName = modelName;
                log("Model: " + modelName);

                // ---------- collect objects ----------
                var partObjs = new List<Part>();
                var boltObjs = new List<BoltGroup>();
                if (opt.OnlySelected)
                {
                    ModelObjectEnumerator sel = new TSMUI.ModelObjectSelector().GetSelectedObjects();
                    while (sel.MoveNext())
                    {
                        var p = sel.Current as Part; if (p != null) { partObjs.Add(p); continue; }
                        var b = sel.Current as BoltGroup; if (b != null) boltObjs.Add(b);
                    }
                    if (opt.IncludeBolts && boltObjs.Count == 0)
                        res.Warnings.Add("Selection holds no bolt groups: bolts attached to the selected parts are collected below.");
                }
                else
                {
                    var selector = model.GetModelObjectSelector();
                    ModelObject.ModelObjectEnum[] partTypes = { ModelObject.ModelObjectEnum.BEAM, ModelObject.ModelObjectEnum.CONTOURPLATE, ModelObject.ModelObjectEnum.POLYBEAM };
                    foreach (var t in partTypes)
                    {
                        ModelObjectEnumerator e = selector.GetAllObjectsWithType(t);
                        while (e.MoveNext()) { var p = e.Current as Part; if (p != null) partObjs.Add(p); }
                    }
                    if (opt.IncludeBolts)
                    {
                        ModelObject.ModelObjectEnum[] boltTypes = { ModelObject.ModelObjectEnum.BOLT_ARRAY, ModelObject.ModelObjectEnum.BOLT_CIRCLE };
                        foreach (var t in boltTypes)
                        {
                            ModelObjectEnumerator e = selector.GetAllObjectsWithType(t);
                            while (e.MoveNext()) { var b = e.Current as BoltGroup; if (b != null) boltObjs.Add(b); }
                        }
                    }
                }
                log("Parts found: " + partObjs.Count);

                var sb = new StringBuilder(1 << 20);
                sb.Append("{\"fmt\":\"fabsteel\",\"ver\":1,\"prj\":{");
                sb.Append("\"name\":").Append(Q(projName)).Append(",\"no\":").Append(Q(projNo)).Append(",\"by\":").Append(Q(designer));
                sb.Append(",\"date\":").Append(Q(DateTime.Now.ToString("yyyy-MM-dd"))).Append(",\"tekla\":\"2024\",\"unit\":\"mm\"},");

                // ---------- grids ----------
                var gx = new List<GridLine>(); var gy = new List<GridLine>(); var gz = new List<GridLine>();
                try
                {
                    ModelObjectEnumerator ge = model.GetModelObjectSelector().GetAllObjectsWithType(ModelObject.ModelObjectEnum.GRID);
                    while (ge.MoveNext())
                    {
                        var g = ge.Current as Grid; if (g == null) continue;
                        AddGrid(gx, g.CoordinateX, g.LabelX, false);
                        AddGrid(gy, g.CoordinateY, g.LabelY, false);
                        AddGrid(gz, g.CoordinateZ, g.LabelZ, true);
                    }
                }
                catch (Exception ex) { res.Warnings.Add("Grid read failed: " + ex.Message); }
                res.GridX = gx.Count; res.GridY = gy.Count; res.Levels = gz.Count;
                if (gx.Count == 0 && gy.Count == 0) res.Warnings.Add("No grid found in the model: grid search will be empty. Create a grid in Tekla.");
                if (gz.Count == 0) res.Warnings.Add("No Z grid (levels) found: the viewer will guess levels from beam/column heights.");
                sb.Append("\"grid\":{\"x\":").Append(GridJson(gx)).Append(",\"y\":").Append(GridJson(gy)).Append(",\"z\":").Append(GridJson(gz)).Append("},");

                // ---------- parts ----------
                var exportedIds = new HashSet<int>();
                sb.Append("\"parts\":[");
                bool first = true; int count = 0;
                foreach (Part part in partObjs)
                {
                    try
                    {
                        Solid solid = part.GetSolid();
                        if (solid == null) continue;
                        Point mn = solid.MinimumPoint, mx = solid.MaximumPoint;
                        int id = part.Identifier.ID;

                        string pos = "", asm = "", name = part.Name ?? "";
                        double w = 0, len = 0, sw = 0, sh = 0;
                        part.GetReportProperty("PART_POS", ref pos);
                        part.GetReportProperty("ASSEMBLY_POS", ref asm);
                        part.GetReportProperty("WEIGHT", ref w);
                        part.GetReportProperty("LENGTH", ref len);
                        bool okW = part.GetReportProperty("WIDTH", ref sw);
                        bool okH = part.GetReportProperty("HEIGHT", ref sh);
                        // assembly: fall back to the main part's mark if ASSEMBLY_POS is empty
                        bool isMain = false;
                        try
                        {
                            Tekla.Structures.Model.Assembly asmObj = part.GetAssembly();
                            if (asmObj != null)
                            {
                                var mainObj = asmObj.GetMainPart() as Part;
                                isMain = mainObj != null && mainObj.Identifier.ID == id;
                                if (string.IsNullOrEmpty(asm) && mainObj != null) mainObj.GetReportProperty("PART_POS", ref asm);
                            }
                        }
                        catch { }
                        string prof = SafeStr(delegate { return part.Profile.ProfileString; });
                        string mat = SafeStr(delegate { return part.Material.MaterialString; });
                        string cls = part.Class ?? "";

                        // reference line (beams, columns, braces, poly-beams)
                        Point sp = null, ep = null;
                        var beam = part as Beam;
                        if (beam != null) { sp = beam.StartPoint; ep = beam.EndPoint; }
                        else
                        {
                            var pb = part as PolyBeam;
                            if (pb != null && pb.Contour != null && pb.Contour.ContourPoints.Count >= 2)
                            {
                                sp = (Point)pb.Contour.ContourPoints[0];
                                ep = (Point)pb.Contour.ContourPoints[pb.Contour.ContourPoints.Count - 1];
                            }
                        }

                        if (!first) sb.Append(','); first = false;
                        sb.Append("{\"id\":").Append(id);
                        sb.Append(",\"m\":").Append(Q(string.IsNullOrEmpty(pos) ? id.ToString(Inv) : pos));
                        if (!string.IsNullOrEmpty(asm)) sb.Append(",\"a\":").Append(Q(asm));
                        if (isMain) sb.Append(",\"mp\":1");
                        sb.Append(",\"n\":").Append(Q(name)).Append(",\"p\":").Append(Q(prof)).Append(",\"mt\":").Append(Q(mat));
                        sb.Append(",\"w\":").Append(N(w, 1)).Append(",\"l\":").Append(N(len, 0));
                        if (!string.IsNullOrEmpty(cls)) sb.Append(",\"c\":").Append(Q(cls));
                        sb.Append(",\"bb\":[").Append(N(mn.X, 0)).Append(',').Append(N(mn.Y, 0)).Append(',').Append(N(mn.Z, 0)).Append(',')
                          .Append(N(mx.X, 0)).Append(',').Append(N(mx.Y, 0)).Append(',').Append(N(mx.Z, 0)).Append(']');
                        if (sp != null && ep != null)
                        {
                            sb.Append(",\"ln\":[").Append(N(sp.X, 0)).Append(',').Append(N(sp.Y, 0)).Append(',').Append(N(sp.Z, 0)).Append(',')
                              .Append(N(ep.X, 0)).Append(',').Append(N(ep.Y, 0)).Append(',').Append(N(ep.Z, 0)).Append(']');
                            if (okW && okH && sw > 0 && sh > 0) sb.Append(",\"sec\":[").Append(N(sw, 0)).Append(',').Append(N(sh, 0)).Append(']');
                        }
                        var obs = new StringBuilder();
                        // oriented box (exact shape of inclined plates / members); skipped when the part is axis-aligned
                        try
                        {
                            CoordinateSystem cs = part.GetCoordinateSystem();
                            double ax = cs.AxisX.X, ay = cs.AxisX.Y, az = cs.AxisX.Z, bx = cs.AxisY.X, by = cs.AxisY.Y, bz = cs.AxisY.Z;
                            double la = Math.Sqrt(ax * ax + ay * ay + az * az), lb = Math.Sqrt(bx * bx + by * by + bz * bz);
                            if (la > 1e-9 && lb > 1e-9)
                            {
                                ax /= la; ay /= la; az /= la; bx /= lb; by /= lb; bz /= lb;
                                bool alignedA = Math.Max(Math.Abs(ax), Math.Max(Math.Abs(ay), Math.Abs(az))) > 0.9999;
                                bool alignedB = Math.Max(Math.Abs(bx), Math.Max(Math.Abs(by), Math.Abs(bz))) > 0.9999;
                                if (!(alignedA && alignedB))
                                {
                                    try
                                    {
                                        wph.SetCurrentTransformationPlane(new TransformationPlane(cs));
                                        Solid ls = part.GetSolid();
                                        if (ls != null)
                                        {
                                            Point lmn = ls.MinimumPoint, lmx = ls.MaximumPoint;
                                            obs.Append(",\"ob\":[").Append(N(cs.Origin.X, 0)).Append(',').Append(N(cs.Origin.Y, 0)).Append(',').Append(N(cs.Origin.Z, 0)).Append(',')
                                              .Append(N(ax, 4)).Append(',').Append(N(ay, 4)).Append(',').Append(N(az, 4)).Append(',')
                                              .Append(N(bx, 4)).Append(',').Append(N(by, 4)).Append(',').Append(N(bz, 4)).Append(',')
                                              .Append(N(lmn.X, 0)).Append(',').Append(N(lmn.Y, 0)).Append(',').Append(N(lmn.Z, 0)).Append(',')
                                              .Append(N(lmx.X, 0)).Append(',').Append(N(lmx.Y, 0)).Append(',').Append(N(lmx.Z, 0)).Append(']');
                                        }
                                    }
                                    finally { wph.SetCurrentTransformationPlane(new TransformationPlane()); }
                                }
                            }
                        }
                        catch { obs.Clear(); }
                        sb.Append(obs.ToString());
                        sb.Append('}');
                        exportedIds.Add(id); count++;
                        if (count % 250 == 0) log("  ... " + count + " parts");
                    }
                    catch (Exception ex)
                    {
                        res.Warnings.Add("Part skipped (" + SafeStr(delegate { return part.Identifier.ID.ToString(); }) + "): " + ex.Message);
                    }
                }
                sb.Append("],");
                res.Parts = count;

                // ---------- bolts ----------
                if (opt.IncludeBolts)
                {
                    // also collect every bolt group attached to the exported parts (this covers
                    // bolt lists / XY lists, which have no ModelObjectEnum value of their own)
                    var seen = new HashSet<int>();
                    foreach (BoltGroup known in boltObjs) seen.Add(known.Identifier.ID);
                    foreach (Part part in partObjs)
                    {
                        try
                        {
                            ModelObjectEnumerator be = part.GetBolts();
                            while (be.MoveNext())
                            {
                                var b = be.Current as BoltGroup;
                                if (b != null && seen.Add(b.Identifier.ID)) boltObjs.Add(b);
                            }
                        }
                        catch { }
                    }
                }
                sb.Append("\"bolts\":[");
                first = true; int bcount = 0;
                var boltIds = new HashSet<int>();
                foreach (BoltGroup bg in boltObjs)
                {
                    try
                    {
                        int bid = bg.Identifier.ID;
                        if (!boltIds.Add(bid)) continue;
                        var ps = new List<int>();
                        AddPartId(ps, bg.PartToBoltTo, exportedIds);
                        AddPartId(ps, bg.PartToBeBolted, exportedIds);
                        if (bg.OtherPartsToBolt != null) foreach (object o in bg.OtherPartsToBolt) AddPartId(ps, o as Part, exportedIds);
                        if (ps.Count == 0) continue;

                        int n = bg.BoltPositions != null ? bg.BoltPositions.Count : 1;
                        double size = bg.BoltSize;
                        string std = bg.BoltStandard ?? "";
                        double blen = BoltLength(bg, opt.BoltLengthProperty);
                        if (blen <= 0) res.BoltLengthMissing++;
                        int nu = 0, wa = 0;
                        try { nu = (bg.Nut1 ? 1 : 0) + (bg.Nut2 ? 1 : 0); wa = (bg.Washer1 ? 1 : 0) + (bg.Washer2 ? 1 : 0) + (bg.Washer3 ? 1 : 0); }
                        catch { nu = 1; wa = 2; }
                        Match gm = Regex.Match(std, @"\d{1,2}\.\d");
                        Point at = null; try { at = bg.FirstPosition; } catch { }

                        if (!first) sb.Append(','); first = false;
                        sb.Append("{\"id\":").Append(bid).Append(",\"d\":").Append(N(size, 1)).Append(",\"l\":").Append(N(blen, 0)).Append(",\"n\":").Append(n);
                        if (gm.Success) sb.Append(",\"s\":").Append(Q(gm.Value));
                        if (!string.IsNullOrEmpty(std)) sb.Append(",\"std\":").Append(Q(std));
                        sb.Append(",\"nu\":").Append(nu).Append(",\"wa\":").Append(wa);
                        sb.Append(",\"ps\":[").Append(string.Join(",", ps.ConvertAll(x => x.ToString(Inv)).ToArray())).Append(']');
                        if (at != null) sb.Append(",\"at\":[").Append(N(at.X, 0)).Append(',').Append(N(at.Y, 0)).Append(',').Append(N(at.Z, 0)).Append(']');
                        sb.Append('}');
                        bcount++;
                    }
                    catch (Exception ex) { res.Warnings.Add("Bolt group skipped: " + ex.Message); }
                }
                sb.Append("]}");
                res.Bolts = bcount;
                if (res.BoltLengthMissing > 0)
                    res.Warnings.Add(res.BoltLengthMissing + " bolt group(s) have no length. Check the 'bolt length property' name (see README) — those bolts are listed by diameter only.");

                // ---------- write ----------
                byte[] bytes = new UTF8Encoding(false).GetBytes(sb.ToString());
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path)));
                using (var fs = File.Create(path))
                {
                    if (opt.Gzip)
                        using (var gzs = new GZipStream(fs, CompressionLevel.Optimal)) gzs.Write(bytes, 0, bytes.Length);
                    else fs.Write(bytes, 0, bytes.Length);
                }
                res.Bytes = new FileInfo(path).Length;
                log("Saved: " + path + " (" + (res.Bytes / 1024.0).ToString("0.0", Inv) + " KB)");
                return res;
            }
            finally
            {
                wph.SetCurrentTransformationPlane(oldPlane);
            }
        }

        // ---------------------------------------------------------------- helpers
        static void AddPartId(List<int> ps, Part p, HashSet<int> exported)
        {
            if (p == null) return;
            int id = p.Identifier.ID;
            if (exported.Contains(id) && !ps.Contains(id)) ps.Add(id);
        }

        static double BoltLength(BoltGroup bg, string customKey)
        {
            // Only a real bolt-length report property is accepted. CutLength is NOT the bolt length,
            // so it is never used as a guess (accuracy first): a missing length is reported as a warning.
            var keys = new List<string>();
            if (!string.IsNullOrEmpty(customKey)) keys.Add(customKey);
            foreach (string k in LengthKeys) if (!keys.Contains(k)) keys.Add(k);
            foreach (string k in keys)
            {
                try { double v = 0; if (bg.GetReportProperty(k, ref v) && v > 0) return v; } catch { }
            }
            return 0;
        }

        static readonly string[] LengthKeys = { "LENGTH", "BOLT_LENGTH", "BOLT_LENGTH_CALC", "BOLT_LENGTH_USER" };

        /// <summary>Connection test + shows which report property gives the bolt length in YOUR environment.</summary>
        public static void Diagnose(Action<string> log)
        {
            var model = new Model();
            if (!model.GetConnectionStatus()) { log("Tekla Structures is not running or no model is open."); return; }
            log("Connected. Model: " + SafeStr(delegate { return model.GetInfo().ModelName; }));
            var selector = model.GetModelObjectSelector();
            int nBeam = 0, nPlate = 0, nBolt = 0;
            ModelObjectEnumerator e = selector.GetAllObjectsWithType(ModelObject.ModelObjectEnum.BEAM); while (e.MoveNext()) nBeam++;
            e = selector.GetAllObjectsWithType(ModelObject.ModelObjectEnum.CONTOURPLATE); while (e.MoveNext()) nPlate++;
            e = selector.GetAllObjectsWithType(ModelObject.ModelObjectEnum.BOLT_ARRAY); while (e.MoveNext()) nBolt++;
            log("Beams/columns: " + nBeam + "   Plates: " + nPlate + "   Bolt arrays: " + nBolt);

            BoltGroup bg = null;
            ModelObjectEnumerator sel = new TSMUI.ModelObjectSelector().GetSelectedObjects();
            while (sel.MoveNext()) { bg = sel.Current as BoltGroup; if (bg != null) break; }
            if (bg == null) { e = selector.GetAllObjectsWithType(ModelObject.ModelObjectEnum.BOLT_ARRAY); if (e.MoveNext()) bg = e.Current as BoltGroup; }
            if (bg == null) { log("No bolt group found (select one bolt in Tekla and try again)."); return; }

            log("Bolt group: size=" + bg.BoltSize.ToString(Inv) + "  standard=" + bg.BoltStandard + "  positions=" + (bg.BoltPositions != null ? bg.BoltPositions.Count : 0));
            string[] cands = { "LENGTH", "BOLT_LENGTH", "BOLT_LENGTH_CALC", "BOLT_LENGTH_USER", "BOLT_SIZE", "BOLT_STANDARD" };
            foreach (string k in cands)
            {
                double v = 0; bool ok = false;
                try { ok = bg.GetReportProperty(k, ref v); } catch { }
                log("  " + k + " -> " + (ok ? v.ToString(Inv) : "n/a"));
            }
            log("  (info only) CutLength = " + SafeStr(delegate { return bg.CutLength.ToString(Inv); }));
            log("Use the property that returns the bolt length (e.g. 100) in the 'bolt length property' box.");
        }

        /// <summary>Tekla grid string: "0.0 3*6000 4500" = cumulative distances; "n*v" repeats v n times.</summary>
        static List<double> ParseCoords(string s)
        {
            var res = new List<double>(); double cur = 0;
            if (string.IsNullOrWhiteSpace(s)) return res;
            foreach (string tok in s.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries))
            {
                try
                {
                    int rep = 1; string numTxt = tok; int star = tok.IndexOf('*');
                    if (star > 0) { rep = int.Parse(tok.Substring(0, star), Inv); numTxt = tok.Substring(star + 1); }
                    double d = double.Parse(numTxt, NumberStyles.Float, Inv);
                    for (int i = 0; i < rep; i++) { cur += d; res.Add(cur); }
                }
                catch { }
            }
            return res;
        }

        static void AddGrid(List<GridLine> list, string coords, string labels, bool isLevel)
        {
            List<double> vs = ParseCoords(coords);
            string[] ls = string.IsNullOrWhiteSpace(labels) ? new string[0] : labels.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i < vs.Count; i++)
            {
                string name = i < ls.Length ? ls[i] : (isLevel ? FmtLevel(vs[i]) : (i + 1).ToString(Inv));
                list.Add(new GridLine { N = name, V = vs[i] });
            }
        }

        static string FmtLevel(double mm) { return (mm < 0 ? "-" : "+") + (Math.Abs(mm) / 1000.0).ToString("0.000", Inv); }

        static string GridJson(List<GridLine> l)
        {
            var sb = new StringBuilder("[");
            for (int i = 0; i < l.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append("{\"n\":").Append(Q(l[i].N)).Append(",\"v\":").Append(N(l[i].V, 0)).Append('}');
            }
            return sb.Append(']').ToString();
        }

        static string SafeStr(Func<string> f) { try { return f() ?? ""; } catch { return ""; } }

        static string N(double v, int dec)
        {
            if (double.IsNaN(v) || double.IsInfinity(v)) v = 0;
            return Math.Round(v, dec).ToString(dec == 0 ? "0" : "0." + new string('#', dec), Inv);
        }

        static string Q(string s)
        {
            if (s == null) return "\"\"";
            var sb = new StringBuilder("\"");
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4")); else sb.Append(c);
                        break;
                }
            }
            return sb.Append('"').ToString();
        }
    }
}
