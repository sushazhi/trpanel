import { useState } from 'react'
import { ArrowDownUp, ArrowUpDown, BarChart3, LayoutGrid, LayoutList, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { torrentApi } from '@/api/torrent'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const STATUS_LABEL: Record<string, string> = {
  all: 'nav.all',
  active: 'nav.active',
  downloading: 'nav.downloading',
  seeding: 'nav.seeding',
  'waiting-seed': 'nav.waitingSeed',
  completed: 'nav.completed',
  paused: 'nav.paused',
  verifying: 'nav.verifying',
  error: 'nav.error',
}

const SORT_OPTIONS = [
  { key: 'name', label: 'filter.sort.name' },
  { key: 'size', label: 'filter.sort.size' },
  { key: 'added', label: 'filter.sort.date' },
  { key: 'doneDate', label: 'filter.sort.doneDate' },
  { key: 'ratio', label: 'filter.sort.ratio' },
  { key: 'secondsSeeding', label: 'filter.sort.secondsSeeding' },
  { key: 'download', label: 'filter.sort.dlSpeed' },
  { key: 'upload', label: 'filter.sort.upSpeed' },
  { key: 'progress', label: 'filter.sort.progress' },
  { key: 'uploaded', label: 'filter.sort.uploaded' },
  { key: 'downloaded', label: 'filter.sort.downloaded' },
] as const

// 排序 / 视图切换 / 刷新 控制组（桌面端并入 TopBar，移动端留在 ListHeader）
export function ListControls({ compact, isMobile, onOpenDashboard }: { compact?: boolean; isMobile?: boolean; onOpenDashboard?: () => void }) {
  const { t } = useTranslation()
  const sortField = useAppStore((s) => s.sortField)
  const sortOrder = useAppStore((s) => s.sortOrder)
  const setSortField = useAppStore((s) => s.setSortField)
  const setSortOrder = useAppStore((s) => s.setSortOrder)
  const viewMode = useAppStore((s) => s.viewMode)
  const setViewMode = useAppStore((s) => s.setViewMode)
  const setTorrents = useAppStore((s) => s.setTorrents)
  const [sortOpen, setSortOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const changeSort = (field: string) => {
    const nextAsc = sortField === field ? (sortOrder === 'asc' ? 'desc' : 'asc') : 'asc'
    setSortField(field)
    setSortOrder(nextAsc)
  }

  const refresh = async () => {
    setRefreshing(true)
    try {
      const list = await torrentApi.list()
      setTorrents(list)
      toast.success(t('toast.refreshed'))
    } catch {
      // 拦截器已提示
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className={cn('flex items-center gap-1.5 shrink-0', compact && 'gap-0.5')}>
      {/* 排序 */}
      <Popover open={sortOpen} onOpenChange={setSortOpen}>
        <PopoverTrigger asChild>
          {compact ? (
            <button
              className={cn(
                'h-9 w-9 rounded-full flex items-center justify-center transition-colors',
                sortField !== 'name'
                  ? 'text-primary bg-primary/10'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-white/10',
              )}
              title={`${t('filter.sortBy')}: ${t(`filter.sort.${sortField}`)}`}
            >
              {sortField === 'name' ? (
                <ArrowUpDown className="w-4 h-4" />
              ) : (
                <ArrowDownUp className={cn('w-4 h-4', sortOrder === 'asc' ? 'rotate-0' : 'rotate-180')} />
              )}
            </button>
          ) : (
            <button
              className={cn(
                'h-7 px-2.5 rounded-lg text-footnote flex items-center gap-1.5 transition-colors',
                sortField !== 'name'
                  ? 'text-primary bg-primary/10'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-white/10',
              )}
            >
              {sortField === 'name' ? (
                <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />
              ) : (
                <ArrowDownUp className={cn('w-3.5 h-3.5', sortOrder === 'asc' ? 'rotate-0' : 'rotate-180')} />
              )}
              <span>{t('filter.sortBy')}: </span>
              <span className="font-medium">{t(`filter.sort.${sortField}`)}</span>
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent className="glass-panel-strong p-1 w-40" align="end">
          <div className="space-y-0.5">
            {SORT_OPTIONS.map((opt) => {
              const isActive = sortField === opt.key
              return (
                <button
                  key={opt.key}
                  onClick={() => { changeSort(opt.key); setSortOpen(false) }}
                  className={cn(
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-footnote transition-colors',
                    isActive
                      ? 'bg-primary/15 text-primary font-medium'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/10',
                  )}
                >
                  <span>{t(opt.label)}</span>
                  {isActive && <ArrowDownUp className={cn('w-3 h-3', sortOrder === 'asc' ? 'rotate-0' : 'rotate-180')} />}
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* 视图切换（移动端隐藏） */}
      {!isMobile && (
        <button
          onClick={() => setViewMode(viewMode === 'grid' ? 'table' : 'grid')}
          className={cn(
            compact ? 'h-9 w-9 rounded-full' : 'h-7 w-7 rounded-lg',
            'flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-primary hover:bg-white/60 dark:hover:bg-white/10 transition-colors',
          )}
          title={viewMode === 'grid' ? t('dashboard.viewTable') : t('dashboard.viewGrid')}
        >
          {viewMode === 'grid' ? <LayoutList className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
        </button>
      )}

      {/* 刷新 */}
      <button
        onClick={() => void refresh()}
        className={cn(
          compact ? 'h-9 w-9 rounded-full' : 'h-7 w-7 rounded-lg',
          'flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-primary hover:bg-white/60 dark:hover:bg-white/10 transition-colors',
        )}
        title={t('common.refresh')}
      >
        <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
      </button>

      {/* 统计仪表盘 */}
      {onOpenDashboard && (
        <button
          onClick={onOpenDashboard}
          className={cn(
            compact ? 'h-9 w-9 rounded-full' : 'h-7 w-7 rounded-lg',
            'flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-primary hover:bg-white/60 dark:hover:bg-white/10 transition-colors',
          )}
          title={t('dashboard.title')}
        >
          <BarChart3 className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

// 主区标题栏：分类标题 + 计数 + 排序/视图/刷新（仅移动端渲染）
export function ListHeader({ count, isMobile, onOpenDashboard }: { count: number; isMobile?: boolean; onOpenDashboard?: () => void }) {
  const { t } = useTranslation()
  const filters = useAppStore((s) => s.filters)
  const activeStatus = filters.status[0] || 'all'
  const titleKey = STATUS_LABEL[activeStatus] ?? 'nav.all'

  return (
    <div className="shrink-0 glass-panel-strong rounded-2xl h-11 px-4 flex items-center gap-3">
      {/* 标题 + 计数 */}
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-subhead font-semibold text-gray-800 dark:text-gray-100 truncate">{t(titleKey)}</span>
        <span className="text-footnote text-gray-400 tm-mono shrink-0">({count})</span>
      </div>

      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        <ListControls isMobile onOpenDashboard={onOpenDashboard} />
      </div>
    </div>
  )
}
