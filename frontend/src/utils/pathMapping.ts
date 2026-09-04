import { torrentApi } from '@/api/torrent'
import type { PathMapping } from '@/types'

/**
 * 远端 → 本地路径映射。
 *
 * Transmission 与本服务所在宿主的路径不一致时（如 Transmission 跑在容器内、
 * 下载目录是容器内路径），通过 PATH_MAPPINGS 配置「远端=本地」映射，
 * 「打开所在文件夹」「复制路径」即可转换为宿主真实路径。
 */

let cache: PathMapping[] | null = null
let cachePromise: Promise<PathMapping[]> | null = null

async function loadMappings(): Promise<PathMapping[]> {
  if (cache) return cache
  if (!cachePromise) {
    cachePromise = torrentApi
      .pathMap()
      .then((r) => {
        cache = r.mappings ?? []
        return cache
      })
      .catch(() => {
        // 拉取失败不缓存，下次重试
        cachePromise = null
        return [] as PathMapping[]
      })
  }
  return cachePromise
}

/** 清空映射缓存（多服务器切换等场景下配置可能不同） */
export function invalidatePathMappings(): void {
  cache = null
  cachePromise = null
}

/**
 * 将 Transmission 视角的路径转换为宿主本地路径。
 * 未配置映射、无匹配前缀或接口不可用时原样返回。
 */
export async function mapPath(path: string): Promise<string> {
  if (!path) return path
  try {
    const mappings = await loadMappings()
    for (const m of mappings) {
      const from = m.from.replace(/\/+$/, '')
      if (path === from || path.startsWith(from + '/')) {
        const to = m.to.replace(/\/+$/, '')
        return to + path.slice(from.length)
      }
    }
  } catch {
    // 忽略：回退原始路径
  }
  return path
}
