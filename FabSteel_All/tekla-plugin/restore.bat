@echo off
rem FabSteel - restore the Tekla macro + desktop shortcut (use if FabSteel disappeared from Tekla)
rem Needs: C:\FabSteel\Export\FabSteelExport.exe  (copy it from the dist folder if missing)
setlocal
cd /d "%~dp0"
if not exist "C:\FabSteel\Export\FabSteelExport.exe" (
  if exist "dist\FabSteelExport.exe" ( mkdir "C:\FabSteel\Export" 2>nul & copy /y "dist\FabSteelExport.exe" "C:\FabSteel\Export\" >nul ) else ( echo FabSteelExport.exe not found. Run build.bat first. & pause & exit /b 1 )
)
if not exist "macro\FabSteel_Export.cs" ( echo macro\FabSteel_Export.cs not found next to this file. & pause & exit /b 1 )
set OK=0
for %%V in (2024.0 2024) do (
  set "MAC=%ProgramData%\Trimble\Tekla Structures\%%V\environments\common\macros\modeling"
  call :copy
)
rem also copy to the macro folder Tekla itself is configured with (if set)
if defined XS_MACRO_DIRECTORY (
  for %%D in ("%XS_MACRO_DIRECTORY:;=" "%") do ( if exist %%D\ copy /y "macro\FabSteel_Export.cs" %%D\ >nul & echo Copied to %%D )
)
rem desktop shortcut: works even without the Tekla macro (Tekla must be open with a model)
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\FabSteel Export.lnk'); $s.TargetPath='C:\FabSteel\Export\FabSteelExport.exe'; $s.WorkingDirectory='C:\FabSteel\Export'; $s.Save()"
echo.
echo Done. Desktop shortcut: "FabSteel Export".
echo In Tekla: restart Tekla, press Ctrl+F, type FabSteel_Export  (Macros).
pause
exit /b 0
:copy
mkdir "%MAC%" 2>nul
copy /y "macro\FabSteel_Export.cs" "%MAC%\" >nul && echo Macro copied to %MAC%
exit /b
