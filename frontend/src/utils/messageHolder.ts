import { toast } from 'sonner'

// 持有 toast 实例，供 axios 拦截器等 React 上下文之外的代码使用
let messageInstance: typeof toast | null = null

export function setMessage(instance: typeof toast) {
  messageInstance = instance
}

export function getMessage(): typeof toast | null {
  return messageInstance ?? toast
}
