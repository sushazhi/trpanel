import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { client, request } from '@/api/client'
import { APP_BASE } from '@/platform/appBase'
import { toast } from '@/lib/toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

// MCP 服务：AI 客户端接入的开关与凭据（状态与持久化都在后端 /settings，全部即时保存）
export function McpManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(false)
  const [allowDelete, setAllowDelete] = useState(false)
  const [token, setToken] = useState('')
  const [draft, setDraft] = useState('')
  const [mcpPort, setMcpPort] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    request(clientGetSettings()).then((d) => {
      if (cancelled) return
      const data = d as { mcpEnabled?: boolean; mcpAllowDelete?: boolean; mcpToken?: string; mcpPort?: string }
      setEnabled(!!data.mcpEnabled)
      setAllowDelete(!!data.mcpAllowDelete)
      setToken(data.mcpToken ?? '')
      setDraft(data.mcpToken ?? '')
      setMcpPort(data.mcpPort ?? '')
    }).catch(() => {})
    return () => { cancelled = true }
  }, [open])

  const patch = async (body: { mcpEnabled?: boolean; mcpAllowDelete?: boolean; mcpToken?: string }, apply: () => void) => {
    try {
      await request(clientPutSettings(body))
      apply()
      toast.success(t('toast.updated'))
    } catch {
      // 拦截器已提示
    }
  }

  // 令牌草稿：失焦/回车且内容变化时提交一次，Esc 还原
  const commitToken = () => {
    const next = draft.trim()
    if (next === token) return
    setDraft(next)
    void patch({ mcpToken: next }, () => setToken(next))
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>{t('session.mcp.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Row label={t('session.mcp.enabled')} hint={t('session.mcp.enabledHint')}>
            <Switch checked={enabled} onCheckedChange={(v) => void patch({ mcpEnabled: v }, () => setEnabled(v))} />
          </Row>
          <Row label={t('session.mcp.allowDelete')} hint={t('session.mcp.allowDeleteHint')}>
            <Switch checked={allowDelete} disabled={!enabled} onCheckedChange={(v) => void patch({ mcpAllowDelete: v }, () => setAllowDelete(v))} />
          </Row>
          <Row label={t('session.mcp.token')} hint={t('session.mcp.tokenHint')}>
            <Input
              aria-label={t('session.mcp.token')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitToken}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitToken() }
                if (e.key === 'Escape') { setDraft(token); e.currentTarget.blur() }
              }}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={t('session.mcp.tokenPlaceholder')}
              className="h-8 text-footnote w-1/2"
            />
          </Row>
          <p className="text-caption1 text-gray-400 pt-1">
            {t('session.mcp.endpointHint', {
              endpoint: mcpPort
                ? `http://${window.location.hostname}:${mcpPort}/mcp`
                : `${window.location.origin}${APP_BASE}/mcp`,
            })}
          </p>
          <p className="text-caption1 text-gray-400">{t('session.mcp.gatewayHint')}</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// 与 SettingsModal 的 Row 同构：标题与说明在左、控件在右
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

const clientGetSettings = () => client.get('/settings')
const clientPutSettings = (body: { mcpEnabled?: boolean; mcpAllowDelete?: boolean; mcpToken?: string }) =>
  client.put('/settings', body)
