import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { PlatformProvider } from './platform'
import './styles/index.css'
// 自托管国旗图标（Windows 无彩色国旗字体，emoji 方案显示不出旗帜）
import 'flag-icons/css/flag-icons.min.css'

// 生产环境注册 Service Worker（PWA）；相对页面路径解析，子路径部署（网关/GitHub Pages）同样成立
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlatformProvider>
      <App />
    </PlatformProvider>
  </StrictMode>,
)
