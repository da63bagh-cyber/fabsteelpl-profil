@echo off
rem Quick test without building an exe
cd /d "%~dp0"
call npm install
call npm start
