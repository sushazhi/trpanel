import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/appStore'
import { formatBytes, formatDuration, formatRatio, formatSpeed } from '@/utils/format'
import { tagColor } from '@/utils/tagColor'
import type { EditMode, EditTarget } from '@/components/TorrentMenu'
import { buildTorrentMenu, EditModals, TorrentMenuDropdown } from '@/components/TorrentMenu'
import { useTorrentActions } from '@/hooks/useTorrentActions'
import { useRevealPath } from '@/hooks/useRevealPath'
import { usePlatform } from '@/platform'
import { RemoveTorrentDialog, ReplaceTrackerDialog } from '@/components/ToolsDialogs'
import { toast } from '@/lib/toast'
import { Checkbox } from '@/components/ui/checkbox'
import { ProgressBar } from '@/components/TorrentList/ProgressBar'
import { cn } from '@/lib/utils'
import { MoreVertical } from 'lucide-react'
import type { Torrent } from '@/types'

// 状态圆点（进度条右侧）
function statusDotColor(t: Torrent): { color: string; pulse: boolean } {
  if (t.error > 0) return { color: '#ff3b30', pulse: false }
  switch (t.status) {
    case 4: return { color: '#007aff', pulse: true }
    case 6: return { color: '#34c759', pulse: false }
    case 0: return { color: '#8e8e93', pulse: false }
    default: return { color: '#ff9500', pulse: t.status === 1 || t.status === 2 }
  }
}

// 图一风格卡片列表（桌面/移动共用）
export function GridView({ torrents, onOpenDetail, isMobile, onOpenBatchClean }: {
  torrents: Torrent[]
  onOpenDetail: (t: Torrent) => void
  isMobile?: boolean
  onOpenBatchClean?: () => void
}) {
  const { t } = useTranslation()
  const actions = useTorrentActions()
  const { can } = usePlatform()
  const revealPath = useRevealPath()
  const selectedIds = useAppStore((s) => s.selectedIds)
  const showCheckboxes = useAppStore((s) => s.showCheckboxes)
  const toggleSelect = useAppStore((s) => s.toggleSelect)
  const setSelection = useAppStore((s) => s.setSelection)
  const selectAnchorId = useAppStore((s) => s.selectAnchorId)
  const setSelectAnchor = useAppStore((s) => s.setSelectAnchor)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [removeIds, setRemoveIds] = useState<number[] | null>(null)
  const [trackerOpen, setTrackerOpen] = useState(false)

  if (torrents.length === 0) {
    return <div className="p-8 text-center text-gray-400">{t('common.empty')}</div>
  }

  // 触屏设备（无 hover）：点卡片直接打开详情，checkbox/⋮ 常显用于选择与菜单
  const isTouch =
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: none), (pointer: coarse)').matches

  const handleSelect = (torrent: Torrent, e: React.MouseEvent) => {
    // Shift 连选：从锚点到当前项整段选中（触屏无 Shift 键，不会走到这里）
    if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const anchorId = selectAnchorId ?? torrents[0]?.id
      if (anchorId != null) {
        const a = torrents.findIndex((x) => x.id === anchorId)
        const b = torrents.findIndex((x) => x.id === torrent.id)
        const from = a < 0 ? 0 : Math.min(a, b)
        const to = a < 0 ? b : Math.max(a, b)
        setSelection(torrents.slice(from, to + 1).map((x) => x.id))
      }
      return
    }
    if (e.ctrlKey || e.metaKey) {
      toggleSelect(torrent.id)
      setSelectAnchor(torrent.id)
      return
    }
    if (isMobile || isTouch) {
      onOpenDetail(torrent)
      return
    }
    setSelection([torrent.id])
    setSelectAnchor(torrent.id)
  }

  const handleMenuClick = (torrent: Torrent) => (key: string) => {
    const id = torrent.id
    if (key === 'start') actions.singleStart(id)
    else if (key === 'startNow') actions.singleStartNow(id)
    else if (key === 'stop') actions.singleStop(id)
    else if (key === 'verify') actions.verify(id)
    else if (key === 'reannounce') actions.reannounce(id)
    else if (key === 'path') setEditTarget({ torrent, mode: 'path' })
    else if (key === 'rename') setEditTarget({ torrent, mode: 'rename' })
    else if (key === 'other') setEditTarget({ torrent, mode: 'other' })
    else if (key === 'labels') setEditTarget({ torrent, mode: 'labels' })
    else if (key === 'trackers') setEditTarget({ torrent, mode: 'trackers' })
    else if (key === 'replaceTrackers') setTrackerOpen(true)
    else if (key.startsWith('queue:')) actions.queue(id, key.split(':')[1] as 'top' | 'up' | 'down' | 'bottom')
    else if (key === 'copyMagnet') { void navigator.clipboard?.writeText(torrent.magnetLink).catch(() => {}).finally(() => toast.success(t('toast.copied'))) }
    else if (key === 'copyName') { void navigator.clipboard?.writeText(torrent.name).catch(() => {}).finally(() => toast.success(t('toast.copied'))) }
    else if (key === 'copyPath') { void navigator.clipboard?.writeText(torrent.downloadDir).catch(() => {}).finally(() => toast.success(t('toast.copied'))) }
    else if (key === 'remove') setRemoveIds([id])
    else if (key === 'openDir') { void revealPath(torrent.downloadDir || '') }
    else if (key === 'deleteCompleted') onOpenBatchClean?.()
  }

  return (
    <div
      className="tm-scroll h-full"
      style={{ paddingLeft: 'calc(var(--safe-left) + 0.75rem)', paddingRight: 'calc(var(--safe-right) + 0.75rem)' }}
    >
      <div className="flex flex-col gap-2.5 max-w-5xl mx-auto">
        {torrents.map((torrent) => {
          const menuItems = buildTorrentMenu({
            actions,
            t: (k: string) => t(k),
            onOpenDetail,
            canRevealPath: can('fs.revealPath'),
            onEdit: (mode: EditMode, tt: Torrent) => setEditTarget({ torrent: tt, mode }),
            onOpenBatchClean,
          }, torrent)
          const selected = selectedIds.includes(torrent.id)
          const pct = torrent.percentDone
          const dot = statusDotColor(torrent)
          const labels = torrent.labels ?? []
          const eta = torrent.eta > 0 ? `${t('card.remaining')} ${formatEtaShort(torrent.eta)}` : ''
          // 已完成（含做种中/暂停）：显示分享率；未完成：显示「已下载 / 总大小」
          const isDone = torrent.percentDone >= 1
          return (
            <TorrentMenuDropdown key={torrent.id} items={menuItems} onClick={handleMenuClick(torrent)} trigger="contextMenu" align="start">
              <div
                onClick={(e) => handleSelect(torrent, e)}
                onDoubleClick={() => onOpenDetail(torrent)}
                data-selected={selected || undefined}
                className={cn(
                  'glass-card flex items-start gap-3.5 p-3.5 cursor-default select-none group',
                  selected && 'z-[1]',
                )}
              >
                <div className="flex-1 min-w-0">
                  {/* 名称 + 标签 + 选择 */}
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-body truncate text-gray-800 dark:text-gray-100" title={torrent.name}>
                      {torrent.error > 0 && <span className="text-red-500 mr-1">!</span>}
                      {torrent.name}
                    </span>
                    {labels.length > 0 && (
                      <span className="hidden md:flex items-center gap-1.5 shrink-0 ml-auto">
                        {labels.slice(0, 3).map((l) => {
                          const color = tagColor(l)
                          return (
                            <span
                              key={l}
                              className="px-2 py-0.5 rounded-full text-caption1 font-medium"
                              style={{ backgroundColor: `${color}1c`, color }}
                            >
                              {l}
                            </span>
                          )
                        })}
                        {labels.length > 3 && (
                          <span className="px-2 py-0.5 rounded-full text-caption1 bg-gray-100 dark:bg-gray-800 text-gray-400">
                            +{labels.length - 3}
                          </span>
                        )}
                      </span>
                    )}
                    {showCheckboxes && (
                      <span className="shrink-0 tm-reveal-hover" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected} onCheckedChange={() => { toggleSelect(torrent.id); setSelectAnchor(torrent.id) }} />
                      </span>
                    )}
                    {/* ⋮ 菜单（触屏设备显示；鼠标设备用右键菜单） */}
                    <span className="tm-touch-menu shrink-0" onClick={(e) => e.stopPropagation()}>
                      <TorrentMenuDropdown items={menuItems} onClick={handleMenuClick(torrent)} trigger="click">
                        <span className="w-8 h-8 flex items-center justify-center text-gray-400 active:text-primary">
                          <MoreVertical className="w-4 h-4" />
                        </span>
                      </TorrentMenuDropdown>
                    </span>
                  </div>

                  {/* 进度条（scaleX 驱动）+ 移动端标签靠右 */}
                  <div className="flex items-center gap-2.5 mt-2">
                    <ProgressBar value={pct} error={torrent.error > 0} className="flex-1" />
                    <span
                      className={cn('w-2 h-2 rounded-full shrink-0', dot.pulse && 'animate-pulse')}
                      style={{ backgroundColor: dot.color }}
                    />
                    {labels.length > 0 && (
                      <span className="md:hidden flex items-center gap-1.5 shrink-0">
                        {labels.slice(0, 2).map((l) => {
                          const color = tagColor(l)
                          return (
                            <span key={l} className="px-2 py-0.5 rounded-full text-caption1 font-medium" style={{ backgroundColor: `${color}1c`, color }}>
                              {l}
                            </span>
                          )
                        })}
                        {labels.length > 2 && <span className="text-caption1 text-gray-400">+{labels.length - 2}</span>}
                      </span>
                    )}
                  </div>

                  {/* 元信息 */}
                  <div className="flex items-center gap-2.5 text-footnote text-gray-500 dark:text-gray-400 mt-1.5 flex-wrap">
                    <span className="tm-mono text-green-600 dark:text-green-400">↓{formatSpeed(torrent.rateDownload)}</span>
                    <span className="tm-mono text-blue-600 dark:text-blue-400">↑{formatSpeed(torrent.rateUpload)}</span>
                    {eta && <span>· {eta}</span>}
                    {/* 未完成：已下载 / 总大小；已完成：分享率（桌面补充总大小） */}
                    {isDone ? (
                      <>
                        <span className="tm-mono">· {t('columns.ratio')} {formatRatio(torrent.uploadRatio)}</span>
                        <span className="text-gray-300 dark:text-gray-600 hidden sm:inline">·</span>
                        <span className="hidden sm:inline">{formatBytes(torrent.totalSize)}</span>
                      </>
                    ) : (
                      <span className="tm-mono">· {formatBytes(torrent.downloadedEver)} / {formatBytes(torrent.totalSize)}</span>
                    )}
                    {isDone && torrent.secondsSeeding > 0 && (
                      <span className="text-gray-400 dark:text-gray-500">· {t('card.seeding')} {formatDuration(torrent.secondsSeeding)}</span>
                    )}
                  </div>
                </div>
              </div>
            </TorrentMenuDropdown>
          )
        })}
      </div>
      <EditModals target={editTarget} onClose={() => setEditTarget(null)} />
      <RemoveTorrentDialog open={!!removeIds} ids={removeIds ?? []} onClose={() => setRemoveIds(null)} />
      <ReplaceTrackerDialog open={trackerOpen} onClose={() => setTrackerOpen(false)} />
    </div>
  )
}

function formatEtaShort(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}h${m}m`
  if (m > 0) return `${m}m${s}s`
  return `${s}s`
}
