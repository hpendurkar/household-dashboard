@echo off
title Household Dashboard - Local Server
echo.
echo  ============================================
echo   Household Dashboard - Local Web Server
echo  ============================================
echo.
echo  Starting server on port 8080...
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "169.254"') do (
    set IP=%%a
    goto :found
)
:found
set IP=%IP: =%
echo  Access the dashboard at:
echo.
echo    This machine : http://localhost:8080
echo    Local network: http://%IP%:8080
echo.
echo  Press Ctrl+C to stop the server.
echo  ============================================
echo.
python -m http.server 8080
pause
