import { useEffect, useState } from 'react'
import { getAuthToken } from '@/api/authToken'
import { useAppStore } from '@/stores/appStore'
import { torrentApi } from '@/api/torrent'
import { APP_BASE } from '@/platform/appBase'
import type { WsMessage } from '@/types'

export type WsStatus = 'connecting' | 'connected' | 'disconnected'

// REST 兜底拉取间隔（仅当 WebSocket 不可用时启用）
const FALLBACK_POLL_MS = 5000
// 初次连接阶段的连续失败上限，达到后放弃重连，仅用 REST 轮询（内嵌 WebView 等环境 ws 不可用）
const MAX_WS_RETRIES = 5
// 已成功连接过说明环境支持 ws，此时放宽上限：后端开发态热重启（air）会频繁断开 ws，
// 不应因重启期间的重试计数而永久退化到轮询
const MAX_WS_RETRIES_AFTER_SUCCESS = 30

// WebSocket 连接管理（自动重连，指数退避）
// 兜底策略：某些环境（如内嵌 WebView）会阻断 WebSocket，此时退化用 REST API 轮询，保证数据可显示
export function useWebSocket() {
  const [status, setStatus] = useState<WsStatus>('connecting')

  useEffect(() => {
    let ws: WebSocket | null = null
    let retryTimer: number | null = null
    let pollTimer: number | null = null
    let retries = 0
    let closed = false
    let everConnected = false
    // 首次成功连接前用较小上限（快速判定环境是否支持 ws），之后放宽以便后端重启后自动恢复
    const retryLimit = () => (everConnected ? MAX_WS_RETRIES_AFTER_SUCCESS : MAX_WS_RETRIES)

    const store = useAppStore.getState()

    // REST 兜底拉取全量种子
    const fetchFallback = async () => {
      try {
        const list = await torrentApi.list()
        useAppStore.getState().setTorrents(list)
      } catch {
        // 忽略：等待下一次兜底或 ws 恢复
      }
    }

    const stopPolling = () => {
      if (pollTimer) {
        window.clearInterval(pollTimer)
        pollTimer = null
      }
    }
    const startPolling = () => {
      stopPolling()
      void fetchFallback()
      pollTimer = window.setInterval(() => void fetchFallback(), FALLBACK_POLL_MS)
    }

    const connect = () => {
      // 取消已排队的重试，避免与本次调用并发创建多个连接
      if (retryTimer) {
        window.clearTimeout(retryTimer)
        retryTimer = null
      }
      if (retries >= retryLimit()) {
        // ws 在此环境不可用，停止重连，仅用 REST 轮询
        setStatus('disconnected')
        store.setWsStatus('disconnected')
        startPolling()
        return
      }
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      // 握手无法携带自定义请求头，令牌只能走查询参数（后端仅对 /ws 接受该参数）
      const token = getAuthToken()
      const handshake = token ? `?token=${encodeURIComponent(token)}` : ''
      let socket: WebSocket
      try {
        // APP_BASE：网关部署时的基础路径（见 platform/appBase），直连部署为空串
        socket = new WebSocket(`${proto}://${location.host}${APP_BASE}/ws${handshake}`)
      } catch {
        startPolling()
        return
      }
      ws = socket
      setStatus('connecting')
      store.setWsStatus('connecting')
      socket.onopen = () => {
        setStatus('connected')
        store.setWsStatus('connected')
        retries = 0
        everConnected = true
        stopPolling() // ws 可用，停止 REST 轮询
        void fetchFallback() // 拉一次最新数据，覆盖连接期间的变更
      }
      socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WsMessage
          if (msg.type === 'full' || msg.type === 'update') {
            useAppStore.getState().setTorrents(msg.data)
          }
        } catch {
          // 忽略无效消息
        }
      }
      socket.onclose = () => {
        if (closed) return
        setStatus('disconnected')
        store.setWsStatus('disconnected')
        startPolling() // ws 断开，REST 轮询兜底
        retries = Math.min(retries + 1, retryLimit())
        retryTimer = window.setTimeout(connect, Math.min(1000 * retries, 30000))
      }
      // 不在 onerror 中手动 close（避免在连接未打开时抛 "WebSocket closed without opened"），
      // 让浏览器自动触发 onclose 完成清理与重试
      socket.onerror = () => {}
    }

    // 页面隐藏时暂停轮询/重连，避免后台空转；恢复可见后自动续接
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling()
        return
      }
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
      if (retries >= retryLimit()) startPolling()
      else connect()
    }

    // 挂载时立即用 REST 拉取一次，避免依赖 ws 才出数据
    void fetchFallback()
    connect()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      closed = true
      if (retryTimer) {
        window.clearTimeout(retryTimer)
        retryTimer = null
      }
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (ws) {
        // 卸载前摘掉回调，避免卸载后仍触发重连/轮询
        ws.onopen = null
        ws.onmessage = null
        ws.onclose = null
        ws.onerror = null
        try {
          ws.close()
        } catch {
          // 连接从未打开时 close 可能抛异常，忽略
        }
        ws = null
      }
    }
  }, [])

  return status
}
