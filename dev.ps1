<#
.SYNOPSIS
  本地开发一键启动（前端 Vite Dev Server + 后端 Go 服务），保证前端热更新可用
.DESCRIPTION
  同时拉起前后端：前端 http://localhost:5173（HMR 实时热更），后端 http://localhost:8200。
  所有开发运行时产物（后端状态文件 tm-state.json、前后端日志）统一写入
  项目根 dev/ 目录，避免污染代码目录。
  -mock 额外启动 Transmission mock（:9092）并把后端指向它；切回真实远端时
  去掉 -mock，并在设置里把连接地址改回真实 Transmission。
  -stop 停掉占用 5173/8200（含 -mock 时 9092）的现有进程后退出。

  热更新保证：
  1. 启动前检查端口，被旧实例占用时直接报错退出（vite strictPort 下新进程
     会静默失败，继续访问的将是不热更的旧实例），提示先 -stop 清理；
  2. 清除 DEV_NO_HMR 环境变量（vite.config 据此关闭 HMR）；
  3. 启动后探测 http://localhost:5173/@vite/client —— 这是 Vite HMR 客户端，
     返回 200 才算前端就绪，否则打印日志末尾并以非零码退出。

  注意：调试入口必须用 5173。8200 上是 go:embed 打包进二进制的前端快照，
  改前端源码不会出现在那里。
#>
param(
    [switch]$bg,    # 后台模式：启动后立即返回，不占用终端（日志写入 dev/logs/）
    [switch]$mock,  # 同时启动 Transmission mock（:9092）并把后端指向它
    [switch]$stop   # 停掉占用开发端口的现有进程后退出
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

function Get-ListenerPid([int]$Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($conn) { return $conn.OwningProcess }
    return $null
}

$devPorts = @(5173, 8200)
if ($mock) { $devPorts += 9092 }

if ($stop) {
    foreach ($port in $devPorts) {
        $ownerPid = Get-ListenerPid $port
        if ($ownerPid) {
            $name = (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue).ProcessName
            Write-Host "[dev] 停止占用 ${port} 端口的进程 PID=$ownerPid ($name)" -ForegroundColor Yellow
            & taskkill /PID $ownerPid /T /F 2>$null
        }
    }
    Write-Host "[dev] 清理完成" -ForegroundColor Cyan
    exit
}

# 启动前端口预检：端口被占则新进程会静默失败（strictPort），必须先清理
foreach ($port in $devPorts) {
    $ownerPid = Get-ListenerPid $port
    if ($ownerPid) {
        $name = (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue).ProcessName
        Write-Host "[dev] 端口 $port 已被 PID=$ownerPid ($name) 占用，拒绝启动。" -ForegroundColor Red
        Write-Host "[dev] 旧实例不会热更新新代码。先执行  .\dev.ps1 -stop  清理，再重新启动。" -ForegroundColor Yellow
        exit 1
    }
}

# 热更新保证：清掉任何禁用 HMR 的环境变量（vite.config 见 DEV_NO_HMR=1 会关 HMR）
Remove-Item Env:DEV_NO_HMR -ErrorAction SilentlyContinue

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

# 就绪探测：前端必须等到 HMR 客户端可访问，后端等到 HTTP 可达；失败打印日志末尾
function Wait-Http([string]$Url, [int]$TimeoutSec, [string]$Name, [string]$LogFile) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $code = & curl.exe -s -o NUL -w '%{http_code}' --max-time 2 $Url 2>$null
        if ($code -match '^\d{3}$' -and $code -ne '000') { return $true }
        Start-Sleep -Milliseconds 500
    }
    Write-Host "[dev] $Name 未就绪：$Url。日志末尾：" -ForegroundColor Red
    if (Test-Path $LogFile) {
        Get-Content $LogFile -Tail 15 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    }
    return $false
}

$frontOk  = Wait-Http 'http://localhost:5173/@vite/client' 30 '前端 Vite（HMR 客户端）' $FrontendLog
$backOk   = Wait-Http 'http://localhost:8200/'             30 '后端'                    $BackendLog

if (-not ($frontOk -and $backOk)) {
    & taskkill /PID $backend.Id  /T /F 2>$null
    & taskkill /PID $frontend.Id /T /F 2>$null
    if ($mockProcess) { & taskkill /PID $mockProcess.Id /T /F 2>$null }
    Write-Host "[dev] 启动失败，已回滚本次拉起的进程。" -ForegroundColor Red
    exit 1
}

Write-Host "[dev] 前端 http://localhost:5173 （HMR 已就绪，调试入口用这个）" -ForegroundColor Green
Write-Host "[dev] 后端 http://localhost:8200 （API 专用；其前端是打包快照，不热更）" -ForegroundColor Green
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
