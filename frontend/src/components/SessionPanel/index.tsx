import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { sessionApi } from '@/api/torrent'
import { useAppStore } from '@/stores/appStore'
import type { SessionStats } from '@/types'
import { formatBytes, formatEta, formatSpeed } from '@/utils/format'
import { toast } from '@/lib/toast'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

// 会话统计 + 备用带宽/全局限速控制
export function SessionPanel() {
  const { t } = useTranslation()
  const session = useAppStore((s) => s.session)
  const setSession = useAppStore((s) => s.setSession)
  const [stats, setStats] = useState<SessionStats | null>(null)

  const refreshStats = () => sessionApi.stats().then(setStats).catch(() => {})

  useEffect(() => {
    refreshStats()
    const iv = window.setInterval(refreshStats, 5000)
    return () => window.clearInterval(iv)
  }, [])

  const patchSession = async (patch: Record<string, unknown>) => {
    try {
      await sessionApi.update(patch)
      setSession(session ? { ...session, ...patch } : session)
      toast.success(t('toast.updated'))
    } catch {
      // 拦截器已提示
    }
  }

  const row = 'flex items-center justify-between py-1.5'
  const label = 'text-body text-gray-600 dark:text-gray-300'
  const value = 'text-body text-gray-800 dark:text-gray-100'

  return (
    <div className="space-y-4">
      {/* 带宽控制 */}
      <div>
        <div className="text-footnote font-semibold text-gray-400 mb-1">{t('session.title')}</div>
        <div className={row}>
          <span className={label}>{t('session.altSpeed')}</span>
          <Switch
            checked={session?.altSpeedEnabled ?? false}
            onCheckedChange={(checked) => patchSession({ altSpeedEnabled: checked })}
          />
        </div>
        <div className={row}>
          <span className={label}>{t('session.speedLimitDown')}</span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              className="h-8 w-24 text-footnote"
              value={session?.speedLimitDownOn ? String(session.speedLimitDown) : ''}
              disabled={!session?.speedLimitDownOn}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (!Number.isNaN(n)) patchSession({ speedLimitDown: n })
              }}
            />
            <Switch
              checked={session?.speedLimitDownOn ?? false}
              onCheckedChange={(checked) => patchSession({ speedLimitDownOn: checked })}
            />
          </div>
        </div>
        <div className={row}>
          <span className={label}>{t('session.speedLimitUp')}</span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              className="h-8 w-24 text-footnote"
              value={session?.speedLimitUpOn ? String(session.speedLimitUp) : ''}
              disabled={!session?.speedLimitUpOn}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (!Number.isNaN(n)) patchSession({ speedLimitUp: n })
              }}
            />
            <Switch
              checked={session?.speedLimitUpOn ?? false}
              onCheckedChange={(checked) => patchSession({ speedLimitUpOn: checked })}
            />
          </div>
        </div>
      </div>

      {/* 会话统计 */}
      {stats && (
        <div>
          <div className="text-footnote font-semibold text-gray-400 mb-1">{t('session.stats')}</div>
          <div className={row}>
            <span className={label}>{t('session.downloaded')}</span>
            <span className={value}>{formatBytes(stats.cumulative.downloadedBytes)}</span>
          </div>
          <div className={row}>
            <span className={label}>{t('session.uploaded')}</span>
            <span className={value}>{formatBytes(stats.cumulative.uploadedBytes)}</span>
          </div>
          <div className={row}>
            <span className={label}>{t('session.filesAdded')}</span>
            <span className={value}>{stats.cumulative.filesAdded}</span>
          </div>
          <div className={row}>
            <span className={label}>{t('session.sessionCount')}</span>
            <span className={value}>{stats.cumulative.sessionCount}</span>
          </div>
          <div className={row}>
            <span className={label}>{t('session.secondsActive')}</span>
            <span className={value}>{formatEta(stats.cumulative.secondsActive)}</span>
          </div>
          <div className={row}>
            <span className={label}>{t('session.current')}</span>
            <span className={value}>↓ {formatSpeed(stats.downloadSpeed)} · ↑ {formatSpeed(stats.uploadSpeed)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
