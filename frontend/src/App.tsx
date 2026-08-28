import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { torrentApi, sessionApi } from '@/api/torrent'
import { AddTorrent } from '@/components/AddTorrent'
import { Dashboard } from '@/components/Dashboard'
import { DesktopSidebar, MobileDrawer } from '@/components/Sidebar'
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt'
import { SettingsModal } from '@/components/SettingsModal'
import { StatusBar } from '@/components/StatusBar'
import { TorrentDetail } from '@/components/TorrentDetail'
import { TorrentList } from '@/components/TorrentList'
import { BatchCleanDialog } from '@/components/ToolsDialogs'
import { useFilter } from '@/hooks/useFilter'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useResponsive } from '@/hooks/useResponsive'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
import { useTrimEnv } from '@/hooks/useTrimEnv'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useAppStore } from '@/stores/appStore'
import type { Torrent } from '@/types'
import { TopBar } from '@/components/TopBar'
import { ListHeader } from '@/components/ListHeader'
import { FloatingBar } from '@/components/FloatingBar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmHost } from '@/lib/confirm'
import { cn } from '@/lib/utils'
import { Toaster } from 'sonner'
import '@/i18n'

export default function App() {
  const { t, i18n } = useTranslation()
  const { isMobile } = useResponsive()
  const { isTrimOS, config } = useTrimEnv()
  useWebSocket()

  const torrents = useAppStore((s) => s.torrents)
  const filters = useAppStore((s) => s.filters)
  const theme = useAppStore((s) => s.theme)
  const themePreset = useAppStore((s) => s.themePreset)
  const language = useAppStore((s) => s.language)
  const selectedIds = useAppStore((s) => s.selectedIds)
  const torrentSites = useAppStore((s) => s.torrentSites)
  const setTorrentSites = useAppStore((s) => s.setTorrentSites)
  const wsStatus = useAppStore((s) => s.wsStatus)
  const setTheme = useAppStore((s) => s.setTheme)
  const setLanguage = useAppStore((s) => s.setLanguage)
  const setSession = useAppStore((s) => s.setSession)
  const fontSize = useAppStore((s) => s.fontSize)
  const sortField = useAppStore((s) => s.sortField)
  const sortOrder = useAppStore((s) => s.sortOrder)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [cleanOpen, setCleanOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [detailTorrent, setDetailTorrent] = useState<Torrent | null>(null)
  const [labelModalOpen, setLabelModalOpen] = useState(false)
  const [batchLabels, setBatchLabels] = useState<string[]>([])
  const [labelMode, setLabelMode] = useState<'set' | 'add' | 'remove'>('set')
  // 拖拽添加到对话框的初始内容
  const [addInitial, setAddInitial] = useState<{ files: File[]; text: string } | null>(null)
  // 供快捷键回调读取最新过滤结果（避免 hooks 顺序依赖）
  const filteredRef = useRef<Torrent[]>([])

  useKeyboardShortcuts({
    onAdd: () => setAddOpen(true),
    onSelectAll: () => {
      useAppStore.getState().setSelection(filteredRef.current.map((x) => x.id))
    },
  })

  // 移动端左右滑动切换分类
  const statusOrder = ['all', 'active', 'downloading', 'seeding', 'waiting-seed', 'completed', 'paused', 'verifying', 'error']
  const swipeRef = useRef(filters.status[0] || 'all')
  useEffect(() => {
    swipeRef.current = filters.status[0] || 'all'
  }, [filters.status])
  useSwipeGesture({
    threshold: 80,
    onSwipeLeft: () => {
      const cur = swipeRef.current
      const idx = statusOrder.indexOf(cur)
      if (idx >= 0 && idx < statusOrder.length - 1) {
        const next = statusOrder[idx + 1]
        void (async () => {
          await sessionApi.get().catch(() => {})
          useAppStore.getState().setFilters({ ...useAppStore.getState().filters, status: [next] })
        })()
      }
    },
    onSwipeRight: () => {
      const cur = swipeRef.current
      const idx = statusOrder.indexOf(cur)
      if (idx > 0) {
        const prev = statusOrder[idx - 1]
        void (async () => {
          await sessionApi.get().catch(() => {})
          useAppStore.getState().setFilters({ ...useAppStore.getState().filters, status: [prev] })
        })()
      }
    },
  })

  const filtered = useFilter(torrents, filters, torrentSites, sortField, sortOrder)
  useEffect(() => {
    filteredRef.current = filtered
  }, [filtered])
  const allLabels = useMemo(
    () => Array.from(new Set(torrents.flatMap((x) => x.labels ?? []))).sort((a, b) => a.localeCompare(b, 'zh')),
    [torrents],
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.dataset.theme = themePreset
  }, [theme, themePreset])

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`
  }, [fontSize])

  useEffect(() => {
    if (isTrimOS && config?.theme) {
      setTheme(config.theme === 'dark' ? 'dark' : 'light')
    }
  }, [isTrimOS, config?.theme, setTheme])

  useEffect(() => {
    if (isTrimOS && config?.language) {
      const lang = String(config.language)
      setLanguage(lang.startsWith('zh') ? 'zh' : 'en')
    }
  }, [isTrimOS, config?.language, setLanguage])

  useEffect(() => {
    torrentApi.sites().then(setTorrentSites).catch(() => {})
  }, [setTorrentSites])

  useEffect(() => {
    if (wsStatus === 'connected') {
      torrentApi.sites().then(setTorrentSites).catch(() => {})
    }
  }, [wsStatus, setTorrentSites])

  useEffect(() => {
    void i18n.changeLanguage(language)
  }, [language])

  useEffect(() => {
    sessionApi
      .get()
      .then(setSession)
      .catch(() => setSession(null))
  }, [setSession])

  useEffect(() => {
    if (i18n.language) setLanguage(i18n.language.startsWith('zh') ? 'zh' : 'en')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveBatchLabels = async () => {
    try {
      if (labelMode === 'set') {
        await torrentApi.updateMany(selectedIds, { labels: batchLabels })
      } else {
        const selected = torrents.filter((t) => selectedIds.includes(t.id))
        if (labelMode === 'add') {
          await Promise.all(selected.map((t) =>
            torrentApi.update(t.id, { labels: [...new Set([...(t.labels ?? []), ...batchLabels])] }),
          ))
        } else {
          const removeSet = new Set(batchLabels)
          for (const id of selectedIds) {
            const t = selected.find((x) => x.id === id)
            await torrentApi.update(id, { labels: (t?.labels ?? []).filter((l) => !removeSet.has(l)) })
          }
        }
      }
      setLabelModalOpen(false)
      setBatchLabels([])
    } catch {
      // handled by interceptor
    }
  }

  // 拖拽添加种子文件/磁力链接
  const dropRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [, forceUpdate] = useState(0)
  const dragFiles = useRef<string[]>([])
  const dragText = useRef<string>('')

  useEffect(() => {
    const el = dropRef.current
    if (!el) return
    const prevent = (e: DragEvent) => { e.preventDefault(); e.stopPropagation() }
    const onDragOver = (e: DragEvent) => {
      prevent(e)
      setDragOver(true)
      dragFiles.current = Array.from(e.dataTransfer?.files || []).map(f => f.name)
      const text = e.dataTransfer?.getData('text/plain')
      if (text?.trim()) dragText.current = text.trim()
      forceUpdate(n => n + 1)
    }
    const onDragLeave = (e: DragEvent) => { if (!el.contains(e.relatedTarget as Node)) setDragOver(false) }
    const onDrop = (e: DragEvent) => {
      prevent(e)
      setDragOver(false)
      const files = Array.from(e.dataTransfer?.files || [])
      const text = e.dataTransfer?.getData('text/plain')?.trim() ?? ''
      if (files.length > 0) {
        setAddInitial({ files, text })
        setAddOpen(true)
        return
      }
      if (text) {
        setAddInitial({ files: [], text })
        setAddOpen(true)
      }
    }
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
    }
  }, [])

  const layout = (
    <div className="flex flex-col h-full tm-app-bg text-gray-800 dark:text-gray-100 p-3 gap-3">
      {/* 玻璃悬浮顶栏（桌面/移动共用，移动端左侧为抽屉按钮） */}
      <TopBar
        isMobile={isMobile}
        onOpenDrawer={() => setDrawerOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAdd={() => setAddOpen(true)}
        onOpenDashboard={() => setDashboardOpen(true)}
        onOpenLabels={() => {
          const first = torrents.find((t) => selectedIds.includes(t.id))
          setBatchLabels(first?.labels ?? [])
          setLabelModalOpen(true)
        }}
      />

      <div className="flex flex-1 min-h-0 gap-3">
        {!isMobile && <DesktopSidebar />}

        <main className="flex-1 flex flex-col min-w-0 gap-3" ref={dropRef}>
        {/* 分类标题行仅移动端保留（桌面端排序/视图/刷新已并入顶栏，批量操作并入 TopBar） */}
        {isMobile && <ListHeader count={filtered.length} isMobile onOpenDashboard={() => setDashboardOpen(true)} />}

        <div className="flex-1 min-h-0 overflow-hidden relative">
          {dragOver && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/20 border-2 border-dashed border-primary rounded-lg pointer-events-none">
              <div className="text-center">
                <Plus className="w-16 h-16 text-primary mb-4" />
                <p className="text-title1 font-semibold text-primary">{t('common.dragToAdd')}</p>
                {dragFiles.current.length > 0 && (
                  <p className="text-body mt-2 text-primary/80">{dragFiles.current.join(', ')}</p>
                )}
                {dragText.current && dragText.current.startsWith('magnet:') && (
                  <p className="text-body mt-1 text-primary/80 max-w-md truncate px-4">{dragText.current}</p>
                )}
              </div>
            </div>
          )}
          <TorrentList torrents={filtered} isMobile={isMobile} onOpenDetail={setDetailTorrent} onOpenBatchClean={() => setCleanOpen(true)} />
        </div>

        <StatusBar isMobile={isMobile} />

        {/* 悬浮工具条（图一：添加任务 / 全部开始暂停 / 打开目录） */}
        {isMobile && <FloatingBar isMobile onOpenAdd={() => setAddOpen(true)} />}
        </main>
      </div>
    </div>
  )

  return (
    <div className="h-full" style={{ height: '100vh' }}>
      {layout}

      {isMobile && (
        <MobileDrawer
          visible={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onOpenSettings={() => {
            setDrawerOpen(false)
            setSettingsOpen(true)
          }}
        />
      )}

      <AddTorrent
        open={addOpen}
        onClose={() => {
          setAddOpen(false)
          setAddInitial(null)
        }}
        initialFiles={addInitial?.files}
        initialText={addInitial?.text}
      />
      <Dashboard open={dashboardOpen} onClose={() => setDashboardOpen(false)} />
      <BatchCleanDialog open={cleanOpen} onClose={() => setCleanOpen(false)} />
      <TorrentDetail torrent={detailTorrent} onClose={() => setDetailTorrent(null)} onOpenChange={(open) => { if (!open) setDetailTorrent(null) }} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <PwaUpdatePrompt />
      <ConfirmHost />
      <Toaster richColors position="top-center" toastOptions={{ style: { borderRadius: '12px' } }} />

      {/* 批量打标签（覆盖 / 添加 / 移除 三种模式） */}
      <Dialog open={labelModalOpen} onOpenChange={setLabelModalOpen}>
        <DialogContent className="glass-panel-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{`${t('action.editLabels')} (${selectedIds.length})`}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-gray-100 dark:bg-gray-800/70">
            {([
              ['set', t('labels.modeSet')],
              ['add', t('labels.modeAdd')],
              ['remove', t('labels.modeRemove')],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setLabelMode(mode)}
                className={cn(
                  'h-7 rounded-md text-footnote font-medium transition-colors',
                  labelMode === mode
                    ? 'bg-white dark:bg-gray-700 text-primary shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Select
            value={batchLabels[batchLabels.length - 1]}
            onValueChange={(v) => setBatchLabels((prev) => [...prev, v])}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('action.editLabels')} />
            </SelectTrigger>
            <SelectContent className="glass-panel-strong">
              {allLabels.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {batchLabels.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {batchLabels.map((label, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-footnote bg-primary/10 text-primary">
                  {label}
                  <button onClick={() => setBatchLabels((prev) => prev.filter((_, i) => i !== idx))} className="ml-0.5 hover:text-red-500">×</button>
                </span>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setLabelModalOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={saveBatchLabels}>{t('common.confirm')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
