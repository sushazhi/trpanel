import { useEffect } from 'react'

/**
 * 内嵌 WebView 兜底：部分宿主 App 的 WebView 并不把页面画进状态栏底下，
 * 内核却仍上报 env(safe-area-inset-top)（把状态栏/自家工具栏高度算了进来），
 * 顶栏被整体推走，顶部留出一条大空白（fnOS App 内置打开即此症）。
 *
 * 判据：视口真正覆盖屏幕顶端（iOS PWA、边到边 WebView）时 innerHeight ≈ screen.height，
 * 上报值是真实的，照常避让；视口顶上有宿主 chrome 时上报值必为虚报，归零。
 * 只在挂载与旋转后重估——键盘引发的临时 resize 不改变"屏幕顶端归谁"，
 * 若跟着 resize 归零，边到边环境下唤起键盘会让顶栏顶进状态栏。
 */
export function useSafeAreaGuard() {
  useEffect(() => {
    const root = document.documentElement
    // 自定义属性读回的是未解析的 token（如 min(...)），env 的 px 值只能用探针元素量
    const probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText =
      'position:absolute;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px)'
    document.body.appendChild(probe)

    const apply = () => {
      const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0
      const coversTop = window.innerHeight >= window.screen.height - 24
      if (inset > 0 && !coversTop) root.style.setProperty('--safe-top', '0px')
      else root.style.removeProperty('--safe-top')
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const onRotate = () => {
      clearTimeout(timer)
      timer = setTimeout(apply, 350)
    }

    apply()
    window.addEventListener('orientationchange', onRotate)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('orientationchange', onRotate)
      probe.remove()
      root.style.removeProperty('--safe-top')
    }
  }, [])
}
