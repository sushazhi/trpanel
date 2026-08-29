import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { autoMoveApi } from '@/api/torrent'
import type { AutoMoveRule } from '@/types'
import { useAppStore } from '@/stores/appStore'
import { confirm } from '@/lib/confirm'
import { toast } from '@/lib/toast'
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

const emptyRule = (): AutoMoveRule => ({
  id: '',
  name: '',
  enabled: true,
  sites: [],
  labels: [],
  nameMatch: '',
  targetDir: '',
})

// 自动文件管理：已完成种子按规则移动到指定目录
export function AutoMoveManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [rules, setRules] = useState<AutoMoveRule[]>([])
  const [editing, setEditing] = useState<AutoMoveRule | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const allTorrents = useAppStore((s) => s.torrents)
  const torrentSites = useAppStore((s) => s.torrentSites)
  const allLabels = Array.from(new Set(allTorrents.flatMap((x) => x.labels ?? []))).sort((a, b) => a.localeCompare(b, 'zh'))
  const allSites = Array.from(new Set(Object.values(torrentSites).flat())).sort()

  const load = useCallback(async () => {
    const res = await autoMoveApi.list()
    setRules(res.rules)
  }, [])

  useEffect(() => {
    if (open) {
      load().catch(() => {})
      setEditing(null)
    }
  }, [open, load])

  const save = async () => {
    if (!editing) return
    if (!editing.targetDir.trim()) {
      toast.warning(t('autoMove.dirRequired'))
      return
    }
    setLoading(true)
    try {
      await autoMoveApi.save({
        ...editing,
        sites: editing.sites.filter(Boolean),
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
      await autoMoveApi.remove(id)
      toast.success(t('toast.removed'))
      await load()
    } catch {
      // 拦截器已提示
    }
  }

  const runNow = async () => {
    setRunning(true)
    try {
      await autoMoveApi.run()
      toast.success(t('autoMove.running'))
    } catch {
      // 拦截器已提示
    } finally {
      setRunning(false)
    }
  }

  const row = 'flex items-center justify-between py-1.5'
  const label = 'text-body text-gray-600 dark:text-gray-300'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[640px] h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-gray-200/40 dark:border-gray-700/30">
          <DialogTitle>{t('autoMove.title')}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto px-4 py-3 space-y-3">
          {/* 规则列表 */}
          <div className="space-y-2">
            {rules.length === 0 && (
              <div className="py-8 text-center text-body text-gray-400">{t('autoMove.empty')}</div>
            )}
            {rules.map((rule) => (
              <div key={rule.id} className="rounded-xl border border-gray-200/70 dark:border-gray-700/50 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Switch checked={rule.enabled} onCheckedChange={(v) => {
                    void autoMoveApi.save({ ...rule, enabled: v }).then(load).catch(() => {})
                  }} />
                  <span className="font-medium text-body flex-1 truncate">{rule.name || t('autoMove.untitled')}</span>
                  <Button size="sm" variant="outline" className="h-8 text-footnote" onClick={() => setEditing({ ...rule })}>{t('common.edit')}</Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 text-footnote"
                    onClick={() => {
                      void confirm({ title: t('common.confirm'), danger: true }).then((ok) => {
                        if (ok) void remove(rule.id)
                      })
                    }}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
                <div className="text-footnote text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>→ {rule.targetDir}</span>
                  {rule.nameMatch && <span>{t('autoMove.nameMatch')}: {rule.nameMatch}</span>}
                  {rule.labels.length > 0 && <span>{t('autoMove.labels')}: {rule.labels.join(', ')}</span>}
                  {rule.sites.length > 0 && <span>{t('autoMove.sites')}: {rule.sites.join(', ')}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* 编辑表单 */}
          {editing && (
            <div className="rounded-xl border border-primary/30 p-3 space-y-2">
              <div className="text-body font-medium">{editing.id ? t('autoMove.editRule') : t('autoMove.addRule')}</div>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={t('autoMove.ruleName')} className="h-8 text-footnote" />
              <Input value={editing.nameMatch} onChange={(e) => setEditing({ ...editing, nameMatch: e.target.value })} placeholder={t('autoMove.nameMatchPlaceholder')} className="h-8 text-footnote" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={editing.labels.join(', ')} onChange={(e) => setEditing({ ...editing, labels: e.target.value.split(/[,，]/) })} placeholder={`${t('autoMove.labels')} (${t('common.eachLineOne')})`} list="am-labels" className="h-8 text-footnote" />
                <Input value={editing.sites.join(', ')} onChange={(e) => setEditing({ ...editing, sites: e.target.value.split(/[,，]/) })} placeholder={t('autoMove.sites')} list="am-sites" className="h-8 text-footnote" />
              </div>
              <datalist id="am-labels">{allLabels.map((l) => <option key={l} value={l} />)}</datalist>
              <datalist id="am-sites">{allSites.map((s) => <option key={s} value={s} />)}</datalist>
              <Input value={editing.targetDir} onChange={(e) => setEditing({ ...editing, targetDir: e.target.value })} placeholder={t('autoMove.targetDir')} className="h-8 text-footnote" />
              <div className={row}>
                <span className={label}>{t('common.enabled')}</span>
                <Switch checked={editing.enabled} onCheckedChange={(v) => setEditing({ ...editing, enabled: v })} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-8 text-footnote" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
                <Button size="sm" className="h-8 text-footnote" disabled={loading} onClick={save}>{loading ? t('common.loading') : t('common.save')}</Button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {!editing && (
              <Button variant="outline" className="flex-1 h-8 text-footnote" onClick={() => setEditing(emptyRule())}>
                + {t('autoMove.addRule')}
              </Button>
            )}
            <Button className="flex-1 h-8 text-footnote" disabled={running} onClick={runNow}>
              {running ? t('common.loading') : t('autoMove.runNow')}
            </Button>
          </div>
        </div>
        <DialogFooter className="px-4 pb-4">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
