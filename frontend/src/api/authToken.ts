// 服务端 API_TOKEN 鉴权所需的访问令牌。
// 后端只认 X-Auth-Token / Authorization 请求头（WebSocket 握手例外，浏览器无法加头，只能走查询参数），
// 令牌本身由运维写在服务端配置里，浏览器侧只能由用户输入一次并留在本地。
const STORAGE_KEY = 'tm.authToken'

// 任一请求返回 401 时广播，由令牌输入对话框统一接管，避免每个并发请求各弹一条错误
export const UNAUTHORIZED_EVENT = 'tm:unauthorized'

export function getAuthToken(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    // 无痕模式等场景下 localStorage 不可用
    return ''
  }
}

export function setAuthToken(token: string): void {
  try {
    if (token) {
      window.localStorage.setItem(STORAGE_KEY, token)
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // 存不下就只影响本次会话，不阻断界面
  }
}
