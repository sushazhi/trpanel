import type { Torrent } from '@/types'
import { useAppStore } from '@/stores/appStore'
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
  if (!isMobile && viewMode === 'table') {
    return <DesktopTable torrents={torrents} onOpenDetail={onOpenDetail} onOpenBatchClean={onOpenBatchClean} />
  }
  return <GridView torrents={torrents} onOpenDetail={onOpenDetail} isMobile={isMobile} onOpenBatchClean={onOpenBatchClean} />
}
