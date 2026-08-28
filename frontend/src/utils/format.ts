import dayjs from 'dayjs'

// 格式化字节数为可读单位
export function formatBytes(bytes: number, decimal = 2): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / Math.pow(1024, i)
  return `${i === 0 ? val.toFixed(0) : val.toFixed(decimal)} ${units[i]}`
}

// 格式化速度
export function formatSpeed(bytes: number): string {
  return `${formatBytes(bytes)}/s`
}

// 格式化剩余时间（d/h/m/s 通用单位）
export function formatEta(sec: number): string {
  if (!sec || !isFinite(sec) || sec < 0) return '\u221e'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// 格式化分享率（负数表示无限）
export function formatRatio(r: number): string {
  if (!isFinite(r) || r < 0) return '\u221e'
  return r >= 100 ? r.toFixed(0) : r.toFixed(2)
}

// 格式化累计时长（做种时间等，0 或无数据显示 -）
export function formatDuration(sec: number): string {
  if (!sec || sec <= 0 || !isFinite(sec)) return '-'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${Math.floor(sec)}s`
}

// 格式化日期时间戳（秒）
export function formatDate(ts: number, fmt = 'YYYY-MM-DD HH:mm'): string {
  if (!ts) return '-'
  return dayjs(ts * 1000).format(fmt)
}

// 格式化百分比 0~1 → xx.x%
export function formatPercent(p: number, decimal = 1): string {
  return `${(p * 100).toFixed(decimal)}%`
}
