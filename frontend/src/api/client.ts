import axios from 'axios'
import type { ApiResponse } from '@/types'
import { APP_BASE } from '@/platform/appBase'
import { getMessage } from '@/utils/messageHolder'
import { translateApiError } from '@/utils/errors'
import { getAuthToken, UNAUTHORIZED_EVENT } from './authToken'

export const client = axios.create({
  baseURL: APP_BASE + '/api',
  timeout: 30000,
})

// 请求拦截：服务端启用 API_TOKEN 时，鉴权令牌只走请求头
client.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) config.headers['X-Auth-Token'] = token
  return config
})

// 响应拦截：解包统一响应结构
client.interceptors.response.use(
  (resp) => resp,
  (error) => {
    // 401 交给令牌输入框统一处理：首屏并发请求若各弹一条提示会刷屏
    if (error.response?.status === 401) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
      return Promise.reject(error)
    }
    const raw =
      error.response?.data?.message ||
      (error.code === 'ECONNABORTED' ? '请求超时' : '网络错误，请检查服务是否运行')
    getMessage()?.error(translateApiError(raw))
    return Promise.reject(error)
  },
)

// 通用请求助手：解包 ApiResponse
export async function request<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const resp = await promise
  if (resp.data.code !== 0) {
    const msg = translateApiError(resp.data.message || '请求失败')
    getMessage()?.error(msg)
    throw new Error(msg)
  }
  return resp.data.data
}
