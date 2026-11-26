@echo off
rem Installs FabSteelExport.exe to C:\FabSteel\Export and the macro into Tekla 2024 (macro shows in Applications ^& components)
setlocal
cd /d "%~dp0"
if not exist "dist\FabSteelExport.exe" ( echo Run build.bat first. & pause & exit /b 1 )
mkdir "C:\FabSteel\Export" 2>nul
copy /y "dist\FabSteelExport.exe" "C:\FabSteel\Export\" >nul
if exist "dist\FabSteelExport.exe.config" copy /y "dist\FabSteelExport.exe.config" "C:\FabSteel\Export\" >nul
set MAC=%ProgramData%\Trimble\Tekla Structures\2024.0\environments\common\macros\modeling
mkdir "%MAC%" 2>nul
copy /y "macro\FabSteel_Export.cs" "%MAC%\" >nul
echo.
echo Exe   : C:\FabSteel\Export\FabSteelExport.exe
echo Macro : %MAC%\FabSteel_Export.cs
echo.
echo In Tekla: Ctrl+F -^> search "FabSteel" -^> run the macro  (if it is not listed, restart Tekla,
echo or copy the .cs file into the folder set in Settings ^> Advanced options ^> Folders ^> XS_MACRO_DIRECTORY)
pause
