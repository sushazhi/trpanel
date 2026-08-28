import { useCallback, useEffect, useRef } from 'react'

interface SwipeGestureOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
}

/**
 * 移动端左右滑动手势 Hook
 * 用于在移动端切换分类/标签导航
 */
export function useSwipeGesture(options: SwipeGestureOptions = {}) {
  const { onSwipeLeft, onSwipeRight, threshold = 80 } = options
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)
  const touchStartY = useRef(0)
  const touchEndY = useRef(0)

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
    }

    const handleTouchMove = (e: TouchEvent) => {
      touchEndX.current = e.touches[0].clientX
      touchEndY.current = e.touches[0].clientY
    }

    const handleTouchEnd = () => {
      const diffX = touchStartX.current - touchEndX.current
      const diffY = Math.abs(touchStartY.current - touchEndY.current)
      // 水平滑动距离要大于垂直滑动距离（避免与滚动冲突）
      if (Math.abs(diffX) > threshold && Math.abs(diffX) > diffY) {
        if (diffX > 0) {
          onSwipeLeft?.()
        } else {
          onSwipeRight?.()
        }
      }
      touchStartX.current = 0
      touchEndX.current = 0
      touchStartY.current = 0
      touchEndY.current = 0
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [onSwipeLeft, onSwipeRight, threshold])
}

export default useSwipeGesture
