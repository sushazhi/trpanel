import { cn } from '@/lib/utils'
import { formatPercent } from '@/utils/format'

interface Props {
  /** 进度 0~1 */
  value: number
  error?: boolean
  className?: string
}

// 内嵌百分比的进度条：填充区白字、未填充区灰字。
// 白色层宽度 = 填充宽度，内部文字容器按反比放大回整条宽度，保证数字始终居中。
export function ProgressBar({ value, error, className }: Props) {
  const clamped = Math.min(1, Math.max(0, value))
  const pct = clamped * 100
  const label = formatPercent(clamped, 0)
  return (
    <div
      className={cn('tm-progress-track tm-progress-track--labeled relative', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('tm-progress-fill', error && 'tm-progress-fill--error')}
        style={{ width: `${pct}%`, transition: 'width 0.5s var(--ease-spring)' }}
      />
      <span className="absolute inset-0 flex items-center justify-center tm-mono text-caption2 font-medium text-gray-500 dark:text-gray-300">
        {label}
      </span>
      {pct > 0 && (
        <span
          className="absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: `${pct}%`, transition: 'width 0.5s var(--ease-spring)' }}
          aria-hidden
        >
          <span
            className="absolute inset-y-0 left-0 flex items-center justify-center tm-mono text-caption2 font-medium text-white"
            style={{ width: `calc(100% / ${pct} * 100)` }}
          >
            {label}
          </span>
        </span>
      )}
    </div>
  )
}
