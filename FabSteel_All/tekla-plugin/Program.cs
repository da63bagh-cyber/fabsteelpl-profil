using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

namespace FabSteelExport
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            // The exe can live anywhere (e.g. C:\FabSteel\Export): Tekla's DLLs are loaded
            // from the running Tekla's bin folder, so the versions always match.
            AppDomain.CurrentDomain.AssemblyResolve += ResolveTekla;
            Application.ThreadException += (s, e) => MessageBox.Show(e.Exception.ToString(), "FabSteel Export", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }

        private static Assembly ResolveTekla(object sender, ResolveEventArgs args)
        {
            string name = new AssemblyName(args.Name).Name;
            if (!name.StartsWith("Tekla.", StringComparison.OrdinalIgnoreCase)) return null;
            foreach (string dir in TeklaBinFolders())
            {
                string f = Path.Combine(dir, name + ".dll");
                if (File.Exists(f)) { try { return Assembly.LoadFrom(f); } catch { } }
            }
            return null;
        }

        private static IEnumerable<string> TeklaBinFolders()
        {
            var list = new List<string>();
            try
            {
                foreach (Process p in Process.GetProcessesByName("TeklaStructures"))
                {
                    try { string d = Path.GetDirectoryName(p.MainModule.FileName); if (!list.Contains(d)) list.Add(d); } catch { }
                }
            }
            catch { }
            string env = Environment.GetEnvironmentVariable("FABSTEEL_TEKLA_BIN");
            if (!string.IsNullOrEmpty(env)) list.Add(env);
            list.Add(@"C:\Program Files\Tekla Structures\2024.0\bin");
            list.Add(@"D:\Program Files\Tekla Structures\2024.0\bin");
            return list;
        }
    }
}
