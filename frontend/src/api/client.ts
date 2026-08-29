import axios from 'axios'
import type { ApiResponse } from '@/types'
import { APP_BASE } from '@/platform/appBase'
import { getMessage } from '@/utils/messageHolder'
import { translateApiError } from '@/utils/errors'

export const client = axios.create({
  baseURL: APP_BASE + '/api',
  timeout: 30000,
})

// 响应拦截：解包统一响应结构
client.interceptors.response.use(
  (resp) => resp,
  (error) => {
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
