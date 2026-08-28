// 时间处理工具

// 相对时间描述（输入：Unix 秒级时间戳）
export function relativeTime(ts: number): string {
  if (!ts || ts <= 0) return '-'
  const diff = Date.now() / 1000 - ts
  if (diff < 0 || diff < 10) return '刚刚'
  if (diff < 60) return `${Math.floor(diff)} 秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`
  if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))} 个月前`
  return `${Math.floor(diff / (86400 * 365))} 年前`
}

// 获取自该时间戳以来的年龄描述（与 relativeTime 相同语义，供列表"添加时长"使用）
export function getAge(ts: number): string {
  return relativeTime(ts)
}
