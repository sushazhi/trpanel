/**
 * 宿主平台抽象。
 *
 * 核心功能只依赖本文件定义的接口：默认实现（web）不具备任何宿主能力，
 * UI 在能力缺失时自动隐藏对应入口，因此同一套代码可以直接跑在浏览器、
 * 飞牛 fnOS 或任何未来的宿主里，无需在各组件里判断「当前是不是某系统」。
 */

/** 宿主能力：UI 只问「支不支持某项能力」，不关心底层是哪个宿主 */
export type Capability =
  /** 从宿主文件选择器挑文件（如 NAS 上的种子文件） */
  | 'fs.pickFiles'
  /** 从宿主文件选择器挑目录 */
  | 'fs.pickFolder'
  /** 在宿主文件管理器中定位目录 */
  | 'fs.revealPath'
  /** 由宿主统一认证，无需本机登录 */
  | 'auth.passwordless'
  /** 宿主应用更新（如 fnOS 的 fpk 更新包） */
  | 'app.update'

export interface PickOptions {
  directory?: boolean
  multiple?: boolean
}

/** 宿主提供的运行环境信息（主题 / 语言同步） */
export interface HostEnv {
  theme?: string
  language?: string
  [key: string]: unknown
}

export interface HostPlatform {
  /** 平台标识：web | fnos | ... */
  readonly id: string
  /** 该平台实际具备的宿主能力（init 后填充） */
  readonly capabilities: ReadonlySet<Capability>
  /** 探测宿主能力；可重复调用 */
  init(): Promise<void>
  /** 是否具备某项能力 */
  can(c: Capability): boolean
  /** 从宿主选择文件，返回路径列表；不支持或用户取消时返回 null */
  pickFiles(opts?: PickOptions): Promise<string[] | null>
  /** 从宿主选择单个目录，返回路径；不支持或用户取消时返回 null */
  pickFolder(): Promise<string | null>
  /** 在宿主文件管理器中定位目录，成功返回 true */
  revealPath(path: string): Promise<boolean>
  /** 宿主环境信息（主题 / 语言），通用平台为空对象 */
  readonly env: HostEnv
}
