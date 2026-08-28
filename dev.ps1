<#
.SYNOPSIS
  本地开发一键启动（前端 Vite Dev Server + 后端 Go 服务）
.DESCRIPTION
  同时拉起前后端：前端 http://localhost:5173，后端 http://localhost:8080。
  所有开发运行时产物（后端状态文件 tm-state.json、前后端日志）统一写入
  项目根 dev/ 目录，避免污染代码目录。
#>
param(
    [switch]$bg  # 后台模式：启动后立即返回，不占用终端（日志写入 dev/logs/）
)

$ErrorActionPreference = "Stop"

$Root    = $PSScriptRoot
$DevDir  = Join-Path $Root "dev"
$DataDir = Join-Path $DevDir "data"
$LogDir  = Join-Path $DevDir "logs"
$null    = New-Item -ItemType Directory -Force -Path $DataDir, $LogDir

$BackendLog  = Join-Path $LogDir "backend.log"
$FrontendLog = Join-Path $LogDir "frontend.log"

Write-Host "[dev] 开发产物目录: $DevDir"              -ForegroundColor Cyan
Write-Host "[dev]   后端状态文件 -> $DataDir"         -ForegroundColor DarkGray
Write-Host "[dev]   后端日志     -> $BackendLog"      -ForegroundColor DarkGray
Write-Host "[dev]   前端日志     -> $FrontendLog"     -ForegroundColor DarkGray

# 后端运行时数据（tm-state.json / .env.local 等）写入 dev/data，而非代码目录
$env:TM_DATA_DIR = $DataDir

# 说明：Start-Process 不允许 stdout/stderr 重定向到同一文件，故经 cmd /c 合并重定向
$backend = Start-Process -WindowStyle Hidden -FilePath "cmd.exe" `
    -WorkingDirectory (Join-Path $Root "backend") `
    -ArgumentList "/c", "go run ./cmd/server > `"$BackendLog`" 2>&1" `
    -PassThru

$frontend = Start-Process -WindowStyle Hidden -FilePath "cmd.exe" `
    -WorkingDirectory (Join-Path $Root "frontend") `
    -ArgumentList "/c", "pnpm dev > `"$FrontendLog`" 2>&1" `
    -PassThru

Write-Host "[dev] 已启动  后端 PID=$($backend.Id)  前端 PID=$($frontend.Id)" -ForegroundColor Green
Write-Host "[dev] 前端 http://localhost:5173   后端 http://localhost:8080"    -ForegroundColor Green
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
    & taskkill /PID $backend.Id  /T /F 2>$null
    & taskkill /PID $frontend.Id /T /F 2>$null
    Write-Host "[dev] 已停止前后端进程" -ForegroundColor Cyan
}
