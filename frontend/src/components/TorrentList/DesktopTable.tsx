import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, ArrowDownWideNarrow, ArrowUpNarrowWide, RotateCcw } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from 'react-i18next'
import { torrentApi } from '@/api/torrent'
import { useTorrentActions } from '@/hooks/useTorrentActions'
import { useRevealPath } from '@/hooks/useRevealPath'
import { useSemanticPath } from '@/hooks/useSemanticPath'
import { usePlatform } from '@/platform'
import { useAppStore } from '@/stores/appStore'
import type { ColumnConfig, Torrent } from '@/types'
import { formatBytes, formatDate, formatDuration, formatEta, formatRatio, formatSpeed } from '@/utils/format'
import { translateError } from '@/utils/errorText'
import { mapPath } from '@/utils/pathMapping'
import { copyText } from '@/utils/clipboard'
import { toast } from '@/lib/toast'
import { cn, cssVars } from '@/lib/utils'
import { tagColor } from '@/utils/tagColor'
import { StatusTag } from '@/components/status/StatusTag'
import { ProgressBar } from '@/components/TorrentList/ProgressBar'
import { buildTorrentMenu, EditModals, FloatingContextMenu, TorrentMenuDropdown } from '@/components/TorrentMenu'
import { RemoveTorrentDialog, ReplaceTrackerDialog } from '@/components/ToolsDialogs'
import type { EditMode, EditTarget, MenuItem } from '@/components/TorrentMenu'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'

const mainTracker = (t: Torrent) => t.trackerStats?.find((x) => !x.isBackup)?.host ?? t.trackerStats?.[0]?.host ?? ''

// 数值列：表头与单元格右对齐 + 等宽数字，便于纵向对比
const NUMERIC_COLS = new Set([
  'size', 'download', 'upload', 'ratio', 'secondsSeeding', 'eta', 'peers',
  'uploaded', 'downloaded', 'added', 'doneDate', 'queuePosition', 'fileCount', 'limits',
])

// 单元格渲染
function Cell({ torrent, col }: { torrent: Torrent; col: ColumnConfig }) {
  const { t } = useTranslation()
  const sem = useSemanticPath()
  switch (col.key) {
    case 'name':
      return (
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {torrent.error > 0 && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
          <span className="truncate font-medium text-gray-800 dark:text-gray-100" title={translateError(torrent.errorString, t) || torrent.name}>
            {torrent.name}
          </span>
        </div>
      )
    case 'size':
      return <span className="tm-mono">{formatBytes(torrent.totalSize)}</span>
    case 'progress':
      // 百分比内嵌到进度条里（填充区白字 / 未填充区灰字）
      return <ProgressBar value={torrent.percentDone} error={torrent.error > 0} />
    case 'status':
      return <StatusTag torrent={torrent} />
    case 'download':
      return <span className="tm-mono text-green-600 dark:text-green-400">{formatSpeed(torrent.rateDownload)}</span>
    case 'upload':
      return <span className="tm-mono text-blue-600 dark:text-blue-400">{formatSpeed(torrent.rateUpload)}</span>
    case 'ratio':
      return <span className="tm-mono">{formatRatio(torrent.uploadRatio)}</span>
    case 'secondsSeeding':
      return <span className="tm-mono text-footnote">{formatDuration(torrent.secondsSeeding)}</span>
    case 'eta':
      return <span className="tm-mono">{formatEta(torrent.eta)}</span>
    case 'peers':
      return (
        <span className="tm-mono text-footnote">
          <span className="text-blue-600 dark:text-blue-400">{torrent.peersSendingToUs}</span>
          <span className="text-gray-400"> / </span>
          <span className="text-green-600 dark:text-green-400">{torrent.peersGettingFromUs}</span>
        </span>
      )
    case 'uploaded':
      return <span className="tm-mono">{formatBytes(torrent.uploadedEver)}</span>
    case 'downloaded':
      return <span className="tm-mono">{formatBytes(torrent.downloadedEver)}</span>
    case 'added':
      return <span className="tm-mono text-footnote">{formatDate(torrent.addedDate)}</span>
    case 'doneDate':
      return <span className="tm-mono text-footnote">{formatDate(torrent.doneDate)}</span>
    case 'tracker':
      return (
        <span className="text-footnote text-gray-600 dark:text-gray-300 truncate" title={torrent.trackerStats?.[0]?.announce}>
          {mainTracker(torrent) || '-'}
        </span>
      )
    case 'label':
      return (
        <span className="flex gap-1">
          {torrent.labels?.length ? (
            torrent.labels.map((l) => (
              <Badge
                key={l}
                variant="outline"
                className="tm-chip text-caption2 px-1.5 py-0 leading-none"
                style={cssVars({ '--chip': tagColor(l) })}
              >
                {l}
              </Badge>
            ))
          ) : (
            <span className="text-gray-300 dark:text-gray-600">-</span>
          )}
        </span>
      )
    case 'queuePosition':
      return <span>{torrent.queuePosition + 1}</span>
    case 'priority':
      return (
        <span
          className={cn(
            'text-footnote font-medium',
            (torrent.bandwidthPriority ?? 0) > 0
              ? 'text-red-500'
              : (torrent.bandwidthPriority ?? 0) < 0
                ? 'text-blue-500'
                : 'text-gray-400 dark:text-gray-500',
          )}
        >
          {(torrent.bandwidthPriority ?? 0) > 0
            ? t('action.priorityHigh')
            : (torrent.bandwidthPriority ?? 0) < 0
              ? t('action.priorityLow')
              : t('action.priorityNormal')}
        </span>
      )
    case 'limits':
      return (
        <span className="text-footnote text-gray-600 dark:text-gray-300 whitespace-nowrap">
          <span className={torrent.downloadLimited ? '' : 'text-gray-300 dark:text-gray-600'}>
            ↓ {torrent.downloadLimited ? formatBytes(torrent.downloadLimit * 1024) + '/s' : '∞'}
          </span>
          <span className="mx-1 text-gray-300 dark:text-gray-600">/</span>
          <span className={torrent.uploadLimited ? '' : 'text-gray-300 dark:text-gray-600'}>
            ↑ {torrent.uploadLimited ? formatBytes(torrent.uploadLimit * 1024) + '/s' : '∞'}
          </span>
        </span>
      )
    case 'fileCount':
      return <span>{torrent.fileCount}</span>
    case 'downloadDir':
      return <span className="text-footnote text-gray-500 truncate" title={torrent.downloadDir}>{sem(torrent.downloadDir) || '-'}</span>
    case 'hashString':
      return <span className="text-footnote tm-mono text-gray-500 truncate" title={torrent.hashString}>{torrent.hashString}</span>
    case 'error':
      return (
        <span className="text-red-500 truncate" title={translateError(torrent.errorString, t) || undefined}>
          {translateError(torrent.errorString, t) || '-'}
        </span>
      )
    default:
      return null
  }
}

// 桌面虚拟滚动表格
export function DesktopTable({ torrents, onOpenDetail, onOpenBatchClean }: {
  torrents: Torrent[]
  onOpenDetail: (t: Torrent) => void
  onOpenBatchClean?: () => void
}) {
  const { t } = useTranslation()
  const actions = useTorrentActions()
  const { can } = usePlatform()
  const revealPath = useRevealPath()
  const columns = useAppStore((s) => s.columns)
  const showCheckboxes = useAppStore((s) => s.showCheckboxes)
  const selectedIds = useAppStore((s) => s.selectedIds)
  const toggleSelect = useAppStore((s) => s.toggleSelect)
  const setSelection = useAppStore((s) => s.setSelection)
  const clearSelection = useAppStore((s) => s.clearSelection)
  const selectAnchorId = useAppStore((s) => s.selectAnchorId)
  const setSelectAnchor = useAppStore((s) => s.setSelectAnchor)
  const setColumnWidth = useAppStore((s) => s.setColumnWidth)
  const setColumns = useAppStore((s) => s.setColumns)
  const toggleColumn = useAppStore((s) => s.toggleColumn)
  const resetColumns = useAppStore((s) => s.resetColumns)
  const singleLine = useAppStore((s) => s.singleLine)
  const sortField = useAppStore((s) => s.sortField)
  const sortOrder = useAppStore((s) => s.sortOrder)
  const setSortField = useAppStore((s) => s.setSortField)
  const setSortOrder = useAppStore((s) => s.setSortOrder)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [removeIds, setRemoveIds] = useState<number[] | null>(null)
  const [trackerOpen, setTrackerOpen] = useState(false)
  // 表头右键列选择菜单位置（null = 关闭）
  const [colMenuPos, setColMenuPos] = useState<{ x: number; y: number } | null>(null)
  const parentRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const dragIdRef = useRef<number | null>(null)
  const lastClickRef = useRef<{ id: number; t: number }>({ id: -1, t: 0 })
  const rowHeight = singleLine ? 40 : 56

  // 表头横向滚动与内容区同步（表头独立于虚拟滚动容器，需手动镜像 scrollLeft）
  const syncHeaderScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (headerRef.current) headerRef.current.scrollLeft = e.currentTarget.scrollLeft
  }

  // 正在拖拽调宽的列（含实时预览宽度）：拖拽期间分隔线保持高亮，
  // 且只走本地状态——写 store 等于每帧序列化整份列配置落一次 localStorage
  const [resizing, setResizing] = useState<{ key: string; width: number } | null>(null)

  // 表头拖拽调整列宽
  const startColResize = (e: React.MouseEvent, col: ColumnConfig) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = col.width ?? 100
    const onMove = (ev: MouseEvent) =>
      setResizing({
        key: col.key,
        width: Math.min(900, Math.max(60, Math.round(startWidth + ev.clientX - startX))),
      })
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // 只有松手这一次才真正提交
      setResizing((cur) => {
        if (cur) setColumnWidth(cur.key, cur.width)
        return null
      })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    setResizing({ key: col.key, width: startWidth })
  }

  // 表头列拖拽移动（指针事件实现，不用 HTML5 DnD：避免浏览器半透明拖影、draggable 与调宽手柄冲突）
  const colDragRef = useRef<{ key: string; startX: number; startY: number; active: boolean; overKey: string | null } | null>(null)
  const [dragCol, setDragCol] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const suppressSortRef = useRef(false)

  const onColDragMove = (e: MouseEvent) => {
    const d = colDragRef.current
    if (!d) return
    if (!d.active) {
      if (Math.abs(e.clientX - d.startX) < 5 && Math.abs(e.clientY - d.startY) < 5) return
      d.active = true
      setDragCol(d.key)
      document.body.style.cursor = 'grabbing'
      document.body.style.userSelect = 'none'
    }
    setDragPos({ x: e.clientX, y: e.clientY })
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const key = (el as HTMLElement | null)?.closest?.('[data-col-cell]')?.getAttribute('data-col-key') ?? null
    if (d.overKey !== key) {
      d.overKey = key
      setOverCol(key)
    }
  }

  const onColDragUp = () => {
    const d = colDragRef.current
    colDragRef.current = null
    document.removeEventListener('mousemove', onColDragMove)
    document.removeEventListener('mouseup', onColDragUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    setDragPos(null)
    setDragCol(null)
    setOverCol(null)
    if (!d?.active) return
    // 这是一次拖动而非点击排序，吃掉随后派发的 click
    suppressSortRef.current = true
    setTimeout(() => { suppressSortRef.current = false }, 300)
    const fromKey = d.key
    const toKey = d.overKey
    if (!toKey || toKey === fromKey) return
    const next = [...columns]
    const from = next.findIndex((c) => c.key === fromKey)
    const to = next.findIndex((c) => c.key === toKey)
    if (from < 0 || to < 0) return
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setColumns(next)
  }

  const startColDrag = (e: React.MouseEvent, col: ColumnConfig) => {
    // 从宽度调节手柄开始的拖拽是调宽，不进入列移动
    if ((e.target as HTMLElement).closest('[data-col-resize]')) return
    e.preventDefault()
    colDragRef.current = { key: col.key, startX: e.clientX, startY: e.clientY, active: false, overKey: null }
    document.addEventListener('mousemove', onColDragMove)
    document.addEventListener('mouseup', onColDragUp)
  }

  // 排序列头点击
  const handleSort = (field: string) => {
    if (suppressSortRef.current) return
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  // 初始化排序：从 localStorage 恢复
  useEffect(() => {
    const stored = localStorage.getItem('tm_sort')
    if (stored) {
      try {
        const s = JSON.parse(stored) as { field: string; order: 'asc' | 'desc' }
        setSortField(s.field)
        setSortOrder(s.order)
      } catch {}
    }
  }, [])
  // 持久化排序状态
  useEffect(() => {
    localStorage.setItem('tm_sort', JSON.stringify({ field: sortField, order: sortOrder }))
  }, [sortField, sortOrder])

  // 排序已统一在 useFilter（多级排序）中完成，这里直接使用过滤+排序后的列表
  const sortedTorrents = torrents

  // 行点击：普通=单选（再点一次已选中的唯一项则取消），Ctrl/Cmd=切换，Shift=从锚点连选
  const handleSelect = (torrent: Torrent, e: React.MouseEvent) => {
    if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const anchorId = selectAnchorId ?? sortedTorrents[0]?.id
      if (anchorId != null) {
        const a = sortedTorrents.findIndex((x) => x.id === anchorId)
        const b = sortedTorrents.findIndex((x) => x.id === torrent.id)
        const from = a < 0 ? 0 : Math.min(a, b)
        const to = a < 0 ? b : Math.max(a, b)
        setSelection(sortedTorrents.slice(from, to + 1).map((x) => x.id))
      }
      return
    }
    if (e.ctrlKey || e.metaKey) {
      toggleSelect(torrent.id)
      setSelectAnchor(torrent.id)
      return
    }
    // 300ms 内同行两击是双击的前半程，不算「再点取消」，否则双击开详情时选中态会闪掉
    const now = Date.now()
    const repeatClick = lastClickRef.current.id === torrent.id && now - lastClickRef.current.t <= 300
    lastClickRef.current = { id: torrent.id, t: now }
    if (repeatClick) return
    if (selectedIds.length === 1 && selectedIds[0] === torrent.id) {
      clearSelection()
      return
    }
    setSelection([torrent.id])
    setSelectAnchor(torrent.id)
  }

  // 拖拽排序：按队列位置差执行 QueueMove
  const handleDrop = async (dst: Torrent) => {
    const srcId = dragIdRef.current
    dragIdRef.current = null
    if (srcId == null || srcId === dst.id) return
    const src = sortedTorrents.find((x) => x.id === srcId)
    if (!src) return
    const steps = src.queuePosition - dst.queuePosition
    if (steps === 0) return
    const direction = steps > 0 ? 'up' : 'down'
    const count = Math.abs(steps)
    try {
      for (let k = 0; k < count; k++) {
        await torrentApi.queue(srcId, direction as 'up' | 'down')
      }
      toast.success(t('toast.queueMoved'))
    } catch {
      // 拦截器已提示
    }
  }

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns])

  // 表头右键菜单：全部列勾选显隐 + 重置布局
  const columnMenuItems = useMemo<MenuItem[]>(
    () => [
      ...columns.map((c) => ({ key: c.key, label: t(c.label), checked: c.visible })),
      { type: 'divider' as const },
      { key: 'reset-columns', label: t('columns.reset'), icon: <RotateCcw className="w-4 h-4 text-primary" /> },
    ],
    [columns, t],
  )
  const handleColumnMenuPick = (key: string) => {
    if (key === 'reset-columns') resetColumns()
    else toggleColumn(key)
  }

  const virtualizer = useVirtualizer({
    count: sortedTorrents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  })

  const scrollTargetIds = useAppStore((s) => s.scrollTargetIds)
  const consumeScrollTarget = useAppStore((s) => s.consumeScrollTarget)
  // 从分组切回「全部」后滚回之前选中的种子；在绘制前定位，避免先闪一下旧位置。
  // 按 scrollTargetIds 的顺序（最后点选的锚点在前）定位第一个仍在新列表里的种子
  useLayoutEffect(() => {
    if (scrollTargetIds.length === 0) return
    consumeScrollTarget()
    const indexOf = new Map(sortedTorrents.map((t, i) => [t.id, i]))
    for (const id of scrollTargetIds) {
      const idx = indexOf.get(id)
      if (idx !== undefined) {
        virtualizer.scrollToIndex(idx, { align: 'center' })
        break
      }
    }
  }, [scrollTargetIds, sortedTorrents, virtualizer, consumeScrollTarget])

  const handleMenuClick = (torrent: Torrent) => (key: string) => {
    const id = torrent.id
    const reportCopy = (ok: boolean) => (ok ? toast.success(t('toast.copied')) : toast.error(t('toast.copyFailed')))
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
    else if (key === 'copyMagnet') {
      void copyText(torrent.magnetLink).then(reportCopy)
    } else if (key === 'copyName') {
      void copyText(torrent.name).then(reportCopy)
    } else if (key === 'copyPath') {
      void mapPath(torrent.downloadDir).then(copyText).then(reportCopy)
    } else if (key === 'remove') {
      setRemoveIds([id])
    } else if (key === 'openDir') {
      void revealPath(torrent.downloadDir || '')
    } else if (key === 'deleteCompleted') {
      onOpenBatchClean?.()
    }
  }

  const menuCtx = { actions, t: (k: string) => t(k), onOpenDetail, canRevealPath: can('fs.revealPath'), onEdit: (mode: EditMode, tt: Torrent) => setEditTarget({ torrent: tt, mode }), onOpenBatchClean }

  if (sortedTorrents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400" style={{ paddingTop: 'var(--pad-top)', paddingBottom: 'var(--pad-bottom)' }}>
        <AlertCircle className="w-10 h-10 opacity-40" />
        <span className="text-body">{t('common.empty')}</span>
      </div>
    )
  }

  // 所有列统一固定宽度（名称列默认 320），行尾占位吸收剩余空间
  // 拖拽中的宽度只在本地预览态里，这里优先读它，表头与单元格才会实时跟手
  const colWidth = (col: ColumnConfig) =>
    resizing?.key === col.key ? resizing.width : col.width ?? 100

  const headerStyle = (col: ColumnConfig) => ({
    width: colWidth(col),
    flex: `0 0 ${colWidth(col)}px`,
  })

  // 可排序列的排序图标
  const sortIcon = (field: string) => {
    if (sortField !== field) return null
    return sortOrder === 'asc'
      ? <ArrowUpNarrowWide className="ml-0.5 w-3 h-3 text-primary" />
      : <ArrowDownWideNarrow className="ml-0.5 w-3 h-3 text-primary" />
  }

  return (
    <div className="flex flex-col h-full" style={{ paddingTop: 'var(--pad-top)' }}>
      {/* 表头 */}
      <div
        ref={headerRef}
        onContextMenu={(e) => {
          e.preventDefault()
          setColMenuPos({ x: e.clientX, y: e.clientY })
        }}
        className="tm-dock glass-panel flex items-center px-3 h-9 text-footnote font-semibold tracking-wide text-gray-500 dark:text-gray-400 shrink-0 overflow-hidden"
      >
        {showCheckboxes && <div className="w-8 shrink-0" />}
        {visibleColumns.map((col) => {
          const isSortable = true
          return (
            <div
              key={col.key}
              data-col-cell
              data-col-key={col.key}
              onMouseDown={(e) => startColDrag(e, col)}
              className={cn(
                // 表头文字统一居中；数字列仅单元格右对齐，表头保持居中
                'px-2 truncate relative flex items-center justify-center gap-0.5 select-none transition-colors',
                overCol === col.key ? 'bg-primary/10' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.06]',
                dragCol === col.key && 'opacity-40',
              )}
              style={{ ...headerStyle(col), cursor: 'grab' }}
              onClick={() => handleSort(col.key)}
            >
              {t(col.label)}
              {isSortable && sortIcon(col.key)}
              {/* 列宽手柄：常驻 2px 分隔线（hover/拖拽时加粗成品牌色），
                  热区 12px 且跨列边界 5px，方便从两侧抓住 */}
              <span
                data-col-resize
                className="group/resize absolute -right-[5px] top-0 bottom-0 z-10 w-3 flex items-center justify-center cursor-col-resize"
                onMouseDown={(e) => startColResize(e, col)}
                onClick={(e) => e.stopPropagation()}
              >
                <span
                  className={cn(
                    'rounded-full transition-all duration-150',
                    resizing?.key === col.key
                      ? 'w-[3px] h-[85%] bg-primary'
                      : 'w-[2px] h-[65%] bg-gray-400/90 dark:bg-gray-500 group-hover/resize:w-[3px] group-hover/resize:h-[85%] group-hover/resize:bg-primary',
                  )}
                />
              </span>
            </div>
          )
        })}
        <div className="flex-1 min-w-0" />
      </div>

      {/* 虚拟滚动区 */}
      <div ref={parentRef} onScroll={syncHeaderScroll} className="tm-scroll tm-scroll--notch flex-1">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const torrent = sortedTorrents[vi.index]
            const menuItems = buildTorrentMenu(menuCtx, torrent)
            return (
              <div
                key={torrent.id}
                className="absolute top-0 left-0 w-full"
                style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}
              >
                <TorrentMenuDropdown items={menuItems} onClick={handleMenuClick(torrent)} trigger="contextMenu" align="start">
                  <div
                    title={torrent.error > 0 ? (translateError(torrent.errorString, t) || torrent.name) : torrent.name}
                    draggable
                    onDragStart={(e) => {
                      dragIdRef.current = torrent.id
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      void handleDrop(torrent)
                    }}
                    onClick={(e) => handleSelect(torrent, e)}
                    className={`tm-nav-item flex items-center px-3 h-full border-b border-gray-100/60 dark:border-white/[0.04] text-body cursor-default select-none ${
                      selectedIds.includes(torrent.id)
                        ? 'tm-row-selected'
                        : ''
                    } hover:bg-gray-100/50 dark:hover:bg-white/[0.04]`}
                    onDoubleClick={() => onOpenDetail(torrent)}
                  >
                    {showCheckboxes && (
                      <div className="shrink-0 w-8 h-8 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.includes(torrent.id)} onCheckedChange={() => { toggleSelect(torrent.id); setSelectAnchor(torrent.id) }} />
                      </div>
                    )}
                    {visibleColumns.map((col) => (
                      <div key={col.key} className={cn('px-2 truncate', NUMERIC_COLS.has(col.key) && 'text-right')} style={headerStyle(col)}>
                        <Cell torrent={torrent} col={col} />
                      </div>
                    ))}
                    <div className="flex-1 min-w-0" />
                  </div>
                </TorrentMenuDropdown>
              </div>
            )
          })}
        </div>
      </div>

      {/* 列拖拽跟随指针的实心胶囊（portal 到 body，避免 fixed 被 backdrop-filter 劫持） */}
      {dragPos && dragCol && createPortal(
        <div
          className="fixed z-[200] pointer-events-none rounded-full border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 px-3 py-1.5 text-footnote font-medium text-gray-700 dark:text-gray-200 shadow-xl"
          style={{ left: dragPos.x + 14, top: dragPos.y + 14 }}
        >
          {t(columns.find((c) => c.key === dragCol)?.label ?? dragCol)}
        </div>,
        document.body,
      )}

      {/* 表头右键：列选择菜单（勾选列不关闭，便于连续操作；重置后关闭） */}
      {colMenuPos && createPortal(
        <FloatingContextMenu
          pos={colMenuPos}
          items={columnMenuItems}
          onPick={(key) => {
            if (key === 'reset-columns') setColMenuPos(null)
            handleColumnMenuPick(key)
          }}
          onClose={() => setColMenuPos(null)}
        />,
        document.body,
      )}

      <EditModals target={editTarget} onClose={() => setEditTarget(null)} />
      <RemoveTorrentDialog open={!!removeIds} ids={removeIds ?? []} onClose={() => setRemoveIds(null)} />
      <ReplaceTrackerDialog open={trackerOpen} onClose={() => setTrackerOpen(false)} />
    </div>
  )
}
