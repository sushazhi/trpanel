import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useLayoutStore } from '@/layout/layoutStore'
import type { LayoutDecision } from '@/layout/breakpoints'

const COARSE_QUERY = '(hover: none), (pointer: coarse)'

let safeProbe: HTMLDivElement | null = null

/** env() 不参与自定义属性的求值，`--safe-left` 读回来是未替换的字面量，只能靠探针拿已解析值 */
function readSafeX(): number {
  if (!document.body) return 0
  if (!safeProbe) {
    safeProbe = document.createElement('div')
    safeProbe.setAttribute('aria-hidden', 'true')
    safeProbe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)'
    document.body.appendChild(safeProbe)
  }
  const cs = getComputedStyle(safeProbe)
  return (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
}

function readGap(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shell-gap'))
  return Number.isFinite(v) ? v : 12
}

export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => window.matchMedia(COARSE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(COARSE_QUERY)
    const handler = (e: MediaQueryListEvent) => setCoarse(e.matches)
    setCoarse(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return coarse
}

interface Args {
  /** 测量目标：`.tm-shell` 而非 window —— 内嵌 WebView、分屏、侧边栏 PWA 下两者会背离 */
  shell: RefObject<HTMLElement | null>
  content: RefObject<HTMLElement | null>
  detailOpen: boolean
  allowPane?: boolean
}

/**
 * 布局档位的唯一测量点。挂在 useLayoutEffect 上，首帧绘制前就完成定档，
 * 因此抽屉态的侧栏不会在桌面端闪一下。
 */
export function useLayoutRegion({ shell, content, detailOpen, allowPane = false }: Args): LayoutDecision {
  const decision = useLayoutStore((s) => s.decision)
  const measure = useLayoutStore((s) => s.measure)
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const singleLine = useAppStore((s) => s.singleLine)
  const coarse = useCoarsePointer()

  useLayoutEffect(() => {
    const el = shell.current
    if (!el) return

    let raf = 0
    const run = () => {
      raf = 0
      measure({
        shellW: el.getBoundingClientRect().width,
        sidebarWidth,
        detailOpen,
        allowPane,
        coarse,
        singleLine,
        gap: readGap(),
        safeX: readSafeX(),
      })
      const d = useLayoutStore.getState().decision
      const root = document.documentElement
      // 横跨整幅的 dock 与 portal 挂在 document 上，容器查询够不到，只能靠这个属性共享同一真值
      root.dataset.bp = d.dockTier
      root.style.setProperty('--tm-scale', String(d.scale))
      root.style.setProperty('--sidebar-slot', `${d.sidebarSlot}px`)
      root.style.setProperty('--pane-slot', `${d.paneSlot}px`)
      if (content.current) content.current.dataset.bp = d.tier
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(run)
    }

    run()
    // 一帧内多次尺寸变化合并成一次提交：拖分隔条时不会逐帧改档
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [shell, content, measure, sidebarWidth, singleLine, detailOpen, allowPane, coarse])

  return decision
}
