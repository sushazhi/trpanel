import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/index.css'

// TEMP DIAGNOSTIC: surface the React component stack for the Children.only crash
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  componentDidCatch(error: Error, info: unknown) {
    const stack = (info as { componentStack?: string })?.componentStack || ''
    const full = 'MSG: ' + (error.message || '') + '\nSTACK:\n' + (error.stack || '') + '\nCOMPONENT:\n' + stack
    fetch('/__diag?stack=' + encodeURIComponent(full)).catch(() => {})
    // eslint-disable-next-line no-console
    console.error('COMPONENT_STACK_START\n' + full + '\nCOMPONENT_STACK_END')
    setTimeout(() => {
      throw new Error('DIAGNOSTIC: ' + error.message + ' || STACK: ' + stack)
    }, 0)
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

// 生产环境注册 Service Worker（PWA）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
