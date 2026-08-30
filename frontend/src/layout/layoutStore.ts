import { create } from 'zustand'
import { computeLayout, resolveLayout, type LayoutDecision } from './breakpoints'

export interface MeasureInput {
  /** .tm-shell 实测宽度 */
  shellW: number
  sidebarWidth: number
  detailOpen: boolean
  allowPane: boolean
  coarse: boolean
  singleLine: boolean
  gap: number
  safeX: number
}

interface LayoutState {
  /** 首次测量前为 false，此时 decision 只是保守占位 */
  ready: boolean
  decision: LayoutDecision
  /** 返回结果是否变化；测量点用它决定是否要写 DOM */
  measure: (input: MeasureInput) => boolean
}

const UNMEASURED: LayoutDecision = resolveLayout('xs', {
  paneMounted: false,
  coarse: false,
  singleLine: false,
  gateTier: 'xs',
  sidebarForm: 'drawer',
  sidebarSlot: 0,
  paneSlot: 0,
  free: 0,
})

function same(a: LayoutDecision, b: LayoutDecision): boolean {
  return (
    a.tier === b.tier &&
    a.dockTier === b.dockTier &&
    a.sidebarForm === b.sidebarForm &&
    a.sidebarSlot === b.sidebarSlot &&
    a.paneSlot === b.paneSlot &&
    a.free === b.free &&
    a.detailVariant === b.detailVariant &&
    a.allowTable === b.allowTable &&
    a.rowHeight === b.rowHeight &&
    a.gridCols === b.gridCols &&
    a.columnCeiling === b.columnCeiling &&
    a.tapOpensDetail === b.tapOpensDetail &&
    a.populatePaneOnClick === b.populatePaneOnClick &&
    a.swipeEnabled === b.swipeEnabled &&
    a.floatingBar === b.floatingBar &&
    a.scale === b.scale
  )
}

/**
 * 几何状态刻意不进 appStore：拖窗口时每帧都会变，落到 localStorage 上就是持续写盘。
 * 迟滞用的上一档就是当前 decision 里的值，因此不需要额外字段。
 */
export const useLayoutStore = create<LayoutState>()((set, get) => ({
  ready: false,
  decision: UNMEASURED,
  measure: (input) => {
    const { decision, ready } = get()
    const next = computeLayout({
      ...input,
      prevGateTier: ready ? decision.dockTier : null,
      prevTier: ready ? decision.tier : null,
    }).decision
    if (same(decision, next)) return false
    set({ decision: next, ready: true })
    return true
  },
}))
