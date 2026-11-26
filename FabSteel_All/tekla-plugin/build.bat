@echo off
rem FabSteel Export - build (needs .NET SDK 6+ or Visual Studio 2022; first build needs internet for NuGet reference assemblies)
rem Usage: build.bat                     (Tekla in C:\Program Files\Tekla Structures\2024.0\bin)
rem        build.bat "D:\Tekla\2024.0\bin"
setlocal
cd /d "%~dp0"
set TBIN=%~1
if "%TBIN%"=="" set TBIN=C:\Program Files\Tekla Structures\2024.0\bin
if not exist "%TBIN%\Tekla.Structures.Model.dll" (
  echo Tekla.Structures.Model.dll not found in "%TBIN%"
  echo Run:  build.bat "path\to\Tekla Structures\2024.0\bin"
  pause & exit /b 1
)
where dotnet >nul 2>nul
if errorlevel 1 (
  echo dotnet SDK not found. Install ".NET SDK" or open FabSteelExport.csproj in Visual Studio 2022 and Build ^> Release.
  pause & exit /b 1
)
dotnet build FabSteelExport.csproj -c Release -o dist -p:TeklaBin="%TBIN%"
if errorlevel 1 ( echo BUILD FAILED - send the error text above to Claude. & pause & exit /b 1 )
echo.
echo OK: dist\FabSteelExport.exe  - now run install.bat
pause
