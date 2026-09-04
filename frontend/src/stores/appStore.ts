import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ColumnConfig, FilterOptions, Session, Torrent } from '@/types'

// 默认列配置（label 为 i18n key）
export const defaultColumns: ColumnConfig[] = [
  { key: 'name', label: 'columns.name', visible: true, width: 320 },
  { key: 'size', label: 'columns.size', visible: true, width: 100 },
  { key: 'progress', label: 'columns.progress', visible: true, width: 160 },
  { key: 'status', label: 'columns.status', visible: true, width: 110 },
  { key: 'download', label: 'columns.download', visible: true, width: 100 },
  { key: 'upload', label: 'columns.upload', visible: true, width: 100 },
  { key: 'ratio', label: 'columns.ratio', visible: true, width: 80 },
  { key: 'secondsSeeding', label: 'columns.secondsSeeding', visible: true, width: 90 },
  { key: 'eta', label: 'columns.eta', visible: true, width: 90 },
  { key: 'tracker', label: 'columns.tracker', visible: true, width: 150 },
  { key: 'peers', label: 'columns.peers', visible: false, width: 80 },
  { key: 'uploaded', label: 'columns.uploaded', visible: false, width: 100 },
  { key: 'downloaded', label: 'columns.downloaded', visible: false, width: 100 },
  { key: 'added', label: 'columns.added', visible: false, width: 130 },
  { key: 'doneDate', label: 'columns.doneDate', visible: false, width: 130 },
  { key: 'label', label: 'columns.label', visible: true, width: 110 },
  { key: 'queuePosition', label: 'columns.queuePosition', visible: false, width: 60 },
  { key: 'error', label: 'columns.error', visible: false, width: 160 },
  // 附加列（默认隐藏，表头右键开启）
  { key: 'priority', label: 'columns.priority', visible: true, width: 70 },
  { key: 'limits', label: 'columns.limits', visible: false, width: 110 },
  { key: 'fileCount', label: 'columns.fileCount', visible: false, width: 70 },
  { key: 'downloadDir', label: 'columns.downloadDir', visible: false, width: 180 },
  { key: 'hashString', label: 'columns.hashString', visible: false, width: 210 },
]

export const defaultFilters: FilterOptions = {
  status: ['all'],
  labels: [],
  sites: [],
  downloadDirs: [],
  error: [],
  search: '',
  sortBy: 'name',
  sortOrder: 'asc',
}

// 列表是否处于某一分组内：状态（非 all）/ 标签 / 站点 / 目录 / 错误任一命中即算。
// 搜索不算分组——它是叠加在任何分组之上的临时条件，清空分组时列表未必回到全部。
// 与 useFilter 的判定保持一致：status 为空数组同样视为不过滤。
function inGroup(f: FilterOptions): boolean {
  return (
    (f.status[0] != null && f.status[0] !== 'all') ||
    f.labels.length > 0 ||
    f.sites.length > 0 ||
    f.downloadDirs.length > 0 ||
    f.error.length > 0
  )
}

export interface AppState {
  torrents: Torrent[]
  selectedIds: number[]
  // Shift 连选的锚点（最后点击的种子 id，不持久化）
  selectAnchorId: number | null
  // 从分组切回「全部」后待定位的种子（列表视图滚动到其中第一个可见项后清空，不持久化）
  scrollTargetIds: number[]
  filters: FilterOptions
  sortField: string
  sortOrder: 'asc' | 'desc'
  theme: 'light' | 'dark'
  themePreset: string
  language: 'zh' | 'en'
  sidebarWidth: number
  columns: ColumnConfig[]
  session: Session | null
  wsStatus: 'connecting' | 'connected' | 'disconnected'
  torrentSites: Record<number, string[]>
  // 语义路径映射（原始路径 → 宿主展示名，仅 fnOS；不持久化，随语言切换重建）
  semanticDirs: Record<string, string>
  fontSize: number
  singleLine: boolean
  // 种子行首的选择框是否显示（关闭后列表更紧凑，仍可用 Ctrl/Shift 点选）
  showCheckboxes: boolean
  // 侧边栏分组显隐（右键菜单控制）
  sidebarMenuVisible: { status: boolean; labels: boolean; dirs: boolean; sites: boolean; error: boolean }
  // 状态过滤器子菜单：状态项是否在侧边栏显示（缺省视为显示）
  statusFilterVisible: Record<string, boolean>
  // 双击侧边栏分组项 → 全选该分组种子
  enableDoubleClickSelect: boolean
  groupShowSize: boolean
  showStats: boolean
  // 列表视图模式（表格/网格）
  viewMode: 'table' | 'grid'
  // 侧边栏折叠状态
  sidebarCollapsed: { labels: boolean; dirs: boolean; sites: boolean; error: boolean }

  // 液态玻璃无障碍降级：默认镜像系统 prefers-*，a11yTouched 后由用户接管
  reduceGlass: boolean
  reduceMotion: boolean
  moreContrast: boolean
  a11yTouched: boolean
  // 玻璃浓度百分比（20–100），驱动 --glass-user-opacity 填充乘数与 --glass-boost 折射联动
  glassOpacity: number
  // 背景壁纸（data URL，空串 = 关闭）。玻璃折射的主要色源
  wallpaper: string

  // 组内总限速管理弹窗（跨组件打开：侧边栏分组右键 → 预填站点/标签）
  speedOpen: boolean
  speedPreset: { sites: string[]; labels: string[] } | null

  openSpeedPolicy: (preset?: { sites?: string[]; labels?: string[] }) => void
  closeSpeedPolicy: () => void
  setSortField: (field: string) => void
  setSortOrder: (order: 'asc' | 'desc') => void
  setFontSize: (n: number) => void
  setGroupShowSize: (v: boolean) => void
  setShowStats: (v: boolean) => void
  setViewMode: (m: 'table' | 'grid') => void
  setSingleLine: (v: boolean) => void
  setShowCheckboxes: (v: boolean) => void
  setTorrentSites: (s: Record<number, string[]>) => void
  setSemanticDirs: (patch: Record<string, string>) => void
  resetSemantic: () => void
  setWsStatus: (s: AppState['wsStatus']) => void
  setTorrents: (list: Torrent[]) => void
  applyTorrentDiff: (d: { added: Torrent[]; updated: Torrent[]; removed: number[] }) => void
  toggleSelect: (id: number) => void
  setSelection: (ids: number[]) => void
  setSelectAnchor: (id: number | null) => void
  selectAll: () => void
  clearSelection: () => void
  setFilters: (patch: Partial<FilterOptions>) => void
  consumeScrollTarget: () => void
  toggleTheme: () => void
  setTheme: (t: 'light' | 'dark') => void
  setThemePreset: (p: string) => void
  setLanguage: (lang: 'zh' | 'en') => void
  setSidebarWidth: (w: number) => void
  toggleColumn: (key: string) => void
  setColumnWidth: (key: string, width: number) => void
  setColumns: (cols: ColumnConfig[]) => void
  resetColumns: () => void
  setSession: (s: Session | null) => void
  setSidebarCollapsed: (patch: Partial<AppState['sidebarCollapsed']>) => void
  setSidebarMenuVisible: (patch: Partial<AppState['sidebarMenuVisible']>) => void
  setStatusFilterVisible: (key: string, v: boolean) => void
  setEnableDoubleClickSelect: (v: boolean) => void
  setReduceGlass: (v: boolean) => void
  setReduceMotion: (v: boolean) => void
  setMoreContrast: (v: boolean) => void
  setGlassOpacity: (n: number) => void
  setWallpaper: (v: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      torrents: [],
      selectedIds: [],
      selectAnchorId: null,
      scrollTargetIds: [],
      filters: defaultFilters,
      sortField: 'name',
      sortOrder: 'asc',
      theme: 'light',
      themePreset: 'blue',
      language: 'zh',
      sidebarWidth: 300,
      columns: defaultColumns,
      session: null,
      wsStatus: 'connecting',
      torrentSites: {},
      semanticDirs: {},
      fontSize: 16,
      singleLine: true,
      showCheckboxes: true,
      sidebarMenuVisible: { status: true, labels: true, dirs: true, sites: true, error: true },
      statusFilterVisible: {},
      enableDoubleClickSelect: false,
      groupShowSize: true,
      showStats: true,
      viewMode: 'grid',
      sidebarCollapsed: { labels: false, dirs: false, sites: false, error: false },
      reduceGlass: false,
      reduceMotion: false,
      moreContrast: false,
      a11yTouched: false,
      glassOpacity: 100,
      wallpaper: '',
      speedOpen: false,
      speedPreset: null,

      openSpeedPolicy: (preset) => set({ speedOpen: true, speedPreset: preset ? { sites: preset.sites ?? [], labels: preset.labels ?? [] } : null }),
      closeSpeedPolicy: () => set({ speedOpen: false, speedPreset: null }),
      setFontSize: (n) => set({ fontSize: n }),
      setGroupShowSize: (v) => set({ groupShowSize: v }),
      setShowStats: (v) => set({ showStats: v }),
      setViewMode: (m) => set({ viewMode: m }),
      setSingleLine: (v) => set({ singleLine: v }),
      setShowCheckboxes: (v) => set({ showCheckboxes: v }),
      setTorrentSites: (s) => set({ torrentSites: s }),
      setSemanticDirs: (patch) => set((state) => ({ semanticDirs: { ...state.semanticDirs, ...patch } })),
      resetSemantic: () => set({ semanticDirs: {} }),
      setWsStatus: (s) => set({ wsStatus: s }),
      setTorrents: (list) => set({ torrents: list }),
      // 增量推送合并：仅更新变化的种子，未变化的保持引用不变（利于 memo 跳过重渲染）
      applyTorrentDiff: ({ added, updated, removed }) =>
        set((state) => {
          const map = new Map(state.torrents.map((t) => [t.id, t]))
          for (const id of removed) map.delete(id)
          for (const t of added) map.set(t.id, t)
          for (const t of updated) map.set(t.id, t)
          return { torrents: Array.from(map.values()) }
        }),
      toggleSelect: (id) =>
        set((state) => ({
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds.filter((x) => x !== id)
            : [...state.selectedIds, id],
        })),
      setSelection: (ids) => set({ selectedIds: ids }),
      setSelectAnchor: (id) => set({ selectAnchorId: id }),
      selectAll: () => set((state) => ({ selectedIds: state.torrents.map((t) => t.id) })),
      clearSelection: () => set({ selectedIds: [] }),
      setSortField: (field) => set({ sortField: field }),
      setSortOrder: (order) => set({ sortOrder: order }),
      setFilters: (patch) =>
        set((state) => {
          const filters = { ...state.filters, ...patch }
          // 从任一分组（状态/标签/站点/目录/错误）切回「全部」时列表会重排，
          // 记下当前选区，让列表视图渲染后滚回之前选中的种子（锚点优先）
          let scrollTargetIds = state.scrollTargetIds
          if (inGroup(state.filters) && !inGroup(filters) && state.selectedIds.length > 0) {
            const anchor = state.selectAnchorId
            scrollTargetIds =
              anchor != null && state.selectedIds.includes(anchor)
                ? [anchor, ...state.selectedIds.filter((id) => id !== anchor)]
                : [...state.selectedIds]
          }
          return { filters, scrollTargetIds }
        }),
      consumeScrollTarget: () => set({ scrollTargetIds: [] }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setTheme: (t) => set({ theme: t }),
      setThemePreset: (p) => set({ themePreset: p }),
      setLanguage: (lang) => {
        localStorage.setItem('tm-language', lang)
        set({ language: lang })
      },
      setSidebarWidth: (w) => set({ sidebarWidth: Math.min(Math.max(w, 180), 480) }),
      toggleColumn: (key) =>
        set((state) => ({
          columns: state.columns.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)),
        })),
      setColumnWidth: (key, width) =>
        set((state) => ({
          columns: state.columns.map((c) =>
            // 上限同样要钳住：只 clamp 下限的话，一甩鼠标就能把单列拉出整个视口
            c.key === key ? { ...c, width: Math.min(900, Math.max(60, Math.round(width))) } : c,
          ),
        })),
      setColumns: (cols) => set({ columns: cols }),
      resetColumns: () => set({ columns: defaultColumns }),
      setSession: (s) => set({ session: s }),
      setSidebarCollapsed: (patch) =>
        set((state) => ({ sidebarCollapsed: { ...state.sidebarCollapsed, ...patch } })),
      setSidebarMenuVisible: (patch) =>
        set((state) => ({ sidebarMenuVisible: { ...state.sidebarMenuVisible, ...patch } })),
      setStatusFilterVisible: (key, v) =>
        set((state) => ({ statusFilterVisible: { ...state.statusFilterVisible, [key]: v } })),
      setEnableDoubleClickSelect: (v) => set({ enableDoubleClickSelect: v }),
      setReduceGlass: (v) => set({ reduceGlass: v, a11yTouched: true }),
      setReduceMotion: (v) => set({ reduceMotion: v, a11yTouched: true }),
      setMoreContrast: (v) => set({ moreContrast: v, a11yTouched: true }),
      setGlassOpacity: (n) => set({ glassOpacity: Math.min(100, Math.max(20, Math.round(n))) }),
      setWallpaper: (v) => set({ wallpaper: v }),
    }),
    {
      name: 'tm-store',
      partialize: (state) => ({
        theme: state.theme,
        themePreset: state.themePreset,
        language: state.language,
        sidebarWidth: state.sidebarWidth,
        columns: state.columns,
        filters: state.filters,
        sortField: state.sortField,
        sortOrder: state.sortOrder,
        fontSize: state.fontSize,
        singleLine: state.singleLine,
        showCheckboxes: state.showCheckboxes,
        sidebarMenuVisible: state.sidebarMenuVisible,
        statusFilterVisible: state.statusFilterVisible,
        enableDoubleClickSelect: state.enableDoubleClickSelect,
        groupShowSize: state.groupShowSize,
        showStats: state.showStats,
        viewMode: state.viewMode,
        sidebarCollapsed: state.sidebarCollapsed,
        reduceGlass: state.reduceGlass,
        reduceMotion: state.reduceMotion,
        moreContrast: state.moreContrast,
        a11yTouched: state.a11yTouched,
        glassOpacity: state.glassOpacity,
        wallpaper: state.wallpaper,
      }),
      // 兼容旧版本持久化数据：补齐新增字段，避免运行时 undefined 崩溃
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>
        // 补齐持久化列配置中缺失的新列（保留用户自定义顺序，新列追加到末尾）
        const persistedCols = p.columns ?? []
        const missing = defaultColumns.filter((dc) => !persistedCols.some((c) => c.key === dc.key))
        const columns = missing.length ? [...persistedCols, ...missing] : persistedCols
        return {
          ...current,
          ...p,
          columns,
          filters: { ...defaultFilters, ...(p.filters ?? {}) },
          sidebarMenuVisible: p.sidebarMenuVisible ?? { status: true, labels: true, dirs: true, sites: true, error: true },
          statusFilterVisible: p.statusFilterVisible ?? {},
          showCheckboxes: p.showCheckboxes ?? true,
          enableDoubleClickSelect: p.enableDoubleClickSelect ?? false,
          groupShowSize: p.groupShowSize ?? true,
          showStats: p.showStats ?? true,
          viewMode: p.viewMode ?? 'table',
          themePreset: p.themePreset ?? 'blue',
          wallpaper: p.wallpaper ?? '',
          sidebarCollapsed: p.sidebarCollapsed ?? { labels: false, dirs: false, sites: false, error: false },
        }
      },
    },
  ),
)
