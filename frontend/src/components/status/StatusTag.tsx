import { useTranslation } from 'react-i18next'
import type { Torrent } from '@/types'
import { statusColor, statusLabelKey } from '@/utils/status'
import { cssVars } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { translateError } from '@/utils/errorText'

// 状态标签（错误优先显示）
// 色只从 utils/status 来，底/字由 .tm-chip 依据 --chip 现算，
// 不再在这里维护第二张「状态码 → Tailwind 色阶」副本
export function StatusTag({ torrent }: { torrent: Torrent }) {
  const { t } = useTranslation()
  return (
    <Badge
      variant="outline"
      className="tm-chip"
      style={cssVars({ '--chip': statusColor(torrent) })}
      title={torrent.error > 0 ? translateError(torrent.errorString, t) || undefined : undefined}
    >
      {t(statusLabelKey(torrent))}
    </Badge>
  )
}

// 纯文本状态
export function StatusText({ torrent }: { torrent: Torrent }) {
  const { t } = useTranslation()
  return t(statusLabelKey(torrent))
}
