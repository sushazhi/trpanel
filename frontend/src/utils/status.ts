import type { ElementType } from 'react'
import { Clock, CloudDownload, Download, PauseCircle, RotateCcw, ShieldAlert, Upload } from 'lucide-react'
import type { Torrent } from '@/types'

/**
 * Transmission 状态码 → 图标 / 文案键 / 语义色，全站唯一来源。
 *
 * 色值只在 styles/index.css 的 --color-status-* 里定义，这里只引用变量名：
 * 下载族挂在 --color-primary 上，切主题预设时它们会跟着联动，而做种/校验/
 * 隔离是跨主题恒定的信号色。消费方一律走 style/CSS 变量，不要再来一份十六进制副本。
 */
export const STATUS_META: Record<number, { icon: ElementType; label: string; color: string }> = {
  0: { icon: PauseCircle, label: 'status.0', color: 'var(--color-status-stopped)' },
  1: { icon: RotateCcw, label: 'status.1', color: 'var(--color-status-verifying)' },
  2: { icon: RotateCcw, label: 'status.2', color: 'var(--color-status-verifying)' },
  3: { icon: CloudDownload, label: 'status.3', color: 'var(--color-status-queued-down)' },
  4: { icon: Download, label: 'status.4', color: 'var(--color-status-downloading)' },
  5: { icon: Clock, label: 'status.5', color: 'var(--color-status-queued-seed)' },
  6: { icon: Upload, label: 'status.6', color: 'var(--color-status-seeding)' },
  7: { icon: ShieldAlert, label: 'status.7', color: 'var(--color-status-isolated)' },
}

const FALLBACK = STATUS_META[0]

export const statusMeta = (status: number) => STATUS_META[status] ?? FALLBACK

/** 错误优先于状态码：出错的任务无论停在哪个阶段都读作红色 */
export const statusColor = (t: Torrent) =>
  t.error > 0 ? 'var(--color-status-error)' : statusMeta(t.status).color

export const statusLabelKey = (t: Torrent) => (t.error > 0 ? 'status.error' : statusMeta(t.status).label)

/** 只让真正在干活的态脉冲：排队和等待是静止的，全脉冲等于没有重点 */
export const statusPulses = (t: Torrent) => t.error === 0 && (t.status === 2 || t.status === 4)
