<#
.SYNOPSIS
  本地开发一键启动（前端 Vite Dev Server + 后端 Go 服务）
.DESCRIPTION
  同时拉起前后端：前端 http://localhost:5173，后端 http://localhost:8200。
  所有开发运行时产物（后端状态文件 tm-state.json、前后端日志）统一写入
  项目根 dev/ 目录，避免污染代码目录。
  -mock 额外启动 Transmission mock（:9092）并把后端指向它；切回真实远端时
  去掉 -mock，并在设置里把连接地址改回真实 Transmission。
#>
param(
    [switch]$bg,    # 后台模式：启动后立即返回，不占用终端（日志写入 dev/logs/）
    [switch]$mock   # 同时启动 Transmission mock（:9092）并把后端指向它
)

$ErrorActionPreference = "Stop"

$Root    = $PSScriptRoot
$DevDir  = Join-Path $Root "dev"
$DataDir = Join-Path $DevDir "data"
$LogDir  = Join-Path $DevDir "logs"
$AirDir  = Join-Path $DevDir "air"   # air 热重载的构建输出目录
$null    = New-Item -ItemType Directory -Force -Path $DataDir, $LogDir, $AirDir

$BackendLog  = Join-Path $LogDir "backend.log"
$FrontendLog = Join-Path $LogDir "frontend.log"

Write-Host "[dev] 开发产物目录: $DevDir"              -ForegroundColor Cyan
Write-Host "[dev]   后端状态文件 -> $DataDir"         -ForegroundColor DarkGray
Write-Host "[dev]   后端日志     -> $BackendLog"      -ForegroundColor DarkGray
Write-Host "[dev]   前端日志     -> $FrontendLog"     -ForegroundColor DarkGray

# 后端运行时数据（tm-state.json / .env.local 等）写入 dev/data，而非代码目录
$env:TM_DATA_DIR = $DataDir

# Mock Transmission（可选）：-mock 时拉起 trmock 并用 TR_URL 把后端指向它
$MockLog = Join-Path $LogDir "mock.log"
$mockProcess = $null
if ($mock) {
    $env:TR_URL = "http://localhost:9092/transmission/rpc"
    Write-Host "[dev] Mock Transmission: $($env:TR_URL) （日志 $MockLog）" -ForegroundColor DarkGray
    $mockProcess = Start-Process -WindowStyle Hidden -FilePath "cmd.exe" `
        -WorkingDirectory (Join-Path $Root "backend") `
        -ArgumentList "/c", "go run ./cmd/trmock > `"$MockLog`" 2>&1" `
        -PassThru
}

# 后端：装了 air 则启用热重载（.go 变更自动重编译重启），否则回退 go run
$backendCmd = if (Get-Command air -ErrorAction SilentlyContinue) {
    Write-Host "[dev] 后端热重载：air（.go 变更自动重编译重启）"    -ForegroundColor DarkGray
    "air > `"$BackendLog`" 2>&1"
} else {
    Write-Host "[dev] 未检测到 air，后端改动需手动重启"             -ForegroundColor Yellow
    Write-Host "[dev]   安装：go install github.com/air-verse/air@latest" -ForegroundColor Yellow
    "go run ./cmd/server > `"$BackendLog`" 2>&1"
}

# 说明：Start-Process 不允许 stdout/stderr 重定向到同一文件，故经 cmd /c 合并重定向
$backend = Start-Process -WindowStyle Hidden -FilePath "cmd.exe" `
    -WorkingDirectory (Join-Path $Root "backend") `
    -ArgumentList "/c", $backendCmd `
    -PassThru

$frontend = Start-Process -WindowStyle Hidden -FilePath "cmd.exe" `
    -WorkingDirectory (Join-Path $Root "frontend") `
    -ArgumentList "/c", "pnpm dev > `"$FrontendLog`" 2>&1" `
    -PassThru

if ($mockProcess) {
    Write-Host "[dev] 已启动  后端 PID=$($backend.Id)  前端 PID=$($frontend.Id)  Mock PID=$($mockProcess.Id)" -ForegroundColor Green
    Write-Host "[dev]   Mock RPC -> http://localhost:9092/transmission/rpc" -ForegroundColor DarkGray
} else {
    Write-Host "[dev] 已启动  后端 PID=$($backend.Id)  前端 PID=$($frontend.Id)" -ForegroundColor Green
}
Write-Host "[dev] 前端 http://localhost:5173   后端 http://localhost:8200"    -ForegroundColor Green
if ($bg) {
    Write-Host "[dev] 后台模式已启动，日志见 dev/logs/" -ForegroundColor Green
    exit
}

Write-Host "[dev] 按 Ctrl+C 退出（将同时结束前后端进程）"                     -ForegroundColor Yellow

try {
    while (-not $backend.HasExited -and -not $frontend.HasExited) {
        Start-Sleep -Seconds 1
    }
} finally {
    # cmd.exe 是父进程，需连同子进程树一起结束
    if ($mockProcess) { & taskkill /PID $mockProcess.Id /T /F 2>$null }
    & taskkill /PID $backend.Id  /T /F 2>$null
    & taskkill /PID $frontend.Id /T /F 2>$null
    Write-Host "[dev] 已停止前后端进程" -ForegroundColor Cyan
}
