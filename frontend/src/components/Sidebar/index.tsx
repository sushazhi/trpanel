import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  ChevronDown,
  CloudDownload,
  Download,
  FolderCog,
  FolderOpen,
  Globe,
  HardDrive,
  Layers,
  RotateCcw,
  Search,
  Server,
  Settings,
  ShieldAlert,
  Tags,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/appStore'
import { sessionApi } from '@/api/torrent'
import { matchesStatus } from '@/hooks/useFilter'
import { formatBytes, formatRatio, formatSpeed } from '@/utils/format'
import { tagColor } from '@/utils/tagColor'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { trimOpenPath, trimPickFolder } from '@/hooks/useTrimEnv'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// 主状态过滤（与图一 1:1）：全部 / 正在下载 / 正在做种 / 已完成 / 暂停 / 错误
const STATUS_ITEMS: { key: string; icon: React.ElementType; label: string; color: string }[] = [
  { key: 'all', icon: Layers, label: 'nav.all', color: '#6c7587' },
  { key: 'downloading', icon: CloudDownload, label: 'nav.downloading', color: '#007aff' },
  { key: 'seeding', icon: Download, label: 'nav.seeding', color: '#34c759' },
  { key: 'completed', icon: CheckCircle, label: 'nav.completed', color: '#8b5cf6' },
  { key: 'paused', icon: X, label: 'nav.paused', color: '#6c7587' },
  { key: 'verifying', icon: RotateCcw, label: 'nav.verifying', color: '#ff9500' },
  { key: 'error', icon: ShieldAlert, label: 'nav.error', color: '#ff3b30' },
]

export const DesktopSidebar: React.FC = () => {
  const { t } = useTranslation()
  const filters = useAppStore((s) => s.filters)
  const setFilters = useAppStore((s) => s.setFilters)
  const torrents = useAppStore((s) => s.torrents)
  const torrentSites = useAppStore((s) => s.torrentSites)
  const session = useAppStore((s) => s.session)
  const showStats = useAppStore((s) => s.showStats)
  const setShowStats = useAppStore((s) => s.setShowStats)
  const groupShowSize = useAppStore((s) => s.groupShowSize)
  const setGroupShowSize = useAppStore((s) => s.setGroupShowSize)
  const sidebarMenuVisible = useAppStore((s) => s.sidebarMenuVisible)
  const setSidebarMenuVisible = useAppStore((s) => s.setSidebarMenuVisible)
  const statusFilterVisible = useAppStore((s) => s.statusFilterVisible)
  const setStatusFilterVisible = useAppStore((s) => s.setStatusFilterVisible)
  const enableDoubleClickSelect = useAppStore((s) => s.enableDoubleClickSelect)
  const setEnableDoubleClickSelect = useAppStore((s) => s.setEnableDoubleClickSelect)
  const selectedIds = useAppStore((s) => s.selectedIds)
  const setSelection = useAppStore((s) => s.setSelection)
  const clearSelection = useAppStore((s) => s.clearSelection)
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [submenuOpen, setSubmenuOpen] = useState(false)
  // 子菜单延迟关闭：光标短暂离开一级菜单（含 4px 间隙）时不闪退
  const submenuTimer = useRef<number | null>(null)
  const closeSubmenuSoon = () => {
    if (submenuTimer.current) window.clearTimeout(submenuTimer.current)
    submenuTimer.current = window.setTimeout(() => setSubmenuOpen(false), 150)
  }
  const cancelSubmenuClose = () => {
    if (submenuTimer.current) {
      window.clearTimeout(submenuTimer.current)
      submenuTimer.current = null
    }
  }
  // 卸载时清理待执行的关闭定时器，避免对已卸载组件 setState
  useEffect(() => () => {
    if (submenuTimer.current) window.clearTimeout(submenuTimer.current)
  }, [])

  // 下载目录可用空间（DiskRing，60s 刷新）
  const [freeSpace, setFreeSpace] = useState<{ freeSpace: number; totalSize: number } | null>(null)
  useEffect(() => {
    if (!session?.downloadDir) {
      // 会话断开或目录为空时清空，避免残留上一台服务器的数据
      setFreeSpace(null)
      return
    }
    let cancelled = false
    const load = () => {
      sessionApi
        .freeSpace(session.downloadDir)
        .then((d) => { if (!cancelled) setFreeSpace(d) })
        .catch(() => { if (!cancelled) setFreeSpace(null) })
    }
    load()
    const id = setInterval(load, 60000)
    return () => { cancelled = true; clearInterval(id) }
  }, [session?.downloadDir])

  // 可用空间占比（totalSize 可能为 0，需防除零，否则 SVG 属性为 NaN）
  const freeRatio =
    freeSpace && freeSpace.totalSize > 0
      ? Math.min(1, Math.max(0, freeSpace.freeSpace / freeSpace.totalSize))
      : 0

  // 拖拽调整宽度
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startWidth: sidebarWidth }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const w = Math.min(400, Math.max(200, dragRef.current.startWidth + ev.clientX - dragRef.current.startX))
      setSidebarWidth(w)
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const activeStatus = filters.status[0] || 'all'

  // 实时速度汇总
  const totals = useMemo(() => {
    let down = 0
    let up = 0
    let downloadedEver = 0
    let uploadedEver = 0
    for (const tr of torrents) {
      down += tr.rateDownload
      up += tr.rateUpload
      downloadedEver += tr.downloadedEver
      uploadedEver += tr.uploadedEver
    }
    return { down, up, downloadedEver, uploadedEver }
  }, [torrents])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: torrents.length }
    const sizes: Record<string, number> = { all: 0 }
    for (const tr of torrents) {
      sizes.all += tr.totalSize || 0
      for (const item of STATUS_ITEMS) {
        if (item.key !== 'all' && matchesStatus(tr, item.key)) {
          counts[item.key] = (counts[item.key] ?? 0) + 1
          sizes[item.key] = (sizes[item.key] ?? 0) + (tr.totalSize || 0)
        }
      }
    }
    return { counts, sizes }
  }, [torrents])

  // 标签/目录/错误：条目为 [名称, 数量, 体积]
  const labelCounts = useMemo(() => {
    const m = new Map<string, number>()
    const s = new Map<string, number>()
    for (const tr of torrents) {
      for (const l of tr.labels ?? []) {
        m.set(l, (m.get(l) ?? 0) + 1)
        s.set(l, (s.get(l) ?? 0) + (tr.totalSize || 0))
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([k, c]) => [k, c, s.get(k) ?? 0] as const)
  }, [torrents])

  const dirCounts = useMemo(() => {
    const m = new Map<string, number>()
    const s = new Map<string, number>()
    for (const tr of torrents) {
      if (tr.downloadDir) {
        m.set(tr.downloadDir, (m.get(tr.downloadDir) ?? 0) + 1)
        s.set(tr.downloadDir, (s.get(tr.downloadDir) ?? 0) + (tr.totalSize || 0))
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([k, c]) => [k, c, s.get(k) ?? 0] as const)
  }, [torrents])

  // 站点计数 + 「其他」（无站点归属的种子）
  const siteStats = useMemo(() => {
    const counts = new Map<string, number>()
    const sizes = new Map<string, number>()
    let other = 0
    let otherSize = 0
    for (const tr of torrents) {
      const ids = torrentSites[tr.id] ?? []
      if (ids.length === 0) { other++; otherSize += tr.totalSize || 0; continue }
      for (const id of ids) {
        counts.set(id, (counts.get(id) ?? 0) + 1)
        sizes.set(id, (sizes.get(id) ?? 0) + (tr.totalSize || 0))
      }
    }
    return { counts, sizes, other, otherSize }
  }, [torrents, torrentSites])

  // 错误分布（按错误信息分组）
  const errorCounts = useMemo(() => {
    const m = new Map<string, number>()
    const s = new Map<string, number>()
    for (const tr of torrents) {
      if (tr.errorString) {
        m.set(tr.errorString, (m.get(tr.errorString) ?? 0) + 1)
        s.set(tr.errorString, (s.get(tr.errorString) ?? 0) + (tr.totalSize || 0))
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([k, c]) => [k, c, s.get(k) ?? 0] as const)
  }, [torrents])

  // 双击分组项：全选该分组种子（开关开启时；已完整选中该分组则清空）
  const dblSelect = (ids: number[]) => {
    if (!enableDoubleClickSelect || ids.length === 0) return
    // 必须「选区与分组完全相等」才算已全选，
    // 否则仅选中组内 1 个种子时双击会被误判为已全选而清空选区
    const group = new Set(ids)
    const allInGroup =
      selectedIds.length === ids.length && selectedIds.every((id) => group.has(id))
    if (allInGroup) clearSelection()
    else setSelection(ids)
  }

  const onSidebarContextMenu = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('button, input, .tm-nav-item, a')) {
      e.preventDefault()
      cancelSubmenuClose()
      setSubmenuOpen(false)
      setCtxMenu({ x: e.clientX, y: e.clientY })
    }
  }

  const setStatusFilter = (key: string) => setFilters({ status: key === 'all' ? ['all'] : [key] })

  // fnOS 快捷方式
  const openDownloadDir = async () => {
    const dir = session?.downloadDir
    if (!dir) return
    const ok = await trimOpenPath(dir)
    if (!ok) {
      navigator.clipboard?.writeText(dir).catch(() => {})
      toast.info(t('sidebar.openDirFallback', { dir }))
    }
  }
  const configDir = async () => {
    const picked = await trimPickFolder()
    if (picked) {
      navigator.clipboard?.writeText(picked).catch(() => {})
      toast.success(t('sidebar.dirCopied', { dir: picked }))
    } else {
      toast.info(t('sidebar.configDirHint'))
    }
  }

  return (
    <aside
      className="relative h-full shrink-0 flex flex-col"
      style={{ width: sidebarWidth }}
      onContextMenu={onSidebarContextMenu}
    >
      {/* 拖拽手柄 */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/40 transition-colors z-10 rounded-full"
        onMouseDown={onResizeStart}
      />

      <div className="flex-1 min-h-0 glass-panel rounded-2xl flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-3 flex flex-col gap-4">
          {/* LiveStats：大字号实时速度 */}
          <div className="shrink-0 grid grid-cols-2 gap-2">
            <div className="glass-panel rounded-xl px-3 py-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-caption1 text-gray-500 dark:text-gray-400 mb-0.5">
                <ArrowDown className="w-3.5 h-3.5 text-green-500" />
                {t('sidebar.download')}
              </div>
              <div className="tm-mono text-title2 font-semibold leading-tight text-green-500">{formatSpeed(totals.down)}</div>
            </div>
            <div className="glass-panel rounded-xl px-3 py-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-caption1 text-gray-500 dark:text-gray-400 mb-0.5">
                <ArrowUp className="w-3.5 h-3.5 text-blue-500" />
                {t('sidebar.upload')}
              </div>
              <div className="tm-mono text-title2 font-semibold leading-tight text-blue-500">{formatSpeed(totals.up)}</div>
            </div>
            {showStats && (
              <div className="col-span-2 glass-panel rounded-xl px-3 py-2 flex items-center justify-between text-caption1">
                <span className="text-gray-400">{t('sidebar.down')}</span>
                <span className="tm-mono text-green-600 dark:text-green-400">{formatBytes(totals.downloadedEver)}</span>
                <span className="text-gray-400">{t('sidebar.up')}</span>
                <span className="tm-mono text-blue-600 dark:text-blue-400">{formatBytes(totals.uploadedEver)}</span>
                <span className="text-gray-400">{t('sidebar.ratio')}</span>
                <span className="tm-mono text-orange-500">{formatRatio(totals.downloadedEver > 0 ? totals.uploadedEver / totals.downloadedEver : 0)}</span>
              </div>
            )}
          </div>

          {/* DiskRing：SVG 环形图 + 可用容量 */}
          <div className="shrink-0 glass-panel rounded-xl px-3 py-2.5 flex items-center gap-3">
            <svg width="58" height="58" viewBox="0 0 58 58" className="-rotate-90 shrink-0">
              <circle cx="29" cy="29" r="22" stroke="rgba(120,130,160,0.16)" strokeWidth="6.5" fill="none" />
              <circle
                cx="29" cy="29" r="22"
                stroke="var(--color-primary)" strokeWidth="6.5" fill="none" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 22 * freeRatio} ${2 * Math.PI * 22}`}
                style={{ transition: 'stroke-dasharray 0.6s var(--ease-standard)' }}
              />
            </svg>
            <div className="min-w-0">
              <div className="text-caption1 text-gray-400 flex items-center gap-1">
                <HardDrive className="w-3 h-3" />
                {t('statusBar.freeSpace')}
              </div>
              <div className="tm-mono text-subhead font-semibold text-gray-700 dark:text-gray-200 truncate">
                {freeSpace ? formatBytes(freeSpace.freeSpace) : '--'}
              </div>
              <div className="text-caption1 text-gray-400 tm-mono truncate">
                {freeSpace ? `/ ${formatBytes(freeSpace.totalSize)}` : ''}
              </div>
            </div>
          </div>

          {/* 过滤器 */}
          {sidebarMenuVisible.status && (
            <div className="shrink-0">
              <SectionHeader icon={<Layers className="w-3.5 h-3.5" />} title={t('nav.filter')} />
              <div className="space-y-0.5 mt-1">
                {STATUS_ITEMS.filter((item) => item.key === 'all' || statusFilterVisible[item.key] !== false).map((item) => {
                  const Icon = item.icon
                  const isActive = activeStatus === String(item.key)
                  const count = statusCounts.counts[item.key] ?? 0
                  const size = statusCounts.sizes[item.key] ?? 0
                  return (
                    <button
                      key={item.key}
                      onClick={() => setStatusFilter(item.key)}
                      onDoubleClick={() =>
                        dblSelect(torrents.filter((t) => matchesStatus(t, item.key)).map((t) => t.id))
                      }
                      className={cn(
                        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-body transition-all tm-nav-item',
                        isActive
                          ? 'bg-primary/12 text-primary font-medium shadow-[inset_0_0_0_1px_rgba(0,122,255,0.18)]'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/8 hover:text-gray-800 dark:hover:text-gray-100',
                      )}
                    >
                      <Icon
                        className="w-4 h-4 shrink-0"
                        style={{ color: isActive ? 'var(--color-primary)' : item.color }}
                      />
                      <span className="flex-1 text-left truncate">{t(item.label)}</span>
                      {groupShowSize && size > 0 && (
                        <span className="text-caption2 tm-mono text-gray-400">{formatBytes(size)}</span>
                      )}
                      <span
                        className={cn(
                          'min-w-5 h-5 px-1.5 rounded-full text-caption2 tm-mono flex items-center justify-center',
                          isActive
                            ? 'bg-primary/15 text-primary'
                            : 'bg-white/70 dark:bg-white/10 text-gray-500 dark:text-gray-400',
                          item.key === 'error' && count > 0 && !isActive && 'bg-red-500 text-white',
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 目录分布 */}
          {sidebarMenuVisible.dirs && dirCounts.length > 0 && (
            <div className="shrink-0">
              <SectionHeader
                icon={<FolderOpen className="w-3.5 h-3.5" />}
                title={t('nav.dirs')}
                count={dirCounts.length}
                collapsed={sidebarCollapsed.dirs}
                onToggle={() => setSidebarCollapsed({ dirs: !sidebarCollapsed.dirs })}
              />
              {!sidebarCollapsed.dirs && (
                <div className="max-h-36 overflow-y-auto space-y-0.5 mt-1 pr-1">
                  {dirCounts.map(([dir, count, size]) => {
                    const isActive = filters.downloadDirs.includes(dir)
                    return (
                      <button
                        key={dir}
                        onClick={() =>
                          setFilters({
                            downloadDirs: isActive
                              ? filters.downloadDirs.filter((d) => d !== dir)
                              : [...filters.downloadDirs, dir],
                          })
                        }
                        onDoubleClick={() =>
                          dblSelect(torrents.filter((t) => t.downloadDir === dir).map((t) => t.id))
                        }
                        className={cn(
                          'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-body transition-colors tm-nav-item',
                          isActive
                            ? 'bg-primary/12 text-primary font-medium'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/8',
                        )}
                        title={dir}
                      >
                        <FolderOpen className="w-3.5 h-3.5 shrink-0 opacity-70" />
                        <span className="truncate flex-1 text-left">{dir}</span>
                        {groupShowSize && size > 0 && (
                          <span className="text-caption2 tm-mono text-gray-400">{formatBytes(size)}</span>
                        )}
                        <span className="text-caption2 tm-mono text-gray-400">{count}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* 标签（彩色徽标） */}
          {sidebarMenuVisible.labels && labelCounts.length > 0 && (
            <div className="shrink-0">
              <SectionHeader
                icon={<Tags className="w-3.5 h-3.5" />}
                title={t('nav.labels')}
                count={labelCounts.length}
                collapsed={sidebarCollapsed.labels}
                onToggle={() => setSidebarCollapsed({ labels: !sidebarCollapsed.labels })}
              />
              {!sidebarCollapsed.labels && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {labelCounts.map(([label, count, size]) => {
                    const isActive = filters.labels.includes(label)
                    const color = tagColor(label)
                    return (
                      <button
                        key={label}
                        onClick={() =>
                          setFilters({ labels: isActive ? filters.labels.filter((l) => l !== label) : [...filters.labels, label] })
                        }
                        onDoubleClick={() =>
                          dblSelect(torrents.filter((t) => t.labels?.includes(label)).map((t) => t.id))
                        }
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-body font-medium transition-all tm-nav-item',
                          isActive ? 'shadow-sm scale-105' : 'opacity-90 hover:opacity-100',
                        )}
                        style={{
                          backgroundColor: isActive ? color : `${color}1c`,
                          color: isActive ? '#fff' : color,
                          boxShadow: isActive ? `0 2px 8px ${color}55` : undefined,
                        }}
                      >
                        {label}
                        {groupShowSize && size > 0 && (
                          <span className={cn('tm-mono text-caption2', isActive ? 'text-white/85' : 'opacity-70')}>{formatBytes(size)}</span>
                        )}
                        <span className={cn('tm-mono text-caption2', isActive ? 'text-white/85' : 'opacity-70')}>{count}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* 错误分布 */}
          {sidebarMenuVisible.error && errorCounts.length > 0 && (
            <div className="shrink-0">
              <SectionHeader
                icon={<ShieldAlert className="w-3.5 h-3.5" />}
                title={t('nav.errors')}
                count={errorCounts.length}
                collapsed={sidebarCollapsed.error}
                onToggle={() => setSidebarCollapsed({ error: !sidebarCollapsed.error })}
              />
              {!sidebarCollapsed.error && (
                <div className="max-h-32 overflow-y-auto space-y-0.5 mt-1 pr-1">
                  {errorCounts.map(([err, count, size]) => {
                    const isActive = filters.error.includes(err)
                    return (
                      <button
                        key={err}
                        onClick={() =>
                          setFilters({
                            error: isActive ? filters.error.filter((x) => x !== err) : [...filters.error, err],
                          })
                        }
                        onDoubleClick={() =>
                          dblSelect(torrents.filter((t) => t.errorString === err).map((t) => t.id))
                        }
                        className={cn(
                          'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-body transition-colors tm-nav-item',
                          isActive
                            ? 'bg-red-500/10 text-red-500 font-medium'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/8',
                        )}
                        title={err}
                      >
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0 opacity-70 text-red-500" />
                        <span className="truncate flex-1 text-left">{err}</span>
                        {groupShowSize && size > 0 && (
                          <span className="text-caption2 tm-mono text-gray-400">{formatBytes(size)}</span>
                        )}
                        <span className="text-caption2 tm-mono text-gray-400">{count}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* 站点 */}
          {sidebarMenuVisible.sites && (
            <div className="flex-1 min-h-0">
              <SiteNav
                sites={torrentSites}
                siteStats={siteStats}
                currentSiteIds={filters.sites}
                onSelect={(siteId) => setFilters({ sites: siteId ? [siteId] : [] })}
                onDblSelect={(siteId) =>
                  dblSelect(
                    // '' = 全站（"全部站点"行），'__other__' = 无站点归属
                    siteId === ''
                      ? torrents.map((t) => t.id)
                      : torrents
                        .filter((t) => {
                          const ids = torrentSites[t.id] ?? []
                          return siteId === '__other__' ? ids.length === 0 : ids.includes(siteId)
                        })
                        .map((t) => t.id),
                  )
                }
                groupShowSize={groupShowSize}
                collapsed={sidebarCollapsed.sites}
                onToggle={() => setSidebarCollapsed({ sites: !sidebarCollapsed.sites })}
              />
            </div>
          )}
        </div>

        {/* fnOS 快捷方式 */}
        <div className="shrink-0 border-t border-white/60 dark:border-white/10 px-3 py-2.5">
          <SectionHeader icon={<Globe className="w-3.5 h-3.5" />} title={t('nav.fnosShortcuts')} />
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            <button
              onClick={() => void openDownloadDir()}
              className="flex flex-col items-center gap-1 py-2.5 rounded-xl glass-panel text-caption1 text-gray-600 dark:text-gray-300 glass-hover hover:text-primary"
            >
              <FolderOpen className="w-4 h-4 text-primary" />
              {t('action.openDownloadDir')}
            </button>
            <button
              onClick={() => void configDir()}
              className="flex flex-col items-center gap-1 py-2.5 rounded-xl glass-panel text-caption1 text-gray-600 dark:text-gray-300 glass-hover hover:text-primary"
            >
              <FolderCog className="w-4 h-4 text-primary" />
              {t('action.configDir')}
            </button>
          </div>
        </div>

      </div>

      {/* 右键菜单 */}
      {ctxMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => { setCtxMenu(null); setSubmenuOpen(false) }}
            onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); setSubmenuOpen(false) }}
          />
          <div
            className="fixed z-50 min-w-44 rounded-xl glass-panel-strong p-1"
            style={{ left: Math.min(ctxMenu.x, window.innerWidth - 180), top: Math.min(ctxMenu.y, window.innerHeight - 220) }}
          >
            <CtxCheck
              label={t('sidebar.status')}
              checked={sidebarMenuVisible.status}
              onClick={() => { setSidebarMenuVisible({ status: !sidebarMenuVisible.status }); setCtxMenu(null) }}
            />

            {/* 状态过滤器子菜单 */}
            <div
              className="relative"
              onMouseEnter={() => { cancelSubmenuClose(); setSubmenuOpen(true) }}
              onMouseLeave={closeSubmenuSoon}
            >
              <div className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-footnote text-left cursor-pointer hover:bg-white/60 dark:hover:bg-white/10">
                <span className="w-3.5 shrink-0" />
                <span className="flex-1">{t('sidebar.statusFilter')}</span>
                <ChevronDown className="w-3 h-3 -rotate-90 text-gray-400" />
              </div>
              {submenuOpen && (
                <div
                  onMouseEnter={cancelSubmenuClose}
                  onMouseLeave={closeSubmenuSoon}
                  className={cn(
                    // 实底背景避免嵌套玻璃面板的二次 backdrop-filter 模糊
                    'absolute top-0 z-10 min-w-36 rounded-xl bg-white/95 dark:bg-gray-800/95 border border-gray-200/70 dark:border-white/10 p-1 shadow-xl',
                    ctxMenu.x > window.innerWidth - 340 ? 'right-full mr-1' : 'left-full ml-1',
                  )}
                >
                  {STATUS_ITEMS.map((item) => {
                    // 'all' 是常驻项，不参与显隐控制：
                    // 若允许取消，会写入永不生效的 statusFilterVisible.all=false 脏状态
                    const isAll = item.key === 'all'
                    const visible = isAll || statusFilterVisible[item.key] !== false
                    return (
                      <button
                        key={item.key}
                        disabled={isAll}
                        onClick={() => setStatusFilterVisible(item.key, !visible)}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-footnote text-left text-gray-700 dark:text-gray-200 hover:bg-white/60 dark:hover:bg-white/10',
                          isAll && 'cursor-default opacity-60 hover:bg-transparent dark:hover:bg-transparent',
                        )}
                      >
                        <span className={cn('w-3.5 shrink-0 text-primary', visible ? 'opacity-100' : 'opacity-0')}>✓</span>
                        {t(item.label)}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="my-1 h-px bg-gray-200/60 dark:bg-white/10" />
            <CtxCheck
              label={t('sidebar.labels')}
              checked={sidebarMenuVisible.labels}
              onClick={() => { setSidebarMenuVisible({ labels: !sidebarMenuVisible.labels }); setCtxMenu(null) }}
            />
            <CtxCheck
              label={t('sidebar.dirs')}
              checked={sidebarMenuVisible.dirs}
              onClick={() => { setSidebarMenuVisible({ dirs: !sidebarMenuVisible.dirs }); setCtxMenu(null) }}
            />
            <CtxCheck
              label={t('sidebar.sites')}
              checked={sidebarMenuVisible.sites}
              onClick={() => { setSidebarMenuVisible({ sites: !sidebarMenuVisible.sites }); setCtxMenu(null) }}
            />
            <CtxCheck
              label={t('sidebar.error')}
              checked={sidebarMenuVisible.error}
              onClick={() => { setSidebarMenuVisible({ error: !sidebarMenuVisible.error }); setCtxMenu(null) }}
            />

            <div className="my-1 h-px bg-gray-200/60 dark:bg-white/10" />
            <CtxCheck
              label={t('sidebar.enableDoubleClickSelect')}
              checked={enableDoubleClickSelect}
              onClick={() => { setEnableDoubleClickSelect(!enableDoubleClickSelect); setCtxMenu(null) }}
            />
            <CtxCheck
              label={t('sidebar.groupShowSize')}
              checked={groupShowSize}
              onClick={() => { setGroupShowSize(!groupShowSize); setCtxMenu(null) }}
            />

            <div className="my-1 h-px bg-gray-200/60 dark:bg-white/10" />
            <CtxCheck
              label={t('sidebar.showStats')}
              checked={showStats}
              onClick={() => { setShowStats(!showStats); setCtxMenu(null) }}
            />
          </div>
        </>
      )}
    </aside>
  )
}

// ========== 右键菜单勾选项 ==========
function CtxCheck({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-footnote text-left hover:bg-white/60 dark:hover:bg-white/10"
    >
      <span className={cn('w-3.5 shrink-0 text-primary', checked ? 'opacity-100' : 'opacity-0')}>✓</span>
      {label}
    </button>
  )
}

// ========== 分组标题 ==========
function SectionHeader({
  icon,
  title,
  count,
  collapsed,
  onToggle,
}: {
  icon: React.ReactNode
  title: string
  count?: number
  collapsed?: boolean
  onToggle?: () => void
}) {
  const content = (
    <div
      className={cn(
        'flex items-center gap-1.5 px-1 select-none text-gray-500 dark:text-gray-400',
        onToggle && 'cursor-pointer hover:text-gray-700 dark:hover:text-gray-200',
      )}
      onClick={onToggle}
    >
      {onToggle && (
        <ChevronDown className={cn('w-3 h-3 text-gray-400 transition-transform duration-200', collapsed && '-rotate-90')} />
      )}
      <span className="text-primary">{icon}</span>
      <span className="text-body font-semibold uppercase tracking-wider">{title}</span>
      {typeof count === 'number' && <span className="text-caption2 tm-mono text-gray-400 ml-auto">{count}</span>}
    </div>
  )
  return content
}

// ========== 站点分组导航 ==========
interface SiteNavProps {
  sites: Record<number, string[]>
  siteStats: { counts: Map<string, number>; sizes: Map<string, number>; other: number; otherSize: number }
  currentSiteIds: string[]
  onSelect: (siteId: string) => void
  onDblSelect: (siteId: string) => void
  groupShowSize: boolean
  collapsed: boolean
  onToggle: () => void
}

const SiteNav: React.FC<SiteNavProps> = ({ sites, siteStats, currentSiteIds, onSelect, onDblSelect, groupShowSize, collapsed, onToggle }) => {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')

  // sites 的语义是「种子 ID → 该种子的站点名数组」，
  // 这里需按站点名聚合去重，否则同一站点会按种子数重复成多行，
  // 且拿种子 ID 去查以站点名为 key 的 siteStats 会恒为 0、筛选也永不命中
  const siteEntries = useMemo(() => {
    const names = new Set<string>()
    for (const list of Object.values(sites)) {
      for (const n of list) if (n) names.add(n)
    }
    return Array.from(names).sort().map((name) => ({ id: name, name }))
  }, [sites])

  // 全站合计（供"全部站点"行展示，避免误用"其他"分组的计数）
  const { totalSiteCount, totalSiteSize } = useMemo(() => {
    let count = siteStats.other
    let size = siteStats.otherSize
    for (const c of siteStats.counts.values()) count += c
    for (const s of siteStats.sizes.values()) size += s
    return { totalSiteCount: count, totalSiteSize: size }
  }, [siteStats])

  const filtered = siteEntries.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <>
      <div
        className="flex items-center gap-1.5 mb-1 px-1 cursor-pointer select-none text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        onClick={onToggle}
      >
        <ChevronDown
          className={cn('w-3 h-3 text-gray-400 transition-transform duration-200', collapsed && '-rotate-90')}
        />
        <Server className="w-3.5 h-3.5 text-primary" />
        <span className="text-body font-semibold uppercase tracking-wider">{t('site.nav')}</span>
        <span className="text-caption2 tm-mono text-gray-400 ml-auto">{siteEntries.length}</span>
      </div>

      {!collapsed && (
        <>
          <div className="relative mb-1.5">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('common.search')}
              className="h-7 pl-8 text-footnote bg-white/50 dark:bg-white/5 border-white/60 dark:border-white/10 rounded-lg focus-visible:ring-primary/50"
            />
          </div>

          <div className="space-y-0.5 max-h-44 overflow-y-auto pr-1">
            {/* 全部站点：点击清空站点筛选，双击全选所有种子；计数为全站合计（不是"其他"分组的） */}
            <button
              onClick={() => onSelect('')}
              onDoubleClick={() => onDblSelect('')}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-body transition-colors tm-nav-item',
                currentSiteIds.length === 0
                  ? 'bg-primary/12 text-primary font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/8',
              )}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate flex-1 text-left">{t('site.all')}</span>
              {groupShowSize && totalSiteSize > 0 && (
                <span className="text-caption2 tm-mono text-gray-400">{formatBytes(totalSiteSize)}</span>
              )}
              <span className="text-caption2 tm-mono text-gray-400">{totalSiteCount}</span>
            </button>

            {filtered.map((site) => {
              const isActive = currentSiteIds.includes(String(site.id))
              const count = siteStats.counts.get(site.id) ?? 0
              const size = siteStats.sizes.get(site.id) ?? 0
              return (
                <button
                  key={site.id}
                  onClick={() => onSelect(String(site.id))}
                  onDoubleClick={() => onDblSelect(String(site.id))}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-body transition-colors tm-nav-item',
                    isActive
                      ? 'bg-primary/12 text-primary font-medium'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/8',
                  )}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: isActive ? 'var(--color-primary)' : 'var(--color-gray-300)' }}
                  />
                  <span className="truncate flex-1 text-left">{site.name}</span>
                  {groupShowSize && size > 0 && (
                    <span className="text-caption2 tm-mono text-gray-400">{formatBytes(size)}</span>
                  )}
                  <span className="text-caption2 tm-mono text-gray-400">{count}</span>
                </button>
              )
            })}

            {/* 其他（无站点归属） */}
            {siteStats.other > 0 && (
              <button
                onClick={() => onSelect('__other__')}
                onDoubleClick={() => onDblSelect('__other__')}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-body transition-colors tm-nav-item',
                  currentSiteIds.includes('__other__')
                    ? 'bg-primary/12 text-primary font-medium'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/8',
                )}
              >
                <span className="w-2 h-2 rounded-full shrink-0 bg-gray-300" />
                <span className="truncate flex-1 text-left">{t('site.other')}</span>
                {groupShowSize && siteStats.otherSize > 0 && (
                  <span className="text-caption2 tm-mono text-gray-400">{formatBytes(siteStats.otherSize)}</span>
                )}
                <span className="text-caption2 tm-mono text-gray-400">{siteStats.other}</span>
              </button>
            )}

            {filtered.length === 0 && search && (
              <div className="text-footnote text-gray-400 text-center py-4">{t('common.noResults')}</div>
            )}
          </div>
        </>
      )}
    </>
  )
}

// ========== 移动端抽屉 ==========
interface MobileDrawerProps {
  visible: boolean
  onClose: () => void
  onOpenSettings: () => void
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({ visible, onClose, onOpenSettings }) => {
  const { t } = useTranslation()
  const filters = useAppStore((s) => s.filters)
  const setFilters = useAppStore((s) => s.setFilters)
  const torrentSites = useAppStore((s) => s.torrentSites)
  const torrents = useAppStore((s) => s.torrents)
  const session = useAppStore((s) => s.session)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed)
  const statusFilterVisible = useAppStore((s) => s.statusFilterVisible)
  // 与桌面端一致：遵守右键菜单里的分组显隐设置（该设置是持久化的）
  const sidebarMenuVisible = useAppStore((s) => s.sidebarMenuVisible)

  // 下载目录可用空间（DiskRing）：抽屉未打开时不轮询，避免后台空转
  const [freeSpace, setFreeSpace] = useState<{ freeSpace: number; totalSize: number } | null>(null)
  useEffect(() => {
    if (!visible || !session?.downloadDir) {
      // 抽屉关闭或会话断开时清空，避免残留上一台服务器的数据
      setFreeSpace(null)
      return
    }
    let cancelled = false
    const load = () => {
      sessionApi
        .freeSpace(session.downloadDir)
        .then((d) => { if (!cancelled) setFreeSpace(d) })
        .catch(() => { if (!cancelled) setFreeSpace(null) })
    }
    load()
    const id = setInterval(load, 60000)
    return () => { cancelled = true; clearInterval(id) }
  }, [visible, session?.downloadDir])

  // 可用空间占比（totalSize 可能为 0，需防除零，否则 SVG 属性为 NaN）
  const freeRatio =
    freeSpace && freeSpace.totalSize > 0
      ? Math.min(1, Math.max(0, freeSpace.freeSpace / freeSpace.totalSize))
      : 0

  const dirCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const tr of torrents) if (tr.downloadDir) m.set(tr.downloadDir, (m.get(tr.downloadDir) ?? 0) + 1)
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [torrents])

  const totals = useMemo(() => {
    let down = 0
    let up = 0
    for (const tr of torrents) {
      down += tr.rateDownload
      up += tr.rateUpload
    }
    return { down, up }
  }, [torrents])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: torrents.length }
    for (const tr of torrents) {
      for (const item of STATUS_ITEMS) {
        if (item.key !== 'all' && matchesStatus(tr, item.key)) {
          counts[item.key] = (counts[item.key] ?? 0) + 1
        }
      }
    }
    return counts
  }, [torrents])

  const labelCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const tr of torrents) for (const l of tr.labels ?? []) m.set(l, (m.get(l) ?? 0) + 1)
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [torrents])

  // 错误分布（按错误信息分组，次数降序）
  const errorCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const tr of torrents) if (tr.errorString) m.set(tr.errorString, (m.get(tr.errorString) ?? 0) + 1)
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [torrents])

  const siteStats = useMemo(() => {
    const counts = new Map<string, number>()
    let other = 0
    for (const tr of torrents) {
      const ids = torrentSites[tr.id] ?? []
      if (ids.length === 0) { other++; continue }
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return { counts, other }
  }, [torrents, torrentSites])

  // 站点名聚合去重（torrentSites 的 key 是种子 ID，不能当站点 ID 用）
  const mobileSiteNames = useMemo(() => {
    const names = new Set<string>()
    for (const list of Object.values(torrentSites)) {
      for (const n of list) if (n) names.add(n)
    }
    return Array.from(names).sort()
  }, [torrentSites])

  const mobileSiteTotal = useMemo(
    () => siteStats.other + Array.from(siteStats.counts.values()).reduce((a, b) => a + b, 0),
    [siteStats],
  )

  const activeStatus = filters.status[0] || 'all'

  const openDownloadDir = async () => {
    const dir = session?.downloadDir
    if (!dir) return
    const ok = await trimOpenPath(dir)
    if (!ok) {
      navigator.clipboard?.writeText(dir).catch(() => {})
      toast.info(t('sidebar.openDirFallback', { dir }))
    }
  }
  const configDir = async () => {
    const picked = await trimPickFolder()
    if (picked) {
      navigator.clipboard?.writeText(picked).catch(() => {})
      toast.success(t('sidebar.dirCopied', { dir: picked }))
    } else {
      toast.info(t('sidebar.configDirHint'))
    }
  }

  return (
    <Dialog open={visible} onOpenChange={onClose}>
      <DialogContent className="glass-panel-strong sm:max-w-sm h-[85vh] flex flex-col">
        <DialogHeader className="border-b border-white/60 dark:border-white/10 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--brand-grad-from)] to-[var(--brand-grad-to)] flex items-center justify-center">
              <span className="text-white font-bold text-footnote">TW</span>
            </span>
            <span className="text-primary">Transmission</span> WebUI <span className="text-gray-400 dark:text-gray-500 font-medium text-footnote">for fnOS</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-3">
          {/* LiveStats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="glass-panel rounded-xl px-3 py-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-caption1 text-gray-500 dark:text-gray-400 mb-0.5">
                <ArrowDown className="w-3.5 h-3.5 text-green-500" />
                {t('sidebar.download')}
              </div>
              <div className="tm-mono text-title2 font-semibold leading-tight text-green-500">{formatSpeed(totals.down)}</div>
            </div>
            <div className="glass-panel rounded-xl px-3 py-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-caption1 text-gray-500 dark:text-gray-400 mb-0.5">
                <ArrowUp className="w-3.5 h-3.5 text-blue-500" />
                {t('sidebar.upload')}
              </div>
              <div className="tm-mono text-title2 font-semibold leading-tight text-blue-500">{formatSpeed(totals.up)}</div>
            </div>
          </div>

          {/* DiskRing */}
          <div className="glass-panel rounded-xl px-3 py-2.5 flex items-center gap-3">
            <svg width="52" height="52" viewBox="0 0 58 58" className="-rotate-90 shrink-0">
              <circle cx="29" cy="29" r="22" stroke="rgba(120,130,160,0.16)" strokeWidth="6.5" fill="none" />
              <circle
                cx="29" cy="29" r="22"
                stroke="var(--color-primary)" strokeWidth="6.5" fill="none" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 22 * freeRatio} ${2 * Math.PI * 22}`}
                style={{ transition: 'stroke-dasharray 0.6s var(--ease-standard)' }}
              />
            </svg>
            <div className="min-w-0">
              <div className="text-caption1 text-gray-400 flex items-center gap-1">
                <HardDrive className="w-3 h-3" />
                {t('statusBar.freeSpace')}
              </div>
              <div className="tm-mono text-subhead font-semibold text-gray-700 dark:text-gray-200 truncate">
                {freeSpace ? formatBytes(freeSpace.freeSpace) : '--'}
              </div>
              <div className="text-caption1 text-gray-400 tm-mono truncate">
                {freeSpace ? `/ ${formatBytes(freeSpace.totalSize)}` : ''}
              </div>
            </div>
          </div>

          {/* 状态筛选 */}
          {sidebarMenuVisible.status && (
          <div>
            <SectionHeader icon={<Layers className="w-3.5 h-3.5" />} title={t('nav.filter')} />
            <div className="space-y-0.5 mt-1">
              {STATUS_ITEMS.filter((item) => item.key === 'all' || statusFilterVisible[item.key] !== false).map((item) => {
                const Icon = item.icon
                const isActive = activeStatus === String(item.key)
                const count = statusCounts[item.key] ?? 0
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      setFilters({ status: item.key === 'all' ? ['all'] : [item.key] })
                      onClose()
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-body transition-all tm-nav-item',
                      isActive
                        ? 'bg-primary/12 text-primary font-medium'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/8',
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" style={{ color: isActive ? 'var(--color-primary)' : item.color }} />
                    <span className="flex-1 text-left truncate">{t(item.label)}</span>
                    <span
                      className={cn(
                        'min-w-5 h-5 px-1.5 rounded-full text-caption2 tm-mono flex items-center justify-center',
                        isActive
                          ? 'bg-primary/15 text-primary'
                          : 'bg-white/70 dark:bg-white/10 text-gray-500 dark:text-gray-400',
                        item.key === 'error' && count > 0 && !isActive && 'bg-red-500 text-white',
                      )}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          )}

          {/* 下载目录 */}
          {sidebarMenuVisible.dirs && dirCounts.length > 0 && (
            <div>
              <SectionHeader
                icon={<FolderOpen className="w-3.5 h-3.5" />}
                title={t('nav.dirs')}
                count={dirCounts.length}
                collapsed={sidebarCollapsed.dirs}
                onToggle={() => setSidebarCollapsed({ dirs: !sidebarCollapsed.dirs })}
              />
              {!sidebarCollapsed.dirs && (
                <div className="space-y-0.5 mt-1">
                  {dirCounts.map(([dir, count]) => {
                    const isActive = filters.downloadDirs.includes(dir)
                    return (
                      <button
                        key={dir}
                        onClick={() => {
                          setFilters({
                            downloadDirs: isActive
                              ? filters.downloadDirs.filter((d) => d !== dir)
                              : [...filters.downloadDirs, dir],
                          })
                          onClose()
                        }}
                        className={cn(
                          'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-body transition-colors tm-nav-item',
                          isActive ? 'bg-primary/12 text-primary font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/8',
                        )}
                      >
                        <FolderOpen className="w-3.5 h-3.5 shrink-0 opacity-70" />
                        <span className="truncate flex-1 text-left">{dir}</span>
                        <span className="text-caption2 tm-mono text-gray-400">{count}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* 错误分布（与桌面端对齐，否则移动端无法错误筛选） */}
          {sidebarMenuVisible.error && errorCounts.length > 0 && (
            <div>
              <SectionHeader
                icon={<AlertCircle className="w-3.5 h-3.5" />}
                title={t('nav.error')}
                count={errorCounts.length}
                collapsed={sidebarCollapsed.error}
                onToggle={() => setSidebarCollapsed({ error: !sidebarCollapsed.error })}
              />
              {!sidebarCollapsed.error && (
                <div className="space-y-0.5 mt-1">
                  {errorCounts.map(([msg, count]) => {
                    const isActive = filters.error.includes(msg)
                    return (
                      <button
                        key={msg}
                        onClick={() => {
                          setFilters({
                            error: isActive ? filters.error.filter((e) => e !== msg) : [...filters.error, msg],
                          })
                          onClose()
                        }}
                        className={cn(
                          'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-body transition-colors tm-nav-item',
                          isActive ? 'bg-red-500/12 text-red-600 dark:text-red-400 font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/8',
                        )}
                        title={msg}
                      >
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 opacity-70" />
                        <span className="truncate flex-1 text-left">{msg}</span>
                        <span className="text-caption2 tm-mono text-gray-400">{count}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* 标签 */}
          {sidebarMenuVisible.labels && labelCounts.length > 0 && (
            <div>
              <SectionHeader
                icon={<Tags className="w-3.5 h-3.5" />}
                title={t('nav.labels')}
                count={labelCounts.length}
                collapsed={sidebarCollapsed.labels}
                onToggle={() => setSidebarCollapsed({ labels: !sidebarCollapsed.labels })}
              />
              {!sidebarCollapsed.labels && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {labelCounts.map(([label, count]) => {
                    const isActive = filters.labels.includes(label)
                    const color = tagColor(label)
                    return (
                      <button
                        key={label}
                        onClick={() => {
                          setFilters({ labels: isActive ? filters.labels.filter((l) => l !== label) : [...filters.labels, label] })
                          onClose()
                        }}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-body font-medium transition-all tm-nav-item',
                          isActive ? 'shadow-sm scale-105' : 'opacity-90 hover:opacity-100',
                        )}
                        style={{
                          backgroundColor: isActive ? color : `${color}1c`,
                          color: isActive ? '#fff' : color,
                          boxShadow: isActive ? `0 2px 8px ${color}55` : undefined,
                        }}
                      >
                        {label}
                        <span className={cn('tm-mono text-caption2', isActive ? 'text-white/85' : 'opacity-70')}>{count}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* 站点 */}
          {sidebarMenuVisible.sites && mobileSiteNames.length > 0 && (
            <div>
              <SectionHeader
                icon={<Server className="w-3.5 h-3.5" />}
                title={t('site.nav')}
                collapsed={sidebarCollapsed.sites}
                onToggle={() => setSidebarCollapsed({ sites: !sidebarCollapsed.sites })}
              />
              {!sidebarCollapsed.sites && (
                <div className="space-y-0.5 mt-1">
                <button
                  onClick={() => { setFilters({ sites: [] }); onClose() }}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-body transition-colors tm-nav-item',
                    filters.sites.length === 0 ? 'bg-primary/12 text-primary font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/8',
                  )}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span className="truncate flex-1 text-left">{t('site.all')}</span>
                  <span className="text-caption2 tm-mono text-gray-400">{mobileSiteTotal}</span>
                </button>
                {/* 站点名聚合去重：torrentSites 的 key 是种子 ID，
                    直接拿它当站点 ID 会导致计数恒为 0 且筛选永不命中 */}
                {mobileSiteNames.map((name) => {
                  const isActive = filters.sites.includes(name)
                  const count = siteStats.counts.get(name) ?? 0
                  return (
                    <button
                      key={name}
                      onClick={() => { setFilters({ sites: isActive ? [] : [name] }); onClose() }}
                      className={cn(
                        'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-body transition-colors tm-nav-item',
                        isActive ? 'bg-primary/12 text-primary font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/8',
                      )}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isActive ? 'var(--color-primary)' : 'var(--color-gray-300)' }} />
                      <span className="truncate flex-1 text-left">{name}</span>
                      <span className="text-caption2 tm-mono text-gray-400">{count}</span>
                    </button>
                  )
                })}
                {siteStats.other > 0 && (
                  <button
                    onClick={() => { setFilters({ sites: ['__other__'] }); onClose() }}
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-body transition-colors tm-nav-item',
                      filters.sites.includes('__other__') ? 'bg-primary/12 text-primary font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/8',
                    )}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0 bg-gray-300" />
                    <span className="truncate flex-1 text-left">{t('site.other')}</span>
                    <span className="text-caption2 tm-mono text-gray-400">{siteStats.other}</span>
                  </button>
                )}
                </div>
              )}
            </div>
          )}

          {/* fnOS 快捷方式 */}
          <div>
            <SectionHeader icon={<Globe className="w-3.5 h-3.5" />} title={t('nav.fnosShortcuts')} />
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <button
                onClick={() => void openDownloadDir()}
                className="flex flex-col items-center gap-1 py-2.5 rounded-xl glass-panel text-caption1 text-gray-600 dark:text-gray-300 glass-hover hover:text-primary"
              >
                <FolderOpen className="w-4 h-4 text-primary" />
                {t('action.openDownloadDir')}
              </button>
              <button
                onClick={() => void configDir()}
                className="flex flex-col items-center gap-1 py-2.5 rounded-xl glass-panel text-caption1 text-gray-600 dark:text-gray-300 glass-hover hover:text-primary"
              >
                <FolderCog className="w-4 h-4 text-primary" />
                {t('action.configDir')}
              </button>
            </div>
          </div>
        </div>

        {/* 底部：设置入口（抽屉覆盖顶栏时保持可及） */}
        <div className="border-t border-white/60 dark:border-white/10 pt-3 flex items-center">
          <Button variant="outline" size="sm" className="w-full justify-center gap-2 bg-white/50 dark:bg-white/5 border-white/60 dark:border-white/10" onClick={() => { onClose(); onOpenSettings() }}>
            <Settings className="w-4 h-4" />
            {t('common.settings')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
