import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { rssApi } from '@/api/torrent'
import type { RSSFeed } from '@/types'
import { useAppStore } from '@/stores/appStore'
import { confirm } from '@/lib/confirm'
import { toast } from '@/lib/toast'
import { TagInput } from '@/components/TagInput'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

const emptyFeed = (): RSSFeed => ({
  id: '',
  name: '',
  url: '',
  intervalMin: 30,
  enabled: true,
  downloadDir: '',
  labels: [],
  paused: false,
  minSizeMB: 0,
  maxSizeMB: 0,
  keywords: [],
  excludeWords: [],
  includeRegex: '',
  excludeRegex: '',
  lastFetchAt: 0,
  lastError: '',
  processed: 0,
})

// 数字输入（替代 antd InputNumber）
function NumInput({ value, min, onChange, className }: {
  value: number
  min?: number
  onChange: (v: number) => void
  className?: string
}) {
  return (
    <Input
      type="number"
      min={min}
      className={className}
      value={String(value)}
      onChange={(e) => {
        const n = Number(e.target.value)
        if (!Number.isNaN(n)) onChange(n)
      }}
    />
  )
}

// RSS 订阅与自动下载管理
export function RSSManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [feeds, setFeeds] = useState<RSSFeed[]>([])
  const [editing, setEditing] = useState<RSSFeed | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const allTorrents = useAppStore((s) => s.torrents)
  const allLabels = Array.from(new Set(allTorrents.flatMap((x) => x.labels ?? []))).sort((a, b) => a.localeCompare(b, 'zh'))

  const load = useCallback(async () => {
    const res = await rssApi.list()
    setFeeds(res.feeds)
  }, [])

  useEffect(() => {
    if (open) {
      load().catch(() => {})
      setEditing(null)
    }
  }, [open, load])

  const save = async () => {
    if (!editing) return
    if (!editing.url.trim()) {
      toast.warning(t('rss.urlRequired'))
      return
    }
    setLoading(true)
    try {
      await rssApi.save({
        ...editing,
        url: editing.url.trim(),
        keywords: editing.keywords.filter(Boolean),
        excludeWords: editing.excludeWords.filter(Boolean),
        labels: editing.labels.filter(Boolean),
      })
      toast.success(t('toast.updated'))
      setEditing(null)
      await load()
    } catch {
      // 拦截器已提示
    } finally {
      setLoading(false)
    }
  }

  const remove = async (id: string) => {
    try {
      await rssApi.remove(id)
      toast.success(t('toast.removed'))
      await load()
    } catch {
      // 拦截器已提示
    }
  }

  const fetchNow = async (feed: RSSFeed) => {
    setFetchingId(feed.id)
    try {
      await rssApi.fetch(feed.id)
      toast.success(t('rss.fetched'))
      await load()
    } catch {
      // 拦截器已提示
    } finally {
      setFetchingId(null)
    }
  }

  const fmt = (ts: number) => {
    if (!ts) return '-'
    const d = new Date(ts * 1000)
    return d.toLocaleString()
  }

  const row = 'flex items-center justify-between py-1.5'
  const label = 'text-body text-gray-600 dark:text-gray-300'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[680px] h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-gray-200/40 dark:border-gray-700/30">
          <DialogTitle>{t('rss.title')}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto px-4 py-3 space-y-3">
          {/* 源列表 */}
          <div className="space-y-2">
            {feeds.length === 0 && (
              <div className="py-8 text-center text-body text-gray-400">{t('rss.empty')}</div>
            )}
            {feeds.map((feed) => (
              <div key={feed.id} className="rounded-xl border border-gray-200/70 dark:border-gray-700/50 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Switch checked={feed.enabled} onCheckedChange={(v) => {
                    void rssApi.save({ ...feed, enabled: v }).then(load).catch(() => {})
                  }} />
                  <span className="font-medium text-body flex-1 truncate">{feed.name}</span>
                  <span className="text-caption2 text-gray-400">{feed.processed} ✓</span>
                </div>
                <div className="text-footnote text-gray-500 truncate mb-1">{feed.url}</div>
                {feed.lastError && <div className="text-footnote text-red-500 mb-1 truncate">⚠ {feed.lastError}</div>}
                <div className="flex items-center gap-2 text-caption1 text-gray-400">
                  <span>{t('rss.lastFetch')}: {fmt(feed.lastFetchAt)}</span>
                  <span className="flex-1" />
                  <Button size="sm" variant="outline" className="h-8 text-footnote" disabled={fetchingId === feed.id} onClick={() => fetchNow(feed)}>{fetchingId === feed.id ? t('common.loading') : t('rss.fetchNow')}</Button>
                  <Button size="sm" variant="outline" className="h-8 text-footnote" onClick={() => setEditing({ ...feed })}>{t('common.edit')}</Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 text-footnote"
                    onClick={() => {
                      void confirm({ title: t('common.confirm'), danger: true }).then((ok) => {
                        if (ok) void remove(feed.id)
                      })
                    }}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* 添加/编辑表单 */}
          {editing && (
            <div className="rounded-xl border border-primary/30 p-3 space-y-2">
              <div className="text-body font-medium">{editing.id ? t('rss.editFeed') : t('rss.addFeed')}</div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={t('rss.name')} className="h-8 text-footnote" />
                <Input value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder={t('rss.urlPlaceholder')} className="h-8 text-footnote" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={editing.downloadDir} onChange={(e) => setEditing({ ...editing, downloadDir: e.target.value })} placeholder={t('rss.downloadDir')} className="h-8 text-footnote" />
                <TagInput
                  value={editing.labels}
                  onChange={(v) => setEditing({ ...editing, labels: v })}
                  placeholder={t('addTorrent.labels')}
                  suggestions={allLabels}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={editing.keywords.join(', ')} onChange={(e) => setEditing({ ...editing, keywords: e.target.value.split(/[,，]/) })} placeholder={t('rss.keywords')} className="h-8 text-footnote" />
                <Input value={editing.excludeWords.join(', ')} onChange={(e) => setEditing({ ...editing, excludeWords: e.target.value.split(/[,，]/) })} placeholder={t('rss.excludeWords')} className="h-8 text-footnote" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={editing.includeRegex} onChange={(e) => setEditing({ ...editing, includeRegex: e.target.value })} placeholder={t('rss.includeRegex')} className="h-8 text-footnote" />
                <Input value={editing.excludeRegex} onChange={(e) => setEditing({ ...editing, excludeRegex: e.target.value })} placeholder={t('rss.excludeRegex')} className="h-8 text-footnote" />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className={label}>{t('rss.interval')}</span>
                  <NumInput value={editing.intervalMin} min={5} onChange={(v) => setEditing({ ...editing, intervalMin: v })} className="h-8 w-20 text-footnote" />
                  <span className="text-footnote text-gray-400">{t('rss.minutes')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={label}>≥</span>
                  <NumInput value={editing.minSizeMB} min={0} onChange={(v) => setEditing({ ...editing, minSizeMB: v })} className="h-8 w-20 text-footnote" />
                  <span className="text-footnote text-gray-400">MB</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={label}>≤</span>
                  <NumInput value={editing.maxSizeMB} min={0} onChange={(v) => setEditing({ ...editing, maxSizeMB: v })} className="h-8 w-20 text-footnote" />
                  <span className="text-footnote text-gray-400">MB</span>
                </div>
                <div className={row}>
                  <span className={label}>{t('addTorrent.paused')}</span>
                  <Switch checked={editing.paused} onCheckedChange={(v) => setEditing({ ...editing, paused: v })} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-8 text-footnote" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
                <Button size="sm" className="h-8 text-footnote" disabled={loading} onClick={save}>{loading ? t('common.loading') : t('common.save')}</Button>
              </div>
            </div>
          )}

          {!editing && (
            <Button variant="outline" className="w-full h-8 text-footnote" onClick={() => setEditing(emptyFeed())}>
              + {t('rss.addFeed')}
            </Button>
          )}
        </div>
        <DialogFooter className="px-4 pb-4">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
