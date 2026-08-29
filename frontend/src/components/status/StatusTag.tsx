import { useTranslation } from 'react-i18next'
import type { Torrent } from '@/types'
import { Badge } from '@/components/ui/badge'
import { translateError } from '@/utils/errorText'

const colorMap: Record<number, string> = {
  0: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  1: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  2: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  3: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  4: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  5: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  6: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  7: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
}

// 状态标签（错误优先显示）
export function StatusTag({ torrent }: { torrent: Torrent }) {
  const { t } = useTranslation()
  if (torrent.error > 0) {
    return (
      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" title={translateError(torrent.errorString, t) || undefined}>
        {t('status.error')}
      </Badge>
    )
  }
  return <Badge className={colorMap[torrent.status] ?? colorMap[0]}>{t(`status.${torrent.status}`)}</Badge>
}

// 纯文本状态
export function StatusText({ torrent }: { torrent: Torrent }) {
  const { t } = useTranslation()
  if (torrent.error > 0) return t('status.error')
  return t(`status.${torrent.status}`)
}
