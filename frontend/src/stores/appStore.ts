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

export interface AppState {
  torrents: Torrent[]
  selectedIds: number[]
  // Shift 连选的锚点（最后点击的种子 id，不持久化）
  selectAnchorId: number | null
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

  setSortField: (field: string) => void
  setSortOrder: (order: 'asc' | 'desc') => void
  setFontSize: (n: number) => void
  setGroupShowSize: (v: boolean) => void
  setShowStats: (v: boolean) => void
  setViewMode: (m: 'table' | 'grid') => void
  setSingleLine: (v: boolean) => void
  setShowCheckboxes: (v: boolean) => void
  setTorrentSites: (s: Record<number, string[]>) => void
  setWsStatus: (s: AppState['wsStatus']) => void
  setTorrents: (list: Torrent[]) => void
  toggleSelect: (id: number) => void
  setSelection: (ids: number[]) => void
  setSelectAnchor: (id: number | null) => void
  selectAll: () => void
  clearSelection: () => void
  setFilters: (patch: Partial<FilterOptions>) => void
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
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      torrents: [],
      selectedIds: [],
      selectAnchorId: null,
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

      setFontSize: (n) => set({ fontSize: n }),
      setGroupShowSize: (v) => set({ groupShowSize: v }),
      setShowStats: (v) => set({ showStats: v }),
      setViewMode: (m) => set({ viewMode: m }),
      setSingleLine: (v) => set({ singleLine: v }),
      setShowCheckboxes: (v) => set({ showCheckboxes: v }),
      setTorrentSites: (s) => set({ torrentSites: s }),
      setWsStatus: (s) => set({ wsStatus: s }),
      setTorrents: (list) => set({ torrents: list }),
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
      setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
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
            c.key === key ? { ...c, width: Math.max(60, Math.round(width)) } : c,
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
          sidebarCollapsed: p.sidebarCollapsed ?? { labels: false, dirs: false, sites: false, error: false },
        }
      },
    },
  ),
)
