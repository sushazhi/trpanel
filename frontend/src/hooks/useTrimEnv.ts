import { useEffect, useState } from 'react'

export interface TrimConfig {
  theme?: string
  language?: string
  [key: string]: unknown
}

// 飞牛 OS 环境探测（所有调用包裹在 try/catch，非飞牛环境安全降级）
export function useTrimEnv() {
  const [isTrimOS, setIsTrimOS] = useState(false)
  const [config, setConfig] = useState<TrimConfig | null>(null)

  useEffect(() => {
    let active = true
    const detect = async () => {
      try {
        // 动态加载，避免非飞牛环境加载失败
        const mod = (await import('@trimjs/web-app')) as Record<string, unknown>
        const getPlatformConfig = mod.getPlatformConfig as (() => Promise<TrimConfig>) | undefined
        if (getPlatformConfig) {
          const cfg = await getPlatformConfig()
          if (active && cfg) {
            setIsTrimOS(true)
            setConfig(cfg)
          }
        }
      } catch {
        // 非飞牛环境：忽略
      }
    }
    detect()
    return () => {
      active = false
    }
  }, [])

  return { isTrimOS, config }
}

// 飞牛环境文件选择器（失败返回 null，由调用方降级到原生 input）
export async function trimPickUserFile(): Promise<File | null> {
  try {
    const mod = (await import('@trimjs/web-app')) as Record<string, unknown>
    const pickUserFile = mod.pickUserFile as (() => Promise<File | null>) | undefined
    if (pickUserFile) return await pickUserFile()
  } catch {
    // ignore
  }
  return null
}

// 飞牛语义化目录选择（失败返回 null，由调用方保留手动输入）
export async function trimPickFolder(): Promise<string | null> {
  try {
    const mod = (await import('@trimjs/web-app')) as Record<string, unknown>
    const trim = mod.trim as Record<string, unknown> | undefined
    const file = trim?.file as Record<string, unknown> | undefined
    const pick = (file?.pickFolder ?? file?.showFolderPicker ?? trim?.pickFolder) as
      | (() => Promise<unknown>)
      | undefined
    if (typeof pick === 'function') {
      const res = await pick()
      if (typeof res === 'string') return res
      if (res && typeof res === 'object') {
        const r = res as { path?: string }
        if (r.path) return r.path
      }
    }
  } catch {
    // ignore
  }
  return null
}

// 飞牛打开系统文件管理器定位目录（失败静默，非飞牛环境无效果）
export async function trimOpenPath(path: string): Promise<boolean> {
  try {
    const mod = (await import('@trimjs/web-app')) as Record<string, unknown>
    const trim = mod.trim as Record<string, unknown> | undefined
    const file = trim?.file as Record<string, unknown> | undefined
    const webview = trim?.webview as Record<string, unknown> | undefined
    const open = (file?.openPath ?? trim?.openPath ?? webview?.openPath) as
      | ((p: string) => Promise<unknown>)
      | undefined
    if (typeof open === 'function') {
      await open(path)
      return true
    }
  } catch {
    // ignore
  }
  return false
}
