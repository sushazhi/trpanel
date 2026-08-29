import { useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'

/**
 * 让系统 chrome（移动端状态栏 / PWA standalone 顶边）跟住应用背景的最上沿颜色。
 *
 * 预设主题已经各自声明了 --bg-top / --bg-dark-top，这里直接读解析后的计算值，
 * 而不是再维护一张「主题 → 颜色」的副本表——那份副本迟早会和 CSS 漂移。
 * 颜色断层会直接破坏"玻璃一直延伸到状态栏"的连续性。
 */
export function ThemeColors() {
  const theme = useAppStore((s) => s.theme)
  const themePreset = useAppStore((s) => s.themePreset)

  useEffect(() => {
    const root = document.documentElement
    const isDark = theme === 'dark'
    const fromVar = getComputedStyle(root)
      .getPropertyValue(isDark ? '--bg-dark-top' : '--bg-top')
      .trim()
    const color = fromVar || (isDark ? '#1c1d29' : '#ddeaff')

    root.style.colorScheme = isDark ? 'dark light' : 'light dark'
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = color
  }, [theme, themePreset])

  return null
}
