"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

// 进出场消费 styles/index.css 里注册的 --animate-tm-pop-*：
// Tailwind v4 核心不生成 animate-in / fade-in-0 / zoom-in-95 这类插件工具类，
// 沿用它们等于没有动画。origin 必须写成括号简写，v4 不再把 [--var] 隐式转成 var()。
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-footnote text-primary-foreground",
        "data-[state=instant-open]:animate-tm-pop-in data-[state=delayed-open]:animate-tm-pop-in data-[state=closed]:animate-tm-pop-out",
        "origin-(--radix-tooltip-content-transform-origin)",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
