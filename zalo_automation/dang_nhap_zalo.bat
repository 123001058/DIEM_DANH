@echo off
chcp 65001 > nul
title Đăng nhập Zalo Bot — Robocon LH-NaviX
echo ===================================================
echo 🤖 ĐANG CÀI ĐẶT THƯ VIỆN & KHỞI TẠO ZALO BOT...
echo ===================================================
cd /d "%~dp0"

echo 📦 Đang tải các thư viện cần thiết...
call npm install

echo 🚀 Đang khởi động mã QR đăng nhập Zalo...
node login.js

pause
