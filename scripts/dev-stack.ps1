#Requires -Version 5.1
<#
.SYNOPSIS
  一键（重新）拉起 KCQ 开发栈：行情后端、前端预览、订单流只读服务。

.DESCRIPTION
  每次运行先清掉旧进程再重新拉起，所以刚改的代码会自动生效，不需要手动关窗口。
  三个服务各自独立：
    - 8091  Binance-Connector（Go）—— 行情
    - 5175  vite dev —— 前端
    - 8093  analytics serve —— 订单流只读服务

  日志统一写到 temp/logs/，出问题时先看那里。

.PARAMETER Action
  restart（默认）  清掉旧进程再拉起
  start            只拉起；端口已被占用时跳过该服务
  stop             只停止，不拉起
  status           只打印状态

.EXAMPLE
  .\scripts\dev-stack.ps1
  .\scripts\dev-stack.ps1 status
  .\scripts\dev-stack.ps1 stop
#>
param(
  [ValidateSet('restart', 'start', 'stop', 'status')]
  [string]$Action = 'restart'
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------

# 仓库根：脚本位于 scripts/ 下，向上一级就是根目录
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ConnectorDir = Join-Path (Split-Path -Parent $RepoRoot) 'Binance-Connector'
$LogDir = Join-Path $RepoRoot 'temp/logs'
$DataRoot = 'K:/analytics'

# Go 不在机器 PATH 里时按安装位置兜底；winget 装完新开终端通常会命中 PATH
$GoCandidates = @(
  'C:\Program Files\Go\bin\go.exe',
  'C:\Program Files (x86)\Go\bin\go.exe'
)

$Services = @(
  @{ Name = 'connector'; Port = 8091; Label = '行情后端 (Binance-Connector)' },
  @{ Name = 'vite';      Port = 5175; Label = '前端预览 (vite)' },
  @{ Name = 'orderflow'; Port = 8093; Label = '订单流服务 (analytics serve)' }
)

# ---------------------------------------------------------------------------
# 输出helper
# ---------------------------------------------------------------------------

function Write-Step([string]$Text) {
  Write-Host "`n>> $Text" -ForegroundColor Cyan
}

function Write-Ok([string]$Text) {
  Write-Host "   OK  $Text" -ForegroundColor Green
}

function Write-Warn2([string]$Text) {
  Write-Host "   !!  $Text" -ForegroundColor Yellow
}

function Write-Fail2([string]$Text) {
  Write-Host "   XX  $Text" -ForegroundColor Red
}

# ---------------------------------------------------------------------------
# 端口与进程
# ---------------------------------------------------------------------------

function Get-PortOwners([int]$Port) {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) { return @() }
  return @($conns | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Stop-PortProcess([int]$Port, [string]$Label) {
  $procIds = Get-PortOwners $Port
  if ($procIds.Count -eq 0) {
    Write-Host "   --  $Label (:${Port}) 未运行"
    return
  }
  foreach ($procId in $procIds) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    $procName = if ($proc) { $proc.ProcessName } else { 'unknown' }
    # /T 连子进程一起结束：vite 与 tsx 都会 spawn 子进程，只杀父进程会留下占端口的孩子
    & taskkill /F /T /PID $procId 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-Ok "已停止 $Label (:${Port}) PID $procId [$procName]"
    } else {
      Write-Warn2 "停止 PID $procId 失败，可能已被其他方式结束"
    }
  }
}

function Wait-PortReleased([int]$Port, [int]$TimeoutSeconds = 10) {
  for ($i = 0; $i -lt ($TimeoutSeconds * 2); $i++) {
    if ((Get-PortOwners $Port).Count -eq 0) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Wait-PortListening([int]$Port, [int]$TimeoutSeconds = 90) {
  for ($i = 0; $i -lt ($TimeoutSeconds * 2); $i++) {
    if ((Get-PortOwners $Port).Count -gt 0) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

# ---------------------------------------------------------------------------
# 依赖检查
# ---------------------------------------------------------------------------

function Resolve-GoBinary {
  $cmd = Get-Command go -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($candidate in $GoCandidates) {
    if (Test-Path $candidate) { return $candidate }
  }
  return $null
}

# ---------------------------------------------------------------------------
# 启动
# ---------------------------------------------------------------------------

function Start-Connector {
  if ((Get-PortOwners 8091).Count -gt 0) {
    Write-Warn2 '行情后端已在运行，跳过'
    return
  }
  if (-not (Test-Path $ConnectorDir)) {
    Write-Fail2 "找不到 Binance-Connector：$ConnectorDir"
    return
  }
  $go = Resolve-GoBinary
  if (-not $go) {
    Write-Fail2 '找不到 go。装法：winget install GoLang.Go，装完重开终端'
    return
  }
  # 国内拉 Go 模块常被墙，一次性配好代理；已是该值时不重复写
  $currentProxy = & $go env GOPROXY 2>$null
  if ($currentProxy -notmatch 'goproxy\.cn') {
    & $go env -w GOPROXY=https://goproxy.cn,direct 2>&1 | Out-Null
    Write-Host '   --  已设置 GOPROXY=https://goproxy.cn,direct'
  }

  $outLog = Join-Path $LogDir 'connector.log'
  $errLog = Join-Path $LogDir 'connector.err.log'
  Start-Process -FilePath $go `
    -ArgumentList 'run', './cmd/binance-connector' `
    -WorkingDirectory $ConnectorDir `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden | Out-Null

  if (Wait-PortListening 8091 120) {
    Write-Ok '行情后端已启动 (:8091)'
  } else {
    Write-Fail2 "行情后端未能在 120 秒内监听 8091，看日志：$errLog"
  }
}

function Start-Vite {
  if ((Get-PortOwners 5175).Count -gt 0) {
    Write-Warn2 '前端预览已在运行，跳过'
    return
  }
  $outLog = Join-Path $LogDir 'vite.log'
  $errLog = Join-Path $LogDir 'vite.err.log'
  Start-Process -FilePath 'pnpm.cmd' `
    -ArgumentList '--filter', '@363045841yyt/klinechart', 'dev' `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden | Out-Null

  if (Wait-PortListening 5175 120) {
    Write-Ok '前端预览已启动 (http://localhost:5175/)'
  } else {
    Write-Fail2 "前端未能在 120 秒内监听 5175，看日志：$errLog"
  }
}

function Start-Orderflow {
  if ((Get-PortOwners 8093).Count -gt 0) {
    Write-Warn2 '订单流服务已在运行，跳过'
    return
  }
  if (-not (Test-Path $DataRoot)) {
    Write-Warn2 "数据目录不可达：$DataRoot（NAS 未挂载？面板会显示连接错误）"
  }
  $outLog = Join-Path $LogDir 'orderflow.log'
  $errLog = Join-Path $LogDir 'orderflow.err.log'
  Start-Process -FilePath 'npx.cmd' `
    -ArgumentList 'tsx', 'packages/analytics/src/cli.ts', 'serve', '--root', $DataRoot, '--port', '8093' `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden | Out-Null

  if (Wait-PortListening 8093 90) {
    Write-Ok '订单流服务已启动 (:8093)'
  } else {
    Write-Fail2 "订单流服务未能在 90 秒内监听 8093，看日志：$errLog"
  }
}

# ---------------------------------------------------------------------------
# 状态
# ---------------------------------------------------------------------------

function Show-Status {
  Write-Step '服务状态'
  foreach ($svc in $Services) {
    $procIds = Get-PortOwners $svc.Port
    if ($procIds.Count -eq 0) {
      Write-Host "   --  $($svc.Label)  :$($svc.Port)  未运行"
      continue
    }
    $procId = $procIds[0]
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    $startedAt = if ($proc) { $proc.StartTime.ToString('HH:mm:ss') } else { '?' }
    Write-Host "   OK  $($svc.Label)  :$($svc.Port)  PID $procId  启动于 $startedAt" -ForegroundColor Green
  }

  # 功能自检比端口更可靠：端口在但服务卡死时能看出来
  try {
    $health = Invoke-WebRequest 'http://127.0.0.1:8093/health' -UseBasicParsing -TimeoutSec 5
    Write-Host "   订单流 /health -> $($health.Content)"
  } catch {
    Write-Host '   订单流 /health -> 无响应'
  }
  try {
    $probe = Invoke-WebRequest 'http://127.0.0.1:8091/api/v1/market-data/sources/binance/probe' -UseBasicParsing -TimeoutSec 8
    Write-Host "   行情 probe -> HTTP $($probe.StatusCode)"
  } catch {
    Write-Host '   行情 probe -> 无响应'
  }

  Write-Host "`n   数据目录 $DataRoot"
  Write-Host "   日志目录 $LogDir"
  Write-Host "   前端地址 http://localhost:5175/"
}

# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

switch ($Action) {
  'stop' {
    Write-Step '停止全部服务'
    foreach ($svc in $Services) { Stop-PortProcess $svc.Port $svc.Label }
    Write-Host ''
  }
  'status' {
    Show-Status
  }
  'start' {
    Write-Step '启动服务'
    Start-Connector
    Start-Vite
    Start-Orderflow
    Show-Status
  }
  'restart' {
    Write-Step '停止旧进程'
    foreach ($svc in $Services) {
      Stop-PortProcess $svc.Port $svc.Label
      if (-not (Wait-PortReleased $svc.Port 10)) {
        Write-Warn2 "端口 $($svc.Port) 10 秒内未释放"
      }
    }
    Write-Step '拉起服务'
    Start-Connector
    Start-Vite
    Start-Orderflow
    Show-Status
  }
}
