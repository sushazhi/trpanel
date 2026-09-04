import type { WsMessage } from '@/types'
import { listTorrents } from './state'

// 演示模式假 WebSocket：对齐 useWebSocket 用到的最小接口
// （onopen/onmessage/onclose/onerror/readyState/close），定时推送全量快照
export class DemoSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState: number = DemoSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  private openTimer: number
  private pushTimer: number

  constructor() {
    this.openTimer = window.setTimeout(() => {
      if (this.readyState !== DemoSocket.CONNECTING) return
      this.readyState = DemoSocket.OPEN
      this.onopen?.()
    }, 120)
    this.pushTimer = window.setInterval(() => {
      if (this.readyState !== DemoSocket.OPEN) return
      const msg: WsMessage = { type: 'full', data: listTorrents(), timestamp: Date.now() }
      this.onmessage?.({ data: JSON.stringify(msg) })
    }, 1500)
  }

  close(): void {
    if (this.readyState === DemoSocket.CLOSED) return
    this.readyState = DemoSocket.CLOSED
    window.clearTimeout(this.openTimer)
    window.clearInterval(this.pushTimer)
    this.onclose?.()
  }

  send(): void {}
}
