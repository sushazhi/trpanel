import { useEffect, type RefObject } from 'react'

const GAP_FALLBACK = 12

interface Options {
  shell: RefObject<HTMLElement | null>
  /** 顶部停靠栏容器（顶栏 + 移动端分类标题行） */
  top: RefObject<HTMLElement | null>
  /** 底部停靠栏（全宽者）：多个时取最靠上者作为避让边界。悬浮控件只盖一角，不要放进来 */
  bottoms: RefObject<HTMLElement | null>[]
}

/**
 * 建立「停靠玻璃」与「滚动内容」之间的几何与材质联动。
 *
 * 液态玻璃只有压在滚动内容之上才会折射；面板与滚动区互不重叠时，
 * backdrop-filter 模糊的只是一张静止渐变，白付 GPU 也表达不出层级。
 * 本 hook 把停靠栏实测底沿写进 --pad-top / --pad-bottom，滚动容器据此
 * 加 padding 与渐隐遮罩，内容便会穿过玻璃并被"吸收"（scroll edge effect）。
 *
 * shell 上同时维护 data-edge：任一滚动区离开起始位即置为 scrolled，
 * CSS 据此把玻璃从近乎清澈提升到强折射。
 */
export function useGlassChrome({ shell, top, bottoms }: Options) {
  useEffect(() => {
    const el = shell.current
    if (!el) return
    const shellEl = el

    const dockEls = [top.current, ...bottoms.map((r) => r.current)].filter(Boolean) as HTMLElement[]
    const bottomEls = bottoms.map((r) => r.current).filter(Boolean) as HTMLElement[]
    const topEl = top.current
    const gap = parseFloat(getComputedStyle(shellEl).getPropertyValue('--shell-gap')) || GAP_FALLBACK

    const measure = () => {
      const box = shellEl.getBoundingClientRect()
      // 顶栏高度会随筛选胶囊行、移动端标题行变化，必须实测而非硬编码
      const topEdge = topEl ? topEl.getBoundingClientRect().bottom : box.top
      const bottomEdge = bottomEls.reduce(
        (acc, node) => Math.min(acc, node.getBoundingClientRect().top),
        box.bottom,
      )
      // 写到根节点：Dialog/Popover/Toast 经 portal 挂在 body 下，取不到 shell 上的变量
      const root = document.documentElement
      root.style.setProperty('--pad-top', `${Math.round(topEdge - box.top + gap)}px`)
      root.style.setProperty('--pad-bottom', `${Math.round(box.bottom - bottomEdge + gap)}px`)
    }

    const ro = new ResizeObserver(measure)
    ro.observe(shellEl)
    dockEls.forEach((node) => ro.observe(node))
    window.addEventListener('resize', measure)
    measure()

    // scroll 不冒泡但会经过捕获阶段，挂在 shell 上即可覆盖全部后代滚动区
    const scrolled = new Set<Element>()
    let frame = 0
    const sync = () => {
      frame = 0
      const next = scrolled.size > 0 ? 'scrolled' : 'rest'
      if (shellEl.dataset.edge !== next) shellEl.dataset.edge = next
    }
    const onScroll = (e: Event) => {
      const node = e.target
      if (!(node instanceof HTMLElement)) return
      if (node.scrollTop > 4 || node.scrollLeft > 4) scrolled.add(node)
      else scrolled.delete(node)
      if (!frame) frame = requestAnimationFrame(sync)
    }
    shellEl.addEventListener('scroll', onScroll, true)
    shellEl.dataset.edge = 'rest'

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      shellEl.removeEventListener('scroll', onScroll, true)
      if (frame) cancelAnimationFrame(frame)
    }
    // bottoms 每次渲染都是新数组，但其中的 ref 恒定，读到的始终是同一批节点
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell, top])
}
