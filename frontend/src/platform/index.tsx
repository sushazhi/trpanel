import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { webPlatform } from './web'
import type { Capability, HostPlatform, PickOptions } from './types'

interface PlatformState {
  platform: HostPlatform
  /** 宿主探测是否完成；完成前所有 can() 均为 false（渐进增强） */
  ready: boolean
}

const PlatformContext = createContext<PlatformState>({ platform: webPlatform, ready: false })

/**
 * 解析当前宿主平台。
 * 可用 VITE_PLATFORM 强制指定（fnos | web）；未指定时运行时探测，
 * 探测不到宿主能力即回退通用平台，保证核心功能永远可用。
 */
async function resolvePlatform(): Promise<HostPlatform> {
  const forced = (import.meta.env.VITE_PLATFORM ?? '').trim().toLowerCase()
  if (forced === 'web' || forced === 'generic') return webPlatform

  // 动态导入：非 fnOS 环境不必加载宿主 SDK
  const { createFnOSPlatform } = await import('./fnos')
  const fnos = await createFnOSPlatform()
  await fnos.init()
  if (forced === 'fnos') return fnos
  // 自动探测：拿不到平台配置说明不在飞牛壳内
  return fnos.can('fs.pickFiles') ? fnos : webPlatform
}

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlatformState>({ platform: webPlatform, ready: false })

  useEffect(() => {
    let active = true
    void resolvePlatform()
      .then((platform) => {
        if (active) setState({ platform, ready: true })
      })
      .catch(() => {
        // 探测失败一律降级为通用平台，不阻断应用启动
        if (active) setState({ platform: webPlatform, ready: true })
      })
  }, [])

  return <PlatformContext.Provider value={state}>{children}</PlatformContext.Provider>
}

/** 访问宿主能力。组件应只用 can() 判断入口是否出现，避免直接比较平台标识 */
export function usePlatform() {
  const { platform, ready } = useContext(PlatformContext)
  return useMemo(
    () => ({
      /** 平台标识（仅用于展示与排错，业务逻辑请用 can） */
      id: platform.id,
      ready,
      can: (c: Capability) => platform.can(c),
      pickFiles: (opts?: PickOptions) => platform.pickFiles(opts),
      pickFolder: () => platform.pickFolder(),
      revealPath: (path: string) => platform.revealPath(path),
      /** 宿主环境信息（主题 / 语言） */
      env: platform.env,
    }),
    [platform, ready],
  )
}
