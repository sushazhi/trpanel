// Transmission 返回的 errorString 是英文原文（"Tracker did not respond" 等），
// 这里按常见文案映射成 i18n key；未命中时原样返回，避免吞掉未知错误。
interface ErrorRule {
  re: RegExp
  key: string
  params?: (m: RegExpExecArray) => Record<string, string>
}

// 顺序敏感：具体规则在前，兜底规则在后
const RULES: ErrorRule[] = [
  { re: /^tracker did not respond\.?$/i, key: 'errors.trackerNoResponse' },
  {
    re: /^tracker (?:gave|returned) (?:an )?error:\s*(.+)$/i,
    key: 'errors.trackerError',
    params: (m) => ({ msg: m[1].trim() }),
  },
  {
    re: /^tracker (?:gave|returned) (?:a )?warning:\s*(.+)$/i,
    key: 'errors.trackerWarning',
    params: (m) => ({ msg: m[1].trim() }),
  },
  {
    re: /^tracker gave http response code (\d+)/i,
    key: 'errors.trackerHttp',
    params: (m) => ({ code: m[1] }),
  },
  // 完整句式（Transmission 会附带"设置位置/校验本地数据"的操作指引），需整句替换
  {
    re: /^no data found!?\s*ensure your drives are connected/i,
    key: 'errors.noDataFoundHint',
  },
  // 兜底：只要以 "No data found!" 开头就翻译，避免后半句文案变化导致漏翻
  { re: /^no data found!?/i, key: 'errors.noDataFound' },
  { re: /couldn'?t connect to server/i, key: 'errors.connectFailed' },
  { re: /connection refused/i, key: 'errors.connectionRefused' },
  { re: /\btimed? ?out\b|\btimeout\b/i, key: 'errors.timeout' },
  { re: /no space left on device/i, key: 'errors.noSpace' },
  { re: /permission denied/i, key: 'errors.permissionDenied' },
  { re: /too many open files/i, key: 'errors.tooManyFiles' },
  { re: /unable to save resume file/i, key: 'errors.saveResumeFailed' },
  { re: /unable to save .*file/i, key: 'errors.saveFileFailed' },
  { re: /invalid (?:argument|data|metadata|torrent)/i, key: 'errors.invalidData' },
  {
    re: /^error:\s*(.+)$/i,
    key: 'errors.genericError',
    params: (m) => ({ msg: m[1].trim() }),
  },
]

/**
 * 把后端返回的英文错误文案翻译成当前语言。
 * @param errorString 原始 errorString（可能为空）
 * @param t i18n 翻译函数
 */
export function translateError(
  errorString: string | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (!errorString) return ''
  for (const rule of RULES) {
    const m = rule.re.exec(errorString)
    if (m) return t(rule.key, rule.params?.(m))
  }
  return errorString
}
