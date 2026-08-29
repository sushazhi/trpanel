import { useEffect, useRef, useState, type RefObject } from 'react'

/** 停止滚动后胶囊回位的延时——太短会在惯性滚动的间隙里来回闪 */
const RESUME_MS = 640
/** 累计位移阈值：触屏落指时的几像素抖动不该被当成滚动 */
const DRIFT_PX = 16

/**
 * 监听 host 内任意滚动区（含后代），滚动期间为 true、停手后回 false。
 *
 * 胶囊压在列表上，滑动时它会一直挡着末几行；但常驻收起又会让底部避让量
 * 随滚动忽大忽小、列表跟着抖。所以这里只把胶囊自身移开，App 实测到的
 * 停靠边界保持不变。
 */
export function useHideOnScroll(hostRef?: RefObject<HTMLElement | null>): boolean {
  const [hidden, setHidden] = useState(false)
  const lastTops = useRef(new WeakMap<Element, number>())

  useEffect(() => {
    const host = hostRef?.current
    if (!host) return
    const tops = lastTops.current
    let drift = 0
    let timer = 0

    // scroll 不冒泡但会经过捕获阶段，挂在宿主元素上即可覆盖全部后代滚动区
    const onScroll = (e: Event) => {
      const node = e.target
      if (!(node instanceof HTMLElement)) return
      drift += Math.abs(node.scrollTop - (tops.get(node) ?? node.scrollTop))
      tops.set(node, node.scrollTop)
      if (drift < DRIFT_PX) return
      setHidden(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        drift = 0
        setHidden(false)
      }, RESUME_MS)
    }

    host.addEventListener('scroll', onScroll, true)
    return () => {
      host.removeEventListener('scroll', onScroll, true)
      window.clearTimeout(timer)
    }
  }, [hostRef])

  return hidden
}
