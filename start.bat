@echo off
echo ====================================
echo 🎮 STARTING TOURNAMENT PLATFORM
echo ====================================
echo.

echo 1. Starting Backend Server...
start cmd /k "cd /d C:\Users\Admin\tournament-app\server && node server.js"

timeout /t 3 /nobreak >nul

echo.
echo 2. Opening Frontend...
start C:\Users\Admin\tournament-app\client\index.html

echo.
echo ✅ Platform started!
echo 📡 Backend: http://localhost:5000
echo 🎮 Frontend: file:///C:/Users/Admin/tournament-app/client/index.html
echo.
pause