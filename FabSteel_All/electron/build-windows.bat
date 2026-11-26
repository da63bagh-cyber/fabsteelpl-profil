@echo off
rem FAB STEEL VIEWER - build the Windows app (needs Node.js + internet once)
cd /d "%~dp0"
where node >nul 2>nul || ( echo Node.js is not installed. Install the LTS version from https://nodejs.org then run this file again. & pause & exit /b 1 )
call npm install
if errorlevel 1 ( echo npm install failed & pause & exit /b 1 )
call npm run dist
if errorlevel 1 ( echo BUILD FAILED - send the error text above to Claude & pause & exit /b 1 )
echo.
echo Done. Look in the "dist" folder:
echo   FabSteelViewer-1.0.0-portable.exe   (no install, run directly)
echo   FabSteelViewer-1.0.0-nsis.exe       (installer with desktop shortcut)
explorer dist
pause
