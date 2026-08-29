import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { client, request } from '@/api/client'
import { APP_BASE } from '@/platform/appBase'
import { serverApi, sessionApi, torrentApi, updateApi, type UpdateCheckResult, type UpdateStatus } from '@/api/torrent'
import { AutoMoveManager } from '@/components/AutoMoveManager'
import { RSSManager } from '@/components/RSSManager'
import { usePlatform } from '@/platform'
import { useAppStore } from '@/stores/appStore'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { ServerInfo } from '@/types'

// 定时限速：周几位掩码（Transmission 语义：Mon=1 ... Sun=64，0=每天）
const DAY_BITS = [
  { bit: 1, label: 'Mon' },
  { bit: 2, label: 'Tue' },
  { bit: 4, label: 'Wed' },
  { bit: 8, label: 'Thu' },
  { bit: 16, label: 'Fri' },
  { bit: 32, label: 'Sat' },
  { bit: 64, label: 'Sun' },
]
// 全部七天的掩码（0 表示"每天"，等价于七天全选）
const DAY_ALL = DAY_BITS.reduce((acc, d) => acc | d.bit, 0)

// 每 30 分钟一个时间选项
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2)
  const m = (i % 2) * 30
  const s = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return { value: s, label: s }
})
const timeToStr = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const strToMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0) }

// ========== 设置行 ==========
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <span className="text-body text-gray-600 dark:text-gray-300">{label}</span>
        {hint && <p className="text-caption1 text-gray-400 mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

// ========== 数字输入（替代 antd InputNumber） ==========
interface NumInputProps {
  value?: number | null
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
  onChange?: (v?: number) => void
}

function NumInput({ value, min, max, step, disabled, className, onChange }: NumInputProps) {
  return (
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={cn('h-8 w-20', className)}
      value={value === undefined || value === null ? '' : String(value)}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '') { onChange?.(undefined); return }
        const n = Number(raw)
        if (!Number.isNaN(n)) onChange?.(n)
      }}
    />
  )
}

// ========== 路径输入框 ==========
// 受控于本地 state，仅在失焦/回车且内容变化时提交一次，
// 避免目录类字段每敲一个字符就发一次 PUT /session（请求洪水 + 输入跳动）
function DirInput({ field }: { field: 'downloadDir' | 'incompleteDir' }) {
  const session = useAppStore((s) => s.session)
  const setSession = useAppStore((s) => s.setSession)
  const { t } = useTranslation()
  const { can, pickFolder } = usePlatform()
  const serverValue = session?.[field] ?? ''
  const [draft, setDraft] = useState(serverValue)
  const [editing, setEditing] = useState(false)

  // 外部值变化（切换服务器/刷新）且当前未在编辑时同步
  useEffect(() => {
    if (!editing) setDraft(serverValue)
  }, [serverValue, editing])

  const commit = async (value: string) => {
    setEditing(false)
    const next = value.trim()
    if (next === serverValue || !session) return
    try {
      await sessionApi.update({ [field]: next })
      setSession({ ...session, [field]: next })
      toast.success(t('toast.updated'))
    } catch {
      setDraft(serverValue) // 失败回滚本地输入
    }
  }

  // 宿主目录选择器：选中后直接填入并提交
  const pick = async () => {
    const p = await pickFolder()
    if (!p) return
    setDraft(p)
    await commit(p)
  }

  return (
    <div className="flex items-center gap-1.5 w-1/2">
      <Input
        value={draft}
        onFocus={() => setEditing(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void commit(draft) }
          if (e.key === 'Escape') { setDraft(serverValue); setEditing(false) }
        }}
        className="h-8 text-footnote flex-1 min-w-0"
      />
      {can('fs.pickFolder') && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          title={t('action.selectDir')}
          onClick={() => void pick()}
          className="h-8 shrink-0 gap-1 px-2"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t('action.selectDir')}</span>
        </Button>
      )}
    </div>
  )
}

// ========== 折叠面板 ==========
// 各分区展开/折叠状态按 id 持久化，刷新或重开弹窗后保持
const SECTION_STATE_KEY = 'tm-settings-sections'

function readSectionState(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SECTION_STATE_KEY) || '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

function Section({ id, title, children, defaultOpen }: { id: string; title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(() => readSectionState()[id] ?? !!defaultOpen)

  return (
    <details
      className="group rounded-xl border border-gray-200/40 dark:border-gray-700/30 bg-white/50 dark:bg-gray-800/40 overflow-hidden"
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open
        if (next === open) return
        setOpen(next)
        try {
          const all = readSectionState()
          all[id] = next
          localStorage.setItem(SECTION_STATE_KEY, JSON.stringify(all))
        } catch {
          // 持久化失败不影响交互
        }
      }}
    >
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer text-body font-medium select-none list-none [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-gray-400" />
      </summary>
      <div className="px-4 pb-4 space-y-1 border-t border-gray-100 dark:border-gray-700/40 pt-2">{children}</div>
    </details>
  )
}

// ========== 带标签的 Select ==========
interface LabeledSelectProps {
  value: string
  onValueChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}

function SmallSelect({ value, onValueChange, options, className }: LabeledSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn('h-8 w-24 text-footnote', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="glass-panel-solid">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ========== 关于与检查更新 ==========
// 检查更新依赖宿主的 app.update 能力（后端也只在对应平台注册 /api/update 路由）
function AboutSection({ transmissionVersion }: { transmissionVersion?: string }) {
  const { t } = useTranslation()
  const { can } = usePlatform()
  const canUpdate = can('app.update')
  const [info, setInfo] = useState<UpdateCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [updStatus, setUpdStatus] = useState<UpdateStatus | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPoll = () => {
    if (timer.current) {
      clearInterval(timer.current)
      timer.current = null
    }
  }
  useEffect(() => stopPoll, [])

  const check = async () => {
    setChecking(true)
    setUpdStatus(null)
    try {
      setInfo(await updateApi.check())
    } catch {
      // 拦截器已提示
    } finally {
      setChecking(false)
    }
  }

  const startPolling = () => {
    stopPoll()
    timer.current = setInterval(async () => {
      try {
        const s = await updateApi.status()
        setUpdStatus(s)
        if (!s.updating) stopPoll()
      } catch {
        // 单次轮询失败不中断整体进度跟踪
      }
    }, 2000)
  }

  const install = async () => {
    try {
      await updateApi.install()
      setUpdStatus({ updating: true, failed: false, progress: 0, message: '', latestVersion: info?.latestVersion ?? '', fpkFilename: '' })
      startPolling()
    } catch {
      // 拦截器已提示
    }
  }

  const downloading = !!updStatus?.updating
  const done = !!updStatus && !updStatus.updating && updStatus.progress >= 100
  const failed = !!updStatus && !updStatus.updating && updStatus.failed
  // 本次检查前服务端已下载好更新包：无需再点一键更新，直接下载
  const readyWithoutInstall = !!info?.downloadReady && !updStatus

  return (
    <div className="pt-3 mt-3 border-t border-gray-100 dark:border-gray-700 text-body text-gray-600 dark:text-gray-300">
      <div className="flex items-center justify-between gap-2">
        <span>
          {t('session.about')}: Transmission WebUI{canUpdate ? ' for fnOS' : ''}
          {transmissionVersion ? ` · Transmission ${transmissionVersion}` : ''}
        </span>
        {canUpdate && (
          <Button size="sm" variant="outline" className="h-8 text-footnote shrink-0" disabled={checking || downloading} onClick={() => void check()}>
            {checking ? t('common.loading') : t('session.checkUpdate')}
          </Button>
        )}
      </div>
      {canUpdate && <p className="mt-1">{t('session.checkUpdateHint')}</p>}
      {info && (
        <div className="mt-2 rounded-lg border border-gray-200/70 dark:border-gray-700/50 p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {info.hasUpdate ? (
              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{t('session.newVersionFound')}</Badge>
            ) : (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">{t('session.alreadyLatest')}</Badge>
            )}
            <span>v{info.currentVersion} → v{info.latestVersion} ({info.arch})</span>
          </div>
          {info.hasUpdate && info.changelog && (
            <div className="max-h-28 overflow-y-auto whitespace-pre-line text-gray-600 dark:text-gray-400">{info.changelog}</div>
          )}
          {info.hasUpdate && (
            <div className="space-y-2">
              {downloading && (
                <div>
                  <div className="h-1.5 rounded-full bg-gray-200/80 dark:bg-gray-700/60 overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${updStatus?.progress ?? 0}%` }} />
                  </div>
                  <p className="mt-1">{updStatus?.progress ?? 0}% · {updStatus?.message}</p>
                </div>
              )}
              {failed && <p className="text-red-500">{updStatus?.message || t('session.updateFailed')}</p>}
              {done || readyWithoutInstall ? (
                <div className="space-y-1">
                  <Button asChild size="sm" className="h-8 text-footnote">
                    <a href={APP_BASE + '/api/update/download'} download={updStatus?.fpkFilename || undefined}>
                      {t('session.downloadFpk')}
                    </a>
                  </Button>
                  <p>{t('session.fpkInstallHint')}</p>
                </div>
              ) : info.fpkUrl ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" className="h-8 text-footnote" disabled={downloading || checking} onClick={() => void install()}>
                    {downloading ? t('session.updating') : t('session.updateNow')}
                  </Button>
                  {info.releaseUrl && (
                    <Button asChild size="sm" variant="outline" className="h-8 text-footnote">
                      <a href={info.releaseUrl} target="_blank" rel="noreferrer">{t('session.viewRelease')}</a>
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 设置弹窗：连接配置 + 轮询 + 队列 + Blocklist + 端口测试 + 界面 + 高级会话
export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const session = useAppStore((s) => s.session)
  const setSession = useAppStore((s) => s.setSession)
  const setTorrentSites = useAppStore((s) => s.setTorrentSites)
  const fontSize = useAppStore((s) => s.fontSize)
  const setFontSize = useAppStore((s) => s.setFontSize)
  const singleLine = useAppStore((s) => s.singleLine)
  const setSingleLine = useAppStore((s) => s.setSingleLine)
  const showCheckboxes = useAppStore((s) => s.showCheckboxes)
  const setShowCheckboxes = useAppStore((s) => s.setShowCheckboxes)
  const reduceGlass = useAppStore((s) => s.reduceGlass)
  const reduceMotion = useAppStore((s) => s.reduceMotion)
  const moreContrast = useAppStore((s) => s.moreContrast)
  const setReduceGlass = useAppStore((s) => s.setReduceGlass)
  const setReduceMotion = useAppStore((s) => s.setReduceMotion)
  const setMoreContrast = useAppStore((s) => s.setMoreContrast)
  const glassOpacity = useAppStore((s) => s.glassOpacity)
  const setGlassOpacity = useAppStore((s) => s.setGlassOpacity)

  const [url, setUrl] = useState('')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [saving, setSaving] = useState(false)
  const [pollInterval, setPollInterval] = useState('2s')
  const [status, setStatus] = useState<{ connected: boolean; version?: string; error?: string } | null>(null)
  const [portOpen, setPortOpen] = useState<boolean | null>(null)
  const [testingPort, setTestingPort] = useState(false)
  const [blocklistUpdating, setBlocklistUpdating] = useState(false)
  const [blocklistUrl, setBlocklistUrl] = useState('')
  const [blocklistEnabled, setBlocklistEnabled] = useState(false)
  // 多服务器管理
  const [servers, setServers] = useState<ServerInfo[]>([])
  const [currentServerIndex, setCurrentServerIndex] = useState(0)
  const [openRss, setOpenRss] = useState(false)
  const [openMove, setOpenMove] = useState(false)

  // session 仅用于「打开弹窗时」初始化 blocklist，通过 ref 读取，
  // 避免 session 变化（如 patchSession 回写）导致整个表单被重置
  const sessionRef = useRef(session)
  sessionRef.current = session

  useEffect(() => {
    if (!open) return
    let cancelled = false
    request(clientGetSettings()).then((d) => {
      if (cancelled) return
      const data = d as { url: string; user: string; pollInterval?: string }
      setUrl(data.url)
      setUser(data.user)
      setPass('')
      if (data.pollInterval) setPollInterval(data.pollInterval)
    }).catch(() => {})
    sessionApi.status().then((s) => { if (!cancelled) setStatus(s) }).catch(() => { if (!cancelled) setStatus(null) })
    setPortOpen(null)
    setBlocklistUrl(sessionRef.current?.blocklistUrl ?? '')
    setBlocklistEnabled(sessionRef.current?.blocklistEnabled ?? false)
    // 加载多服务器列表（后端持久化）
    serverApi.list().then((d) => {
      if (cancelled) return
      setServers(d.servers)
      setCurrentServerIndex(d.activeServer)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [open])

  const save = async () => {
    if (!url.trim()) return
    setSaving(true)
    try {
      await request(clientPutSettings({ url: url.trim(), user, pass, pollInterval }))
      toast.success(t('toast.updated'))
      sessionApi.get().then(setSession).catch(() => setSession(null))
      sessionApi.status().then(setStatus).catch(() => setStatus(null))
      onClose()
    } catch {
      // 拦截器已提示
    } finally {
      setSaving(false)
    }
  }

  const patchSession = async (patch: Record<string, unknown>) => {
    try {
      await sessionApi.update(patch)
      setSession(session ? { ...session, ...patch } : session)
      toast.success(t('toast.updated'))
    } catch {
      // 拦截器已提示
    }
  }

  const testPort = async () => {
    setTestingPort(true)
    try {
      const res = await sessionApi.portTest()
      setPortOpen(res.open)
    } catch {
      // 拦截器已提示
    } finally {
      setTestingPort(false)
    }
  }

  const updateBlocklist = async () => {
    setBlocklistUpdating(true)
    try {
      const res = await sessionApi.blocklistUpdate()
      toast.success(`${t('toast.updated')} · ${res.entries}`)
    } catch {
      // 拦截器已提示
    } finally {
      setBlocklistUpdating(false)
    }
  }

  const saveServers = async (next: ServerInfo[]) => {
    setServers(next)
    try {
      await serverApi.save(next)
      toast.success(t('toast.updated'))
    } catch {
      // 拦截器已提示
    }
  }

  // 删除服务器：走专用接口，后端会同步修正 activeServer 索引
  const removeServer = async (idx: number) => {
    try {
      await serverApi.remove(idx)
      const list = await serverApi.list()
      setServers(list.servers)
      setCurrentServerIndex(list.activeServer)
      toast.success(t('toast.updated'))
    } catch {
      // 拦截器已提示
    }
  }

  const switchToServer = async (idx: number) => {
    try {
      const res = await serverApi.switch(idx)
      setCurrentServerIndex(res.index)
      toast.success(t('common.connected'))
      sessionApi.get().then(setSession).catch(() => setSession(null))
      sessionApi.status().then(setStatus).catch(() => setStatus(null))
      torrentApi.sites().then(setTorrentSites).catch(() => {})
    } catch {
      // 拦截器已提示
    }
  }

  const connectionPane = (
    <div className="space-y-3">
      <div className="space-y-1">
        <span className="text-body text-gray-600 dark:text-gray-300">{t('session.transmissionUrl')}</span>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://localhost:9091/transmission/rpc"
          className="h-8 text-footnote"
        />
      </div>
      <div className="space-y-1">
        <span className="text-body text-gray-600 dark:text-gray-300">{t('session.username')}</span>
        <Input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" className="h-8 text-footnote" />
      </div>
      <div className="space-y-1">
        <span className="text-body text-gray-600 dark:text-gray-300">{t('session.password')}</span>
        <Input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoComplete="new-password"
          placeholder="••••••"
          className="h-8 text-footnote"
        />
      </div>
      <Row label={t('session.pollInterval')} hint={t('session.pollIntervalHint')}>
        <SmallSelect
          value={pollInterval}
          onValueChange={setPollInterval}
          options={[
            { value: '1s', label: '1s' },
            { value: '2s', label: '2s' },
            { value: '5s', label: '5s' },
            { value: '10s', label: '10s' },
          ]}
        />
      </Row>
      <Row label={t('session.portTest')} hint={t('session.portTestHint')}>
        <div className="flex items-center gap-2">
          {portOpen !== null && (
            portOpen
              ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">{t('session.portOpen')}</Badge>
              : <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">{t('session.portClosed')}</Badge>
          )}
          <Button size="sm" className="h-8 text-footnote" disabled={testingPort} onClick={testPort}>
            {testingPort ? t('common.loading') : t('session.portTest')}
          </Button>
        </div>
      </Row>
    </div>
  )

  const uiPane = (
    <div className="space-y-1">
      <Row label={t('session.fontSize')} hint={t('session.fontSizeHint')}>
        <SmallSelect
          value={String(fontSize)}
          onValueChange={(v) => setFontSize(Number(v))}
          options={[12, 13, 14, 15, 16, 17, 18, 19, 20].map((n) => ({ value: String(n), label: `${n}px` }))}
        />
      </Row>
      <Row label={t('session.singleLine')} hint={t('session.singleLineHint')}>
        <Switch checked={singleLine} onCheckedChange={setSingleLine} />
      </Row>
      <Row label={t('session.showCheckboxes')} hint={t('session.showCheckboxesHint')}>
        <Switch checked={showCheckboxes} onCheckedChange={setShowCheckboxes} />
      </Row>
      <Row label={t('session.glassOpacity')} hint={t('session.glassOpacityHint')}>
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="range"
            min={20}
            max={100}
            step={5}
            value={glassOpacity}
            disabled={reduceGlass}
            onChange={(e) => setGlassOpacity(Number(e.target.value))}
            className="w-36 h-8 accent-primary disabled:opacity-40 cursor-pointer"
            aria-label={t('session.glassOpacity')}
          />
          <span className="text-footnote text-gray-400 tm-mono w-10 text-right">{glassOpacity}%</span>
        </div>
      </Row>

      <div className="pt-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-body font-semibold text-gray-700 dark:text-gray-200">{t('session.a11yTitle')}</span>
          <span className="text-caption1 text-gray-400">{t('session.a11yHint')}</span>
        </div>
        <div className="space-y-1 mt-1">
          <Row label={t('session.reduceGlass')} hint={t('session.reduceGlassHint')}>
            <Switch checked={reduceGlass} onCheckedChange={setReduceGlass} />
          </Row>
          <Row label={t('session.reduceMotion')} hint={t('session.reduceMotionHint')}>
            <Switch checked={reduceMotion} onCheckedChange={setReduceMotion} />
          </Row>
          <Row label={t('session.moreContrast')} hint={t('session.moreContrastHint')}>
            <Switch checked={moreContrast} onCheckedChange={setMoreContrast} />
          </Row>
        </div>
      </div>

      <Row label={t('session.clearDirHistory')}>
        <Button size="sm" variant="outline" className="h-8 text-footnote" onClick={() => { localStorage.removeItem('tm_dirs'); toast.success(t('toast.updated')) }}>
          {t('session.clear')}
        </Button>
      </Row>
    </div>
  )

  const sessionItems = session
    ? [
        {
          key: 'download',
          title: t('session.download'),
          children: (
            <div className="space-y-1">
              <Row label={t('session.downloadDir')}>
                <DirInput field="downloadDir" />
              </Row>
              <Row label={t('session.startAdded')} hint={t('session.startAddedHint')}>
                <Switch checked={session.startAdded} onCheckedChange={(v) => patchSession({ startAdded: v })} />
              </Row>
              <Row label={t('session.incompleteDirEnabled')} hint={t('session.incompleteDirEnabledHint')}>
                <Switch checked={session.incompleteDirEnabled} onCheckedChange={(v) => patchSession({ incompleteDirEnabled: v })} />
              </Row>
              <Row label={t('session.incompleteDir')}>
                <DirInput field="incompleteDir" />
              </Row>
              <Row label={t('session.renamePartialFiles')} hint={t('session.renamePartialFilesHint')}>
                <Switch checked={session.renamePartialFiles} onCheckedChange={(v) => patchSession({ renamePartialFiles: v })} />
              </Row>
              <Row label={t('session.trashOriginalTorrentFiles')} hint={t('session.trashOriginalTorrentFilesHint')}>
                <Switch checked={session.trashOriginalTorrentFiles} onCheckedChange={(v) => patchSession({ trashOriginalTorrentFiles: v })} />
              </Row>
              <Row label={t('session.cacheSizeMB')} hint={t('session.cacheSizeMBHint')}>
                <NumInput value={session.cacheSizeMB} min={0} onChange={(v) => v != null && patchSession({ cacheSizeMB: v })} />
              </Row>
            </div>
          ),
        },
        {
          key: 'seeding',
          title: t('session.seeding'),
          children: (
            <div className="space-y-1">
              <Row label={t('session.seedRatioLimit')} hint={t('session.seedRatioLimitHint')}>
                <NumInput value={session.seedRatioLimit} min={0} step={0.5} onChange={(v) => v != null && patchSession({ seedRatioLimit: v })} />
              </Row>
              <Row label={t('session.idleSeedingLimit')} hint={t('session.idleSeedingLimitHint')}>
                <div className="flex items-center gap-2">
                  <Switch checked={session.idleSeedingLimitEnabled} onCheckedChange={(v) => patchSession({ idleSeedingLimitEnabled: v })} />
                  <NumInput value={session.idleSeedingLimit} min={0} disabled={!session.idleSeedingLimitEnabled} onChange={(v) => v != null && patchSession({ idleSeedingLimit: v })} />
                </div>
              </Row>
            </div>
          ),
        },
        {
          key: 'queue',
          title: t('session.queue'),
          children: (
            <div className="space-y-1">
              <Row label={t('session.downloadQueueEnabled')} hint={t('session.downloadQueueEnabledHint')}>
                <Switch checked={session.downloadQueueEnabled} onCheckedChange={(v) => patchSession({ downloadQueueEnabled: v })} />
              </Row>
              <Row label={t('session.downloadQueueSize')} hint={t('session.downloadQueueSizeHint')}>
                <NumInput value={session.downloadQueueSize} min={0} disabled={!session.downloadQueueEnabled} onChange={(v) => v != null && patchSession({ downloadQueueSize: v })} />
              </Row>
              <Row label={t('session.seedQueueEnabled')} hint={t('session.seedQueueEnabledHint')}>
                <Switch checked={session.seedQueueEnabled} onCheckedChange={(v) => patchSession({ seedQueueEnabled: v })} />
              </Row>
              <Row label={t('session.seedQueueSize')} hint={t('session.seedQueueSizeHint')}>
                <NumInput value={session.seedQueueSize} min={0} disabled={!session.seedQueueEnabled} onChange={(v) => v != null && patchSession({ seedQueueSize: v })} />
              </Row>
              <Row label={t('session.queueStalledEnabled')} hint={t('session.queueStalledEnabledHint')}>
                <Switch checked={session.queueStalledEnabled} onCheckedChange={(v) => patchSession({ queueStalledEnabled: v })} />
              </Row>
              <Row label={t('session.queueStalledMinutes')} hint={t('session.queueStalledMinutesHint')}>
                <NumInput value={session.queueStalledMinutes} min={0} onChange={(v) => v != null && patchSession({ queueStalledMinutes: v })} />
              </Row>
            </div>
          ),
        },
        {
          key: 'bandwidth',
          title: t('session.bandwidth'),
          children: (
            <div className="space-y-1">
              <Row label={t('session.speedLimitDown')} hint={t('session.speedLimitDownHint')}>
                <div className="flex items-center gap-2">
                  <Switch checked={session.speedLimitDownOn} onCheckedChange={(v) => patchSession({ speedLimitDownOn: v })} />
                  <NumInput value={session.speedLimitDown} min={0} disabled={!session.speedLimitDownOn} onChange={(v) => v != null && patchSession({ speedLimitDown: v })} />
                </div>
              </Row>
              <Row label={t('session.speedLimitUp')} hint={t('session.speedLimitUpHint')}>
                <div className="flex items-center gap-2">
                  <Switch checked={session.speedLimitUpOn} onCheckedChange={(v) => patchSession({ speedLimitUpOn: v })} />
                  <NumInput value={session.speedLimitUp} min={0} disabled={!session.speedLimitUpOn} onChange={(v) => v != null && patchSession({ speedLimitUp: v })} />
                </div>
              </Row>
              <div className="text-caption1 text-gray-400 pt-1">{t('session.altSpeed')}</div>
              <Row label={t('session.altSpeedDown')} hint={t('session.altSpeedDownHint')}>
                <NumInput value={session.altSpeedDown} min={0} onChange={(v) => v != null && patchSession({ altSpeedDown: v })} />
              </Row>
              <Row label={t('session.altSpeedUp')} hint={t('session.altSpeedUpHint')}>
                <NumInput value={session.altSpeedUp} min={0} onChange={(v) => v != null && patchSession({ altSpeedUp: v })} />
              </Row>
              <Row label={t('session.altSpeedTime')} hint={t('session.altSpeedTimeHint')}>
                <Switch checked={session.altSpeedTimeEnabled} onCheckedChange={(v) => patchSession({ altSpeedTimeEnabled: v })} />
              </Row>
              {/* 周几多选（0=每天，其余为位掩码） */}
              <div className="flex items-center justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <span className="text-body text-gray-600 dark:text-gray-300">{t('session.scheduleDays')}</span>
                  <p className="text-caption1 text-gray-400 mt-0.5">{t('session.scheduleDaysHint')}</p>
                </div>
                <div className="flex gap-1">
                  {DAY_BITS.map((d) => {
                    const cur = session.altSpeedTimeDay
                    // 0（每天）在 UI 上等价于七天全选
                    const active = (cur === 0 ? DAY_ALL : cur) & d.bit ? true : false
                    return (
                      <button
                        key={d.bit}
                        title={t(`session.day${d.label}`)}
                        onClick={() => {
                          // 在全选（每天）状态下点击某天 = 取消那一天，而非"只选那一天"
                          const effective = cur === 0 ? DAY_ALL : cur
                          const next = effective ^ d.bit
                          if (next === 0) return // 至少保留一天
                          // 七天重新全选时写回 0（每天）
                          patchSession({ altSpeedTimeDay: next === DAY_ALL ? 0 : next })
                        }}
                        className={cn(
                          'h-8 w-8 text-caption1 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300',
                        )}
                      >
                        {t(`session.dayShort${d.label}`)}
                      </button>
                    )
                  })}
                </div>
              </div>
              <Row label={t('session.scheduleTime')} hint={t('session.scheduleTimeHint')}>
                <div className="flex items-center gap-1.5">
                  <SmallSelect
                    value={timeToStr(session.altSpeedTimeBegin)}
                    onValueChange={(v) => patchSession({ altSpeedTimeBegin: strToMin(v) })}
                    options={TIME_OPTIONS}
                    className="w-24"
                  />
                  <span className="text-gray-400">-</span>
                  <SmallSelect
                    value={timeToStr(session.altSpeedTimeEnd)}
                    onValueChange={(v) => patchSession({ altSpeedTimeEnd: strToMin(v) })}
                    options={TIME_OPTIONS}
                    className="w-24"
                  />
                </div>
              </Row>
            </div>
          ),
        },
        {
          key: 'network',
          title: t('session.network'),
          children: (
            <div className="space-y-1">
              <Row label={t('session.peerPort')} hint={t('session.peerPortHint')}>
                <NumInput value={session.peerPort} min={1} max={65535} disabled={session.peerPortRandomOnStart} onChange={(v) => v != null && patchSession({ peerPort: v })} />
              </Row>
              <Row label={t('session.peerPortRandomOnStart')} hint={t('session.peerPortRandomOnStartHint')}>
                <Switch checked={session.peerPortRandomOnStart} onCheckedChange={(v) => patchSession({ peerPortRandomOnStart: v })} />
              </Row>
              <Row label={t('session.upnp')}>
                <Switch checked={session.portForwardingEnabled} onCheckedChange={(v) => patchSession({ portForwardingEnabled: v })} />
              </Row>
              <p className="text-footnote text-gray-400 -mt-0.5 mb-1">{t('session.upnpHint')}</p>
              <Row label={t('session.encryption')} hint={t('session.encryptionHint')}>
                <SmallSelect
                  value={session.encryption || 'preferred'}
                  onValueChange={(v) => patchSession({ encryption: v })}
                  options={[
                    { value: 'required', label: t('session.encryptionRequired') },
                    { value: 'preferred', label: t('session.encryptionPreferred') },
                    { value: 'tolerated', label: t('session.encryptionTolerated') },
                  ]}
                />
              </Row>
              <Row label={t('session.peerLimitGlobal')} hint={t('session.peerLimitGlobalHint')}>
                <NumInput value={session.peerLimitGlobal} min={0} onChange={(v) => v != null && patchSession({ peerLimitGlobal: v })} />
              </Row>
              <div className="py-1">
                <div className="flex items-center justify-between">
                  <span className="text-body text-gray-600 dark:text-gray-300">{t('session.pexEnabled')}</span>
                  <Switch checked={session.pexEnabled} onCheckedChange={(v) => patchSession({ pexEnabled: v })} />
                </div>
                <p className="text-footnote text-gray-400 mt-0.5">{t('session.pexHint')}</p>
              </div>
              <div className="py-1">
                <div className="flex items-center justify-between">
                  <span className="text-body text-gray-600 dark:text-gray-300">{t('session.dhtEnabled')}</span>
                  <Switch checked={session.dhtEnabled} onCheckedChange={(v) => patchSession({ dhtEnabled: v })} />
                </div>
                <p className="text-footnote text-gray-400 mt-0.5">{t('session.dhtHint')}</p>
              </div>
              <div className="py-1">
                <div className="flex items-center justify-between">
                  <span className="text-body text-gray-600 dark:text-gray-300">{t('session.utpEnabled')}</span>
                  <Switch checked={session.utpEnabled} onCheckedChange={(v) => patchSession({ utpEnabled: v })} />
                </div>
                <p className="text-footnote text-gray-400 mt-0.5">{t('session.utpHint')}</p>
              </div>
              <div className="py-1">
                <div className="flex items-center justify-between">
                  <span className="text-body text-gray-600 dark:text-gray-300">{t('session.lpdEnabled')}</span>
                  <Switch checked={session.lpdEnabled} onCheckedChange={(v) => patchSession({ lpdEnabled: v })} />
                </div>
                <p className="text-footnote text-gray-400 mt-0.5">{t('session.lpdHint')}</p>
              </div>
            </div>
          ),
        },
        {
          key: 'other',
          title: t('session.other'),
          children: (
            <div className="space-y-1">
              <Row label={t('session.blocklistEnabled')} hint={t('session.blocklistEnabledHint')}>
                <Switch checked={blocklistEnabled} onCheckedChange={(v) => { setBlocklistEnabled(v); void patchSession({ blocklistEnabled: v }) }} />
              </Row>
              <Row label={t('session.blocklistSize')}>
                <span className="text-body text-gray-500">{session.blocklistSize.toLocaleString()}</span>
              </Row>
              <div className="flex items-center gap-2 py-1.5">
                <Input value={blocklistUrl} onChange={(e) => setBlocklistUrl(e.target.value)} placeholder={t('session.blocklistUrl')} className="h-8 text-footnote flex-1" />
                <Button size="sm" className="h-8 text-footnote shrink-0" disabled={blocklistUpdating} onClick={updateBlocklist}>
                  {blocklistUpdating ? t('common.loading') : t('session.blocklistUpdate')}
                </Button>
              </div>
              <div className="pt-2 mt-1 border-t border-gray-100 dark:border-gray-700 space-y-1">
                <Row label={t('session.scriptAdded')} hint={t('session.scriptAddedHint')}>
                  <Switch checked={session.scriptTorrentAddedEnabled} onCheckedChange={(v) => patchSession({ scriptTorrentAddedEnabled: v })} />
                </Row>
                <Input defaultValue={session.scriptTorrentAddedFilename} placeholder={t('session.scriptHint')} className="h-8 text-footnote" onBlur={(e) => patchSession({ scriptTorrentAddedFilename: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Row label={t('session.scriptDone')} hint={t('session.scriptDoneHint')}>
                  <Switch checked={session.scriptTorrentDoneEnabled} onCheckedChange={(v) => patchSession({ scriptTorrentDoneEnabled: v })} />
                </Row>
                <Input defaultValue={session.scriptTorrentDoneFilename} placeholder={t('session.scriptHint')} className="h-8 text-footnote" onBlur={(e) => patchSession({ scriptTorrentDoneFilename: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Row label={t('session.scriptDoneSeeding')} hint={t('session.scriptDoneSeedingHint')}>
                  <Switch checked={session.scriptTorrentDoneSeedingEnabled} onCheckedChange={(v) => patchSession({ scriptTorrentDoneSeedingEnabled: v })} />
                </Row>
                <Input defaultValue={session.scriptTorrentDoneSeedingFilename} placeholder={t('session.scriptHint')} className="h-8 text-footnote" onBlur={(e) => patchSession({ scriptTorrentDoneSeedingFilename: e.target.value })} />
              </div>
              <div className="space-y-1 pt-1">
                <span className="text-body text-gray-600 dark:text-gray-300">{t('session.defaultTrackers')}</span>
                <textarea
                  rows={3}
                  defaultValue={session.defaultTrackers?.join('\n')}
                  placeholder={t('common.eachLineOne')}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-body shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onBlur={(e) => patchSession({ defaultTrackers: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                />
              </div>
            </div>
          ),
        },
      ]
    : []

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>{t('session.title')}</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[70vh] space-y-3 pr-1">
          {/* 连接状态 */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-body">{t('session.connectionStatus')}:</span>
            {status ? (
              status.connected ? (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                  {t('common.connected')}{status.version ? ` · ${status.version}` : ''}
                </Badge>
              ) : (
                <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">{t('common.disconnected')}</Badge>
              )
            ) : (
              <Badge variant="outline">{t('common.connecting')}</Badge>
            )}
          </div>

          <Section id="connection" title={t('session.connection')} defaultOpen>{connectionPane}</Section>
          <Section id="ui" title={t('session.ui')} defaultOpen>{uiPane}</Section>
          {sessionItems.map((item) => (
            <Section key={item.key} id={item.key} title={item.title}>{item.children}</Section>
          ))}

          {/* 多服务器管理 */}
          <Section id="multiServer" title={t('session.multiServer.title')}>
            <div className="text-footnote text-gray-500 mb-3">{t('session.multiServer.hint')}</div>
            {servers.map((server, idx) => (
              <div key={idx} className="rounded-lg border border-gray-200/70 dark:border-gray-700/50 p-2 mb-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Input
                    value={server.name}
                    onChange={(e) => { const s = [...servers]; s[idx] = { ...s[idx], name: e.target.value }; void saveServers(s) }}
                    className="flex-1 h-8 text-footnote"
                    placeholder={t('session.multiServer.serverName')}
                  />
                  <Switch checked={server.enabled} onCheckedChange={(v) => { const s = [...servers]; s[idx] = { ...s[idx], enabled: v }; void saveServers(s) }} />
                  <Button size="sm" variant="destructive" className="h-8 text-footnote shrink-0" onClick={() => void removeServer(idx)}>
                    {t('common.delete')}
                  </Button>
                </div>
                <Input
                  value={server.url}
                  onChange={(e) => { const s = [...servers]; s[idx] = { ...s[idx], url: e.target.value }; void saveServers(s) }}
                  className="w-full h-8 text-footnote"
                  placeholder="http://host:9091/transmission/rpc"
                />
                <div className="flex items-center gap-2">
                  <Input
                    value={server.user}
                    onChange={(e) => { const s = [...servers]; s[idx] = { ...s[idx], user: e.target.value }; void saveServers(s) }}
                    className="flex-1 h-8 text-footnote"
                    placeholder={t('session.username')}
                  />
                  <Input
                    type="password"
                    value={server.pass ?? ''}
                    onChange={(e) => { const s = [...servers]; s[idx] = { ...s[idx], pass: e.target.value }; void saveServers(s) }}
                    className="flex-1 h-8 text-footnote"
                    // 列表接口不返回密码，留空表示保持原密码不变
                    placeholder={server.hasPass ? `${t('session.password')} · ${t('session.passwordSaved')}` : t('session.password')}
                    autoComplete="new-password"
                  />
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" className="w-full h-8 text-footnote" onClick={() => void saveServers([...servers, { name: '', url: '', user: '', pass: '', enabled: true }])}>
              + {t('session.multiServer.addServer')}
            </Button>
            {servers.length > 1 && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div className="text-footnote font-medium mb-2">{t('session.multiServer.activeServer')}</div>
                <div className="space-y-1">
                  {servers.map((server, idx) => (
                    <Button
                      key={idx}
                      size="sm"
                      variant={idx === currentServerIndex ? 'default' : 'outline'}
                      className="w-full h-8 text-footnote truncate"
                      onClick={() => void switchToServer(idx)}
                      disabled={!server.enabled}
                    >
                      {server.name || `${t('session.multiServer.server')} ${idx + 1}`} - {server.url}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* RSS 订阅与自动文件管理入口 */}
          <Section id="automation" title={t('session.automation')}>
            <div className="space-y-2">
              <Button size="sm" variant="outline" className="w-full h-8 text-footnote" onClick={() => setOpenRss(true)}>
                {t('rss.title')}
              </Button>
              <Button size="sm" variant="outline" className="w-full h-8 text-footnote" onClick={() => setOpenMove(true)}>
                {t('autoMove.title')}
              </Button>
            </div>
          </Section>

          {/* 关于与检查更新 */}
          <AboutSection transmissionVersion={status?.version} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={saving} onClick={save}>{saving ? t('common.loading') : t('common.confirm')}</Button>
        </DialogFooter>
      </DialogContent>
      <RSSManager open={openRss} onClose={() => setOpenRss(false)} />
      <AutoMoveManager open={openMove} onClose={() => setOpenMove(false)} />
    </Dialog>
  )
}

const clientGetSettings = () => client.get('/settings')
const clientPutSettings = (body: { url: string; user: string; pass: string; pollInterval: string }) =>
  client.put('/settings', body)
