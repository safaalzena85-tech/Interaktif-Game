@echo off
chcp 65001 >nul
title Quiz Show Pro - Izinkan akses dari HP (port 5173)

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo  ============================================================
  echo   PERLU HAK ADMINISTRATOR
  echo  ============================================================
  echo   Klik kanan file ini lalu pilih:
  echo      "Run as administrator"
  echo.
  pause
  exit /b 1
)

echo.
echo  Membuka Windows Firewall untuk Quiz Show Pro (TCP 5173)...
netsh advfirewall firewall delete rule name="Quiz Show Pro 5173" >nul 2>&1
netsh advfirewall firewall add rule name="Quiz Show Pro 5173" dir=in action=allow protocol=TCP localport=5173 profile=any
if %errorlevel% neq 0 (
  echo  GAGAL menambah aturan firewall.
) else (
  echo  Berhasil. Port 5173 kini boleh diakses dari perangkat lain.
)

echo.
echo  Alamat IPv4 laptop ini - buka salah satu di HP (WiFi yang sama):
ipconfig | findstr /i "IPv4"
echo.
echo  Contoh: jika IPv4 = 192.168.1.7, ketik di HP:
echo      http://192.168.1.7:5173/
echo.
echo  Pastikan server berjalan:  node server.js 5173
echo.
pause
