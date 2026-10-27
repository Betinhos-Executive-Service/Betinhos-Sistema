@echo off
"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-webresource.ps1" -DeviceCode %*
exit /b %ERRORLEVEL%
