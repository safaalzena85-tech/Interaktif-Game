@echo off
chcp 65001 >nul
setlocal
title Quiz Show Pro - Server LAN

rem ============================================================
rem  Quiz Show Pro - jalankan server LAN
rem  Klik dua kali file ini. Jendela ini HARUS tetap terbuka.
rem  Port bisa diganti:  jalankan-server.bat 8080
rem ============================================================

cd /d "%~dp0"

set "PORT=5173"
if not "%~1"=="" set "PORT=%~1"
set "RULENAME=Quiz Show Pro %PORT%"

echo.
echo  ============================================================
echo   QUIZ SHOW PRO - Server LAN   (port %PORT%)
echo  ============================================================
echo.

rem ---- Cari Node.js ----
set "NODE="
where node >nul 2>&1 && set "NODE=node"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE=%LocalAppData%\Programs\nodejs\node.exe"

if not defined NODE (
  echo  [X] Node.js tidak ditemukan.
  echo      Pasang dulu:  winget install OpenJS.NodeJS.LTS
  echo.
  pause
  exit /b 1
)

if not exist "server.js" (
  echo  [X] server.js tidak ada di folder ini:
  echo      %CD%
  echo.
  pause
  exit /b 1
)

rem ---- Buka firewall (butuh izin Administrator / prompt UAC) ----
if /i "%SKIP_FIREWALL%"=="1" goto :afterfw
netsh advfirewall firewall show rule name="%RULENAME%" | findstr /i "Rule Name" >nul 2>&1
if not errorlevel 1 (
  echo  [OK] Firewall sudah mengizinkan port %PORT%.
  goto :afterfw
)
echo  Meminta izin Administrator untuk membuka firewall port %PORT%...
powershell -NoProfile -Command "Start-Process -Verb RunAs -Wait -WindowStyle Hidden -FilePath 'netsh' -ArgumentList 'advfirewall firewall add rule name=\"%RULENAME%\" dir=in action=allow protocol=TCP localport=%PORT% profile=any'" >nul 2>&1
if errorlevel 1 (
  echo  [!] Firewall TIDAK dibuka. Untuk mengizinkan HP, klik kanan file
  echo      izinkan-lan.bat lalu pilih "Run as administrator".
) else (
  echo  [OK] Firewall dibuka untuk port %PORT%.
)
:afterfw

echo.
echo  Alamat untuk HP / tablet / proyektor (WiFi yang sama):
echo  ------------------------------------------------------------
ipconfig | findstr /i "IPv4"
echo  ------------------------------------------------------------
echo   Kontrol / peserta : http://IP-LAPTOP:%PORT%/
echo   Layar tampilan    : http://IP-LAPTOP:%PORT%/display
echo.
echo  Server sedang berjalan - JANGAN tutup jendela ini.
echo  Tekan Ctrl+C untuk menghentikan server.
echo.

"%NODE%" server.js %PORT%

echo.
echo  Server berhenti.
pause
endlocal
