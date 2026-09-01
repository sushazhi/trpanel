import { type ClassValue, clsx } from 'clsx'
import type { CSSProperties } from 'react'
import { extendTailwindMerge } from 'tailwind-merge'

// index.css @theme 里的自定义字号 token。默认 twMerge 不认识 text-footnote 这类类名，
// 会把它们归入 text 颜色组，与 text-gray-* 等判为同类冲突后丢弃（字号回退成继承值）。
// 显式注册进 font-size 组后，字号与颜色才能共存。
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['caption2', 'caption1', 'footnote', 'body', 'subhead', 'title1', 'title2'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 挂自定义 CSS 属性（如 --chip）。React 的 CSSProperties 不接受未知键，
 *  逐处 as 断言既啰嗦又会顺带放过真正的拼写错误，所以只在这一处收口。 */
export const cssVars = (vars: Record<`--${string}`, string>): CSSProperties => vars as CSSProperties
