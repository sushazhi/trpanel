import { useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'

/** 展示层路径转换：命中语义映射则显示宿主展示名，否则回退原始路径（纯读取，无副作用） */
export function useSemanticPath() {
  const semanticDirs = useAppStore((s) => s.semanticDirs)
  return useCallback((raw: string) => semanticDirs[raw] ?? raw, [semanticDirs])
}
