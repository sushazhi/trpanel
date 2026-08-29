import type { Capability, HostEnv, HostPlatform, PickOptions } from './types'

/** 飞牛 fnOS 宿主提供的能力全集（探测成功后整体启用） */
const CAPABILITIES: readonly Capability[] = [
  'fs.pickFiles',
  'fs.pickFolder',
  'fs.revealPath',
  'auth.passwordless',
  'app.update',
]

// @trimjs/web-app 实际暴露的 API 子集（只导出 TrimApp 类，方法均为实例方法）
interface TrimAppInstance {
  getPlatformConfig(): Promise<unknown>
  openFileManager(path: string): Promise<unknown>
  pickUserFile(params?: Record<string, unknown>): Promise<{ data?: string[] } | undefined>
}

type TrimAppCtor = new () => TrimAppInstance

// 动态加载宿主 SDK：非 fnOS 环境既加载不到，也不该被打进主包
async function loadTrimApp(): Promise<TrimAppCtor | null> {
  try {
    const mod = (await import('@trimjs/web-app')) as unknown as { TrimApp: TrimAppCtor }
    return mod.TrimApp ?? null
  } catch {
    return null
  }
}

/**
 * 构造 fnOS 平台。
 *
 * 构造本身不做探测，需调用 init()：只有真正跑在飞牛壳内时
 * getPlatformConfig() 才会成功，否则平台保持「零能力」，
 * 调用方据此回退到通用行为。
 */
export async function createFnOSPlatform(): Promise<HostPlatform> {
  const caps = new Set<Capability>()
  let env: HostEnv = {}
  let ctor: TrimAppCtor | null = null
  let loaded = false

  const app = async (): Promise<TrimAppCtor | null> => {
    if (!loaded) {
      ctor = await loadTrimApp()
      loaded = true
    }
    return ctor
  }

  const platform: HostPlatform = {
    id: 'fnos',
    capabilities: caps,

    async init() {
      const Ctor = await app()
      if (!Ctor) return
      try {
        const cfg = (await new Ctor().getPlatformConfig()) as HostEnv | null
        if (!cfg) return
        CAPABILITIES.forEach((c) => caps.add(c))
        env = cfg
      } catch {
        // 非 fnOS 环境：保持零能力，由调用方回退到通用平台
      }
    },

    can: (c) => caps.has(c),

    async pickFiles(opts?: PickOptions) {
      const Ctor = await app()
      if (!Ctor) return null
      try {
        const res = await new Ctor().pickUserFile({
          directory: opts?.directory ?? false,
          multiple: opts?.multiple ?? true,
        })
        return res?.data ?? null
      } catch {
        return null
      }
    },

    async pickFolder() {
      const files = await platform.pickFiles({ directory: true, multiple: false })
      return files?.[0] ?? null
    },

    async revealPath(path: string) {
      const Ctor = await app()
      if (!Ctor) return false
      try {
        await new Ctor().openFileManager(path)
        return true
      } catch {
        return false
      }
    },

    get env() {
      return env
    },
  }

  return platform
}
