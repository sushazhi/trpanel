import type { Capability, HostPlatform } from './types'

/**
 * 通用 Web 平台：不假设任何宿主能力，全部返回「不支持」。
 *
 * 这样核心功能（种子管理 / 自动文件管理 / 做种策略 / 会话设置）在任何浏览器里都完整可用，
 * 只是与宿主深度集成的入口（文件选择器、打开目录、应用更新）会自动隐藏。
 */
export const webPlatform: HostPlatform = {
  id: 'web',
  capabilities: new Set<Capability>(),
  async init() {
    // 通用平台没有需要探测的宿主能力
  },
  can: () => false,
  async pickFiles() {
    return null
  },
  async pickFolder() {
    return null
  },
  async revealPath() {
    return false
  },
  env: {},
}
