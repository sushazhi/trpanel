import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlatform } from '@/platform'
import { toast } from '@/lib/toast'

/**
 * 在宿主文件管理器中定位目录。
 * 宿主不支持时降级为「复制路径 + 提示」，这样入口可以一直显示，
 * 而不是在非飞牛环境里凭空消失又没有任何反馈。
 */
export function useRevealPath() {
  const { t } = useTranslation()
  const { revealPath } = usePlatform()

  return useCallback(
    async (path: string) => {
      if (!path) return
      if (await revealPath(path)) return
      navigator.clipboard?.writeText(path).catch(() => {})
      toast.info(t('sidebar.openDirFallback', { dir: path }))
    },
    [revealPath, t],
  )
}
