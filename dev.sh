#!/usr/bin/env bash
# 本地开发一键启动（前端 Vite Dev Server + 后端 Go 服务）
# 所有开发运行时产物（后端状态文件、前后端日志）统一写入项目根 dev/ 目录，
# 避免污染代码目录。
#
# 用法：
#   ./dev.sh        前台运行，Ctrl+C 一并退出前后端
#   ./dev.sh -bg    后台运行，日志写入 dev/logs/，不占用终端
set -euo pipefail

BG=0
if [ "${1:-}" = "-bg" ]; then
  BG=1
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
DEV_DIR="$ROOT/dev"
DATA_DIR="$DEV_DIR/data"
LOG_DIR="$DEV_DIR/logs"
mkdir -p "$DATA_DIR" "$LOG_DIR"

echo "[dev] 开发产物目录: $DEV_DIR"
echo "[dev]   后端状态文件 -> $DATA_DIR"
echo "[dev]   后端日志     -> $LOG_DIR/backend.log"
echo "[dev]   前端日志     -> $LOG_DIR/frontend.log"

# 依赖检查，避免后台任务静默失败
for cmd in go pnpm; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[dev] 错误：未找到 $cmd，请先安装并加入 PATH" >&2
    exit 1
  fi
done

# 后端运行时数据写入 dev/data，而非代码目录
export TM_DATA_DIR="$DATA_DIR"

( cd "$ROOT/backend"  && go run ./cmd/server ) >"$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

( cd "$ROOT/frontend" && pnpm dev )           >"$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

# go run / pnpm 会派生子进程，仅 kill 直接子 shell 会留下实际服务进程占用端口，
# 因此递归结束整棵进程树（等价于 Windows 的 taskkill /T）
kill_tree() {
  local pid="$1"
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

cleanup() {
  echo "[dev] 停止进程..."
  kill_tree "$BACKEND_PID"
  kill_tree "$FRONTEND_PID"
  wait 2>/dev/null || true
  echo "[dev] 已停止前后端进程"
}

echo "[dev] 已启动 后端PID=$BACKEND_PID 前端PID=$FRONTEND_PID"

if [ "$BG" -eq 0 ]; then
  trap cleanup EXIT INT TERM
  echo "[dev] 前端 http://localhost:5173  后端 http://localhost:8080"
  echo "[dev] 按 Ctrl+C 退出"
  wait
else
  echo "[dev] 前端 http://localhost:5173  后端 http://localhost:8080"
  echo "[dev] 后台模式已启动，日志见 $LOG_DIR"
fi
