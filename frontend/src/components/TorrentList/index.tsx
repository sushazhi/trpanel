import type { Torrent } from '@/types'
import { useAppStore } from '@/stores/appStore'
import { useResponsive } from '@/hooks/useResponsive'
import { DesktopTable } from './DesktopTable'
import { GridView } from './GridView'

// 桌面端支持表格/网格双视图；移动端同样使用图一玻璃卡片列表
export function TorrentList({ torrents, isMobile, onOpenDetail, onOpenBatchClean }: {
  torrents: Torrent[]
  isMobile: boolean
  onOpenDetail: (t: Torrent) => void
  onOpenBatchClean?: () => void
}) {
  const viewMode = useAppStore((s) => s.viewMode)
  const { isCoarse } = useResponsive()
  // 表格的列宽/列序与行拖拽全部建立在鼠标事件上，平板视口够宽却用的是手指，
  // 按宽度判定会发一张操作不了的表；粗指针一律退回卡片视图
  if (!isMobile && !isCoarse && viewMode === 'table') {
    return <DesktopTable torrents={torrents} onOpenDetail={onOpenDetail} onOpenBatchClean={onOpenBatchClean} />
  }
  return <GridView torrents={torrents} onOpenDetail={onOpenDetail} isMobile={isMobile} onOpenBatchClean={onOpenBatchClean} />
}
