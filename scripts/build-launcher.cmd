@echo off
setlocal
cd /d "%~dp0.."
set CSC=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo csc.exe was not found. Install the .NET Framework 4 developer pack.
  exit /b 1
)
if exist assets\devopen-icon-win.ico (
  set ICON=assets\devopen-icon-win.ico
) else (
  set ICON=assets\devopen-icon.ico
)
"%CSC%" /nologo /target:winexe /optimize+ /win32icon:%ICON% /out:IntelliDev.exe scripts\intellidev-launcher.cs
if errorlevel 1 exit /b 1
echo Wrote IntelliDev.exe
