import { useEffect, useRef } from 'react'

interface SwipeGestureOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
  /**
   * 命中该选择器（含祖先）的触点不启动手势。
   * 顶栏搜索框里横向选字、抽屉里下滑关面板都会经过停靠玻璃，
   * 不加限定的话会被当成一次切分类的横滑。
   */
  ignoreSelector?: string
}

// 距屏幕左右边缘该范围内起笔属于系统手势（iOS 返回、Android 回退），不抢
const EDGE_EXCLUSION = 24
// 快滑速度阈值（px/ms）：位移不足 threshold 但手势干脆的短促滑动也算
const FLICK_VELOCITY = 0.5
// 快滑的距离下限：短于此的甩动多半是误触
const FLICK_MIN_DISTANCE = 40

/**
 * 移动端左右滑动手势 Hook
 * 用于在移动端切换分类/标签导航
 */
export function useSwipeGesture(options: SwipeGestureOptions = {}) {
  const { onSwipeLeft, onSwipeRight, threshold = 80, ignoreSelector } = options
  const start = useRef<{ x: number; y: number; t: number } | null>(null)
  const end = useRef({ x: 0, y: 0, t: 0 })

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      // 多指（缩放、三指切换）不进入手势
      if (e.touches.length !== 1) {
        start.current = null
        return
      }
      const touch = e.touches[0]
      if (touch.clientX < EDGE_EXCLUSION || touch.clientX > window.innerWidth - EDGE_EXCLUSION) {
        start.current = null
        return
      }
      const from =
        ignoreSelector && e.target instanceof Element ? e.target.closest(ignoreSelector) : null
      start.current = from ? null : { x: touch.clientX, y: touch.clientY, t: e.timeStamp }
      // 终点必须跟起点同步：干净的一次点击不会派发 touchmove，
      // 留着上一次的终点值会让点击被算成长距离横滑
      end.current = { x: touch.clientX, y: touch.clientY, t: e.timeStamp }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!start.current) return
      const touch = e.touches[0]
      end.current = { x: touch.clientX, y: touch.clientY, t: e.timeStamp }
    }

    const handleTouchEnd = () => {
      const from = start.current
      start.current = null
      if (!from) return
      const diffX = from.x - end.current.x
      const distance = Math.abs(diffX)
      // 水平位移要盖过垂直位移，否则用户是在上下滚动列表
      if (distance <= Math.abs(from.y - end.current.y)) return
      // 长距离慢拖与短距离快甩都算一次切分类，只按距离判会漏掉后者
      const velocity = distance / Math.max(1, end.current.t - from.t)
      if (distance <= threshold && !(distance > FLICK_MIN_DISTANCE && velocity > FLICK_VELOCITY)) return
      if (diffX > 0) onSwipeLeft?.()
      else onSwipeRight?.()
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
      document.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [onSwipeLeft, onSwipeRight, threshold, ignoreSelector])
}

export default useSwipeGesture
