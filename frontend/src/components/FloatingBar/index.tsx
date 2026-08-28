import { useTranslation } from 'react-i18next'
import { FolderOpen, Pause, Play, Plus } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { useTorrentActions } from '@/hooks/useTorrentActions'
import { trimOpenPath } from '@/hooks/useTrimEnv'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

// 悬浮工具条（图一：玻璃胶囊 · 常用操作：添加任务 / 全部开始暂停 / 打开目录）
export function FloatingBar({ isMobile, onOpenAdd }: { isMobile?: boolean; onOpenAdd: () => void }) {
  const { t } = useTranslation()
  const torrents = useAppStore((s) => s.torrents)
  const downloadDir = useAppStore((s) => s.session?.downloadDir)
  const actions = useTorrentActions()

  // 有活动任务（下载/做种中）时显示暂停，否则显示开始
  const hasActive = torrents.some((x) => x.status === 3 || x.status === 4 || x.status === 5 || x.status === 6)

  const openDir = async () => {
    if (!downloadDir) return
    const ok = await trimOpenPath(downloadDir)
    if (!ok) {
      navigator.clipboard?.writeText(downloadDir).catch(() => {})
      toast.info(t('sidebar.openDirFallback', { dir: downloadDir }))
    }
  }

  const item = cn(
    'flex items-center justify-center text-gray-600 dark:text-gray-300 active:scale-95 transition-transform',
    isMobile ? 'h-10 w-10' : 'h-8 w-8',
  )

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 glass-panel-strong rounded-full px-2 py-1.5 shadow-[0_8px_24px_rgba(80,110,180,0.18)]">
      <button
        onClick={onOpenAdd}
        title={t('topbar.addTask')}
        className={cn(item, 'text-primary')}
      >
        <Plus className="w-5 h-5" />
      </button>

      <button
        onClick={() => void openDir()}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-3 text-body font-medium text-gray-700 dark:text-gray-200 active:scale-95 transition-transform',
          isMobile ? 'h-10' : 'h-8',
        )}
      >
        <FolderOpen className="w-4 h-4 text-primary" />
        {t('action.openDownloadDir')}
      </button>

      <button
        onClick={() => (hasActive ? actions.pauseAll() : actions.startAll())}
        title={hasActive ? t('action.stop') : t('action.start')}
        className={item}
      >
        {hasActive ? <Pause className="w-4.5 h-4.5" /> : <Play className="w-4.5 h-4.5" />}
      </button>
    </div>
  )
}
