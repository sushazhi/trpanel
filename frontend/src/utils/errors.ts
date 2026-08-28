// 后端/Transmission 错误消息 → 中文提示文案映射

const ERROR_PATTERNS: Array<[RegExp, string]> = [
  [/permission denied|directory is not writable|not writable|无法写入|不可写/i, '目录不可写，请检查权限'],
  [/no space left|not enough space|disk full|空间不足/i, '磁盘空间不足'],
  [/duplicate torrent|already exists|重复添加/i, '种子已存在，请勿重复添加'],
  [/invalid.*torrent|bad torrent|无效的种子|metadata.*invalid/i, '种子文件无效或元数据损坏'],
  [/timeout|timed out|超时/i, '请求超时，请稍后重试'],
  [/connection refused|connect.*failed|无法连接/i, '无法连接到服务端'],
  [/not found|找不到|不存在/i, '资源不存在或已被删除'],
  [/unauthorized|401|未授权/i, '认证失败，请检查用户名密码'],
  [/torrent.*removed|种子已删除/i, '种子已被删除'],
  [/verif|recheck/i, '校验失败，请重新校验'],
  [/invalid.*url|bad url/i, 'URL 无效'],
  [/invalid.*magnet/i, '磁力链接无效'],
  [/too many|limit/i, '超出数量限制'],
]

// 将服务端错误消息翻译为更友好的中文提示（无法识别时返回原样）
export function translateApiError(msg: string): string {
  if (!msg) return msg
  for (const [re, text] of ERROR_PATTERNS) {
    if (re.test(msg)) return text
  }
  return msg
}
