// Tekla Structures 2024 macro: starts the FabSteel Export tool from inside Tekla.
// Install: copy this file to  ...\environments\common\macros\modeling  (install.bat does it).
// In Tekla: Applications & components (Ctrl+F) -> Macros -> FabSteel_Export
using System;
using System.Diagnostics;
using System.IO;

namespace Tekla.Technology.Akit.UserScript
{
    public class Script
    {
        public static void Run(Tekla.Technology.Akit.IScript akit)
        {
            string common = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
            string[] candidates =
            {
                @"C:\FabSteel\Export\FabSteelExport.exe",
                @"D:\FabSteel\Export\FabSteelExport.exe",
                Path.Combine(common, @"FabSteel\Export\FabSteelExport.exe")
            };
            foreach (string c in candidates)
            {
                if (File.Exists(c))
                {
                    Process.Start(new ProcessStartInfo(c) { WorkingDirectory = Path.GetDirectoryName(c), UseShellExecute = true });
                    return;
                }
            }
            System.Windows.Forms.MessageBox.Show(
                "FabSteelExport.exe not found.\nRun install.bat (from the FabSteel package) or copy the exe to C:\\FabSteel\\Export\\",
                "FabSteel Export");
        }
    }
}
