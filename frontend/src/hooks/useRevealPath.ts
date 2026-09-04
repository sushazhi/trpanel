import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlatform } from '@/platform'
import { toast } from '@/lib/toast'
import { mapPath } from '@/utils/pathMapping'

/**
 * 在宿主文件管理器中定位目录。
 * 路径先经过「远端→本地」映射（PATH_MAPPINGS，Transmission 跑在容器内等场景）。
 * 宿主不支持时降级为「复制路径 + 提示」，这样入口可以一直显示，
 * 而不是在非飞牛环境里凭空消失又没有任何反馈。
 */
export function useRevealPath() {
  const { t } = useTranslation()
  const { revealPath } = usePlatform()

  return useCallback(
    async (path: string) => {
      if (!path) return
      const local = await mapPath(path)
      if (await revealPath(local)) return
      navigator.clipboard?.writeText(local).catch(() => {})
      toast.info(t('sidebar.openDirFallback', { dir: local }))
    },
    [revealPath, t],
  )
}
