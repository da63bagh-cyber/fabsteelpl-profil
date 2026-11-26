using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace FabSteelExport
{
    /// <summary>Small window: choose file, press Export. Needs Tekla Structures 2024 open with a model.</summary>
    public class MainForm : Form
    {
        readonly TextBox txtPath = new TextBox();
        readonly CheckBox chkSel = new CheckBox();
        readonly CheckBox chkBolts = new CheckBox();
        readonly CheckBox chkGz = new CheckBox();
        readonly TextBox txtBoltProp = new TextBox();
        readonly TextBox txtLog = new TextBox();
        readonly Button btnExport = new Button();

        public MainForm()
        {
            Text = "FabSteel Export — Tekla 2024 → .fabsteel";
            Font = new Font("Segoe UI", 9.5f);
            RightToLeft = RightToLeft.Yes; RightToLeftLayout = true;
            ClientSize = new Size(640, 512);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(20, 22, 28); ForeColor = Color.White;

            var lblTitle = new Label { Text = "FabSteel Structural Installer — خروجی از تکلا", Font = new Font("Segoe UI", 12f, FontStyle.Bold), ForeColor = Color.FromArgb(255, 170, 40), Left = 12, Top = 10, Width = 616, Height = 28 };
            var lblPath = new Label { Text = "فایل خروجی (.fabsteel):", Left = 12, Top = 48, Width = 616, Height = 20 };
            txtPath.SetBounds(100, 70, 528, 26); txtPath.RightToLeft = RightToLeft.No;
            var btnBrowse = new Button { Text = "...", Left = 12, Top = 69, Width = 80, Height = 28 };
            btnBrowse.Click += delegate
            {
                using (var d = new SaveFileDialog { Filter = "FabSteel (*.fabsteel)|*.fabsteel", FileName = Path.GetFileName(txtPath.Text) })
                    if (d.ShowDialog() == DialogResult.OK) txtPath.Text = d.FileName;
            };

            chkSel.Text = "فقط قطعات انتخاب‌شده در تکلا"; chkSel.SetBounds(12, 108, 616, 22);
            chkBolts.Text = "پیچ و مهره را هم خروجی بگیر"; chkBolts.Checked = true; chkBolts.SetBounds(12, 132, 616, 22);
            chkGz.Text = "فشرده‌سازی (gzip) — حجم کم برای ارسال"; chkGz.Checked = true; chkGz.SetBounds(12, 156, 616, 22);

            var lblProp = new Label { Text = "نام خصوصیت گزارش تکلا برای «طول پیچ»:", Left = 12, Top = 188, Width = 400, Height = 20 };
            txtBoltProp.SetBounds(420, 185, 208, 26); txtBoltProp.Text = "LENGTH"; txtBoltProp.RightToLeft = RightToLeft.No;

            btnExport.Text = "▶ خروجی بگیر"; btnExport.SetBounds(12, 254, 616, 40);
            btnExport.BackColor = Color.FromArgb(255, 154, 31); btnExport.ForeColor = Color.Black; btnExport.FlatStyle = FlatStyle.Flat;
            btnExport.Font = new Font("Segoe UI", 11f, FontStyle.Bold);
            btnExport.Click += OnExport;

            txtLog.Multiline = true; txtLog.ReadOnly = true; txtLog.ScrollBars = ScrollBars.Vertical; txtLog.RightToLeft = RightToLeft.No;
            txtLog.SetBounds(12, 306, 616, 196); txtLog.BackColor = Color.FromArgb(10, 12, 16); txtLog.ForeColor = Color.FromArgb(190, 230, 190);
            txtLog.Font = new Font("Consolas", 9f);

            var btnDiag = new Button { Text = "تشخیص / تست اتصال به تکلا", Left = 12, Top = 218, Width = 616, Height = 28 };
            btnDiag.Click += delegate
            {
                txtLog.Clear();
                try { Exporter.Diagnose(Log); }
                catch (Exception ex) { Log("ERROR: " + ex.Message); }
            };

            Controls.AddRange(new Control[] { lblTitle, lblPath, txtPath, btnBrowse, chkSel, chkBolts, chkGz, lblProp, txtBoltProp, btnDiag, btnExport, txtLog });
            txtPath.Text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "FabSteel", "project.fabsteel");
        }

        void Log(string s) { txtLog.AppendText(s + Environment.NewLine); Application.DoEvents(); }

        void OnExport(object sender, EventArgs e)
        {
            btnExport.Enabled = false; Cursor = Cursors.WaitCursor; txtLog.Clear();
            try
            {
                var opt = new ExportOptions { OnlySelected = chkSel.Checked, IncludeBolts = chkBolts.Checked, Gzip = chkGz.Checked, BoltLengthProperty = txtBoltProp.Text.Trim() };
                ExportResult r = Exporter.Run(txtPath.Text, opt, Log);
                Log("");
                Log("OK  parts=" + r.Parts + "  bolt groups=" + r.Bolts + "  grid X/Y=" + r.GridX + "/" + r.GridY + "  levels=" + r.Levels);
                foreach (string w in r.Warnings) Log("WARNING: " + w);
                Log("Open the file in FabSteel Structural Installer (Windows) to test, then send it to the Android app.");
            }
            catch (Exception ex)
            {
                Log("ERROR: " + ex.Message);
                MessageBox.Show(ex.Message, "FabSteel Export", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally { Cursor = Cursors.Default; btnExport.Enabled = true; }
        }
    }
}
