#Requires -Version 5.1
<#
.SYNOPSIS
  启动 KCQ 只读分析服务（analytics serve，默认端口 8093）。

.DESCRIPTION
  端口已被占用时明确报错并打印占用进程，不静默失败；
  用隐藏窗口启动，不阻塞调用方；启动后轮询接口直到就绪。

.PARAMETER Port
  服务端口，默认 8093。

.PARAMETER DataRoot
  数据根目录，默认 K:/analytics（NAS 共享）。

.PARAMETER RepoRoot
  仓库根目录，默认由脚本位置推导。
#>
param(
  [int]$Port = 8093,
  [string]$DataRoot = 'K:/analytics',
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($null -ne $listener) {
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue |
    Select-Object -First 1
  $commandLine = if ($null -ne $owner) { $owner.CommandLine } else { '(command line unavailable)' }
  Write-Host "端口 $Port 已被占用：PID $($listener.OwningProcess)"
  Write-Host "占用进程：$commandLine"
  exit 2
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$node = if ($null -ne $nodeCommand) { $nodeCommand.Source } else { $null }
if ([string]::IsNullOrEmpty($node)) {
  Write-Host '找不到 node：请安装 Node 并把它的目录加入 PATH'
  exit 3
}

$tsx = Join-Path $RepoRoot 'node_modules/tsx/dist/cli.mjs'
if (-not (Test-Path $tsx)) {
  Write-Host "缺少 tsx：$tsx（先在仓库根执行 pnpm install）"
  exit 4
}

$arguments = @($tsx, 'packages/analytics/src/cli.ts', 'serve', '--root', $DataRoot, '--port', $Port)
$process = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $RepoRoot -WindowStyle Hidden -PassThru

$url = "http://127.0.0.1:$Port/options/series?currency=BTC&limit=1"
for ($attempt = 1; $attempt -le 30; $attempt++) {
  Start-Sleep -Seconds 1
  try {
    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null
    # tsx 会再起一个子进程，监听端口的是子进程：报真实监听者，报启动器 PID 没有意义。
    $owner = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -First 1
    $listeningPid = if ($null -ne $owner) { $owner.OwningProcess } else { $process.Id }
    Write-Host "已就绪：http://127.0.0.1:$Port（监听 PID $listeningPid，数据根 $DataRoot）"
    exit 0
  } catch {
    # 还没起来，继续等下一次
  }
}

Write-Host "启动超时：30 秒内 $url 未就绪（PID $($process.Id) 仍在运行）"
exit 5
