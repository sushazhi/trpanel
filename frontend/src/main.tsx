import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { PlatformProvider } from './platform'
import { APP_BASE } from './platform/appBase'
import './styles/index.css'

// 生产环境注册 Service Worker（PWA）；网关部署时同样需要拼上基础路径
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${APP_BASE}/sw.js`).catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlatformProvider>
      <App />
    </PlatformProvider>
  </StrictMode>,
)
