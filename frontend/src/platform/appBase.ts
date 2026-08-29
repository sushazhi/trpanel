/**
 * 宿网关注入的基础路径（如 /app/transmission），直连部署为空串。
 *
 * 后端在 index.html 的 <meta name="app-base"> 中注入该值，用于拼接 API 与
 * WebSocket 地址。之所以用同步读取：axios 实例与 WebSocket 建连都发生在
 * 模块加载期，等不了平台探测那种异步流程。
 */
function readAppBase(): string {
  if (typeof document === 'undefined') return ''
  const raw = document.querySelector('meta[name="app-base"]')?.getAttribute('content') ?? ''
  // 只接受以 / 开头的纯路径段，避免把异常内容拼进请求地址
  return /^\/[A-Za-z0-9._~/-]*$/.test(raw) ? raw : ''
}

export const APP_BASE: string = readAppBase()
