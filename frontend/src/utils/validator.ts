// 常用输入校验函数

// 判断是否为磁力链接
export function isMagnetLink(input: string): boolean {
  return /^magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}/i.test(input.trim())
}

// 判断是否为合法的 HTTP/HTTPS URL
export function isUrl(input: string): boolean {
  try {
    const u = new URL(input.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'ftp:'
  } catch {
    return false
  }
}

// 判断是否为安全的文件/目录路径（禁止空、绝对路径逃逸、特殊字符）
export function isSafePath(input: string): boolean {
  const v = input.trim()
  if (!v || v.length > 1024) return false
  // 禁止绝对路径与路径穿越
  if (v.startsWith('/') || v.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(v)) return false
  if (v.includes('..')) return false
  // 禁止控制字符与危险符号
  if (/[\u0000-\u001f\u007f]/.test(v)) return false
  if (/[<>:"|?*]/.test(v)) return false
  return true
}

// 判断是否为正数（限速等数值输入）
export function isPositiveNumber(input: string): boolean {
  const n = Number(input)
  return isFinite(n) && n > 0
}
