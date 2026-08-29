import { useEffect, useRef } from 'react'

/**
 * 把一枚玻璃胶囊指示器定位到当前激活的导航项上，替代逐项换底色。
 *
 * 定位靠实测 DOM 而不是与渲染状态同步，因此分组折叠、计数增减、列表重排
 * 都能自动跟上；胶囊自身的位移过渡由 CSS 的 spring 曲线负责。
 */
export function useNavRail(activeKey: string, reflowSignature: unknown) {
  const boxRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const box = boxRef.current
    const rail = railRef.current
    if (!box || !rail) return

    const place = () => {
      const target = box.querySelector<HTMLElement>('[data-nav-active="true"]')
      if (!target) {
        rail.style.opacity = '0'
        return
      }
      rail.style.opacity = '1'
      rail.style.height = `${target.offsetHeight}px`
      rail.style.transform = `translateY(${target.offsetTop}px)`
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(box)
    return () => ro.disconnect()
  }, [activeKey, reflowSignature])

  return { boxRef, railRef }
}
