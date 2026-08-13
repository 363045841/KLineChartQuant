# SSH 隧道脚本 (Windows PowerShell)
# 使用方法: .\tunnel.ps1 -ServerHost <服务器地址> -ServerUser <用户名>

param(
    [Parameter(Mandatory=$true)]
    [string]$ServerHost,

    [Parameter(Mandatory=$false)]
    [string]$ServerUser = "root"
)

# 配置
$LocalBaostockPort = 8000
$LocalAktoolsPort = 8080

Write-Host "=================================" -ForegroundColor Green
Write-Host "  SSH 隧道连接工具 (Windows)" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Green
Write-Host ""
Write-Host "服务器: $ServerUser@$ServerHost" -ForegroundColor Yellow
Write-Host "本地 Baostock 端口: $LocalBaostockPort" -ForegroundColor Yellow
Write-Host "本地 AKTools 端口: $LocalAktoolsPort" -ForegroundColor Yellow
Write-Host ""

# 检查本地服务
Write-Host "检查本地数据源服务..." -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest -Uri "http://localhost:$LocalBaostockPort" -UseBasicParsing -ErrorAction SilentlyContinue
    Write-Host "✓ Baostock 服务运行正常" -ForegroundColor Green
} catch {
    Write-Host "⚠ 警告: Baostock 服务未在端口 $LocalBaostockPort 运行" -ForegroundColor Yellow
    Write-Host "  请先启动 Baostock 服务: pnpm connecter baostock" -ForegroundColor Gray
}

try {
    $response = Invoke-WebRequest -Uri "http://localhost:$LocalAktoolsPort" -UseBasicParsing -ErrorAction SilentlyContinue
    Write-Host "✓ AKTools 服务运行正常" -ForegroundColor Green
} catch {
    Write-Host "⚠ 警告: AKTools 服务未在端口 $LocalAktoolsPort 运行" -ForegroundColor Yellow
    Write-Host "  请先启动 AKTools 服务: pnpm run aktools" -ForegroundColor Gray
}

Write-Host ""
Write-Host "正在建立 SSH 隧道..." -ForegroundColor Green
Write-Host "提示: 保持此窗口运行，按 Ctrl+C 断开连接" -ForegroundColor Yellow
Write-Host ""

# 建立 SSH 隧道
ssh -R "${LocalBaostockPort}:localhost:${LocalBaostockPort}" `
    -R "${LocalAktoolsPort}:localhost:${LocalAktoolsPort}" `
    -N -T `
    -o "ServerAliveInterval=60" `
    -o "ServerAliveCountMax=3" `
    -o "ExitOnForwardFailure=yes" `
    "${ServerUser}@${ServerHost}"
