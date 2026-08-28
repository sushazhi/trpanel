// PWA Service Worker 注册
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
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
