Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   DANG TIEN HANH GO BO HOAN TOAN WSL   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/2] Dang go ung dung WSL core..." -ForegroundColor Yellow
wsl --uninstall

Write-Host ""
Write-Host "[2/2] Dang tat tinh nang Windows Subsystem for Linux..." -ForegroundColor Yellow
Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   DA GO BO WSL XONG THANH CONG!        " -ForegroundColor Green
Write-Host "   (Ban co the khoi dong lai may sau)   " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Nhan phim bat ky de dong cua so nay..." -ForegroundColor White
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
