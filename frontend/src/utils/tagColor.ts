// 标签徽标颜色池（图一：蓝/紫/绿/橙），按名称稳定散列
const TAG_COLORS = ['#007aff', '#8b5cf6', '#34c759', '#ff9500']

export function tagColor(label: string): string {
  let h = 0
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TAG_COLORS[h % TAG_COLORS.length]
}
