// PWA Service Worker 注册
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // 按脚本自身 URL 解析：部署在宿主网关子路径（/app/transmission/）下时
    // 写死 '/sw.js' 会落到站点根而 404，手机端安装与离线缓存整体失效
    const here = new URL('.', (document.currentScript && document.currentScript.src) || window.location.href)
    navigator.serviceWorker
      .register(new URL('sw.js', here).href)
      .then((registration) => {
        console.log('[PWA] SW registered:', registration.scope)
        // 监听更新
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // 有新版本可用，触发通知
              window.dispatchEvent(new CustomEvent('pwa-update-available'))
            }
          })
        })
      })
      .catch((error) => {
        console.error('[PWA] SW registration failed:', error)
      })
  })
}

// 强制刷新逻辑（由 PwaUpdatePrompt 组件调用）
window.addEventListener('pwa-refresh', () => {
  window.location.reload()
})
