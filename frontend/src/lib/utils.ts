import { type ClassValue, clsx } from 'clsx'
import type { CSSProperties } from 'react'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 挂自定义 CSS 属性（如 --chip）。React 的 CSSProperties 不接受未知键，
 *  逐处 as 断言既啰嗦又会顺带放过真正的拼写错误，所以只在这一处收口。 */
export const cssVars = (vars: Record<`--${string}`, string>): CSSProperties => vars as CSSProperties
