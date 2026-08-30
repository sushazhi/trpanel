// 标签徽标颜色池，按名称稳定散列。
// 只引用 styles/index.css 的 --hue-* 分类色相：色值不再有两份真相，
// 而且刻意不复用 --color-status-*，免得一个标签看起来像一个状态。
const TAG_COLORS = ['var(--hue-blue)', 'var(--hue-purple)', 'var(--hue-green)', 'var(--hue-orange)']

export function tagColor(label: string): string {
  let h = 0
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TAG_COLORS[h % TAG_COLORS.length]
}
