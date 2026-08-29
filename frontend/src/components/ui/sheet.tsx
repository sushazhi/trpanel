import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'

import { cn } from '@/lib/utils'

/**
 * iOS 语境下的底部卡片（sheet）。
 *
 * 这里原先用居中 Dialog 充当抽屉：没有拖拽指示条、不能跟手下滑，
 * 在触屏上读起来像 modal 而不是 sheet。位移只由把手区触发，
 * 面板内部仍是普通滚动容器，避免和长列表抢手势。
 */
const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close

// 超过该位移或甩动速度即关闭
const DISMISS_DISTANCE = 96
const DISMISS_VELOCITY = 0.55
// 越界拖拽的橡皮筋阻尼
const RUBBER = 0.7

interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  onDismiss?: () => void
}

const SheetContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, SheetContentProps>(
  ({ className, children, onDismiss, ...props }, ref) => {
    const [dragY, setDragY] = React.useState(0)
    const [dragging, setDragging] = React.useState(false)
    const startY = React.useRef(0)
    const lastY = React.useRef(0)
    const lastT = React.useRef(0)
    const velocity = React.useRef(0)

    const release = () => {
      setDragging(false)
      if (dragY > DISMISS_DISTANCE || velocity.current > DISMISS_VELOCITY) onDismiss?.()
      else setDragY(0)
    }

    const onHandlePointerDown = (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      startY.current = e.clientY
      lastY.current = e.clientY
      lastT.current = e.timeStamp
      velocity.current = 0
      setDragging(true)
    }
    const onHandlePointerMove = (e: React.PointerEvent) => {
      if (!dragging) return
      const raw = e.clientY - startY.current
      // 只允许向下拉，向上回弹交给内容区滚动
      const next = raw > 0 ? raw * RUBBER : 0
      velocity.current = (e.clientY - lastY.current) / Math.max(1, e.timeStamp - lastT.current)
      lastY.current = e.clientY
      lastT.current = e.timeStamp
      setDragY(next)
    }

    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[10px] backdrop-saturate-[.8] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center">
          <DialogPrimitive.Content
            ref={ref}
            onPointerDownOutside={(e) => {
              // 拖拽过程中指针可能落在遮罩上，别让一次下滑顺手把 sheet 关掉
              if (dragging) e.preventDefault()
            }}
            style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
            className={cn(
              'pointer-events-auto relative w-full max-w-lg glass-panel-strong rounded-t-dock',
              'pb-[calc(1rem+var(--safe-bottom))] data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2',
              dragging && '!transition-none',
              className,
            )}
            {...props}
          >
            {/* 拖拽指示条 + 把手热区 */}
            <div
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={release}
              onPointerCancel={release}
              data-sheet-handle
              className="shrink-0 pt-2.5 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none"
            >
              <span className="h-[5px] w-9 rounded-full bg-gray-400/50 dark:bg-gray-500/60" />
            </div>
            {children}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    )
  },
)
SheetContent.displayName = DialogPrimitive.Content.displayName

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 px-4 pb-2', className)} {...props} />
)

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-title2 font-semibold tracking-tight', className)} {...props} />
))
SheetTitle.displayName = DialogPrimitive.Title.displayName

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle }
