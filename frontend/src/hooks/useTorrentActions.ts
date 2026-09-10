import { useTranslation } from 'react-i18next'
import { torrentApi } from '@/api/torrent'
import { useAppStore } from '@/stores/appStore'
import { toast } from '@/lib/toast'

// 种子操作封装：统一错误提示与选中状态清理
export function useTorrentActions() {
  const { t } = useTranslation()
  const clearSelection = useAppStore((s) => s.clearSelection)

  // run 统一处理提示与选中清理，并显式返回成败：
  // true = 成功，false = 失败。调用方（如删除确认框）据此决定是否关闭弹窗，
  // 不要依赖 "undefined 即成功" 的隐式约定。
  const run = async (fn: () => Promise<unknown>, successKey: string): Promise<boolean> => {
    try {
      await fn()
      toast.success(t(successKey))
      clearSelection()
      return true
    } catch {
      // 错误提示已由拦截器处理
      return false
    }
  }

  return {
    start: (ids: number[]) => run(() => torrentApi.startMany(ids), 'toast.started'),
    startNow: (ids: number[]) => run(() => torrentApi.startNowMany(ids), 'toast.started'),
    stop: (ids: number[]) => run(() => torrentApi.stopMany(ids), 'toast.stopped'),
    remove: (ids: number[], deleteData = false) =>
      run(() => torrentApi.removeMany(ids, deleteData), 'toast.removed'),
    verify: (id: number) => run(() => torrentApi.verify(id), 'toast.verifyStarted'),
    reannounce: (id: number) => run(() => torrentApi.reannounce(id), 'toast.reannounced'),
    queue: (id: number, direction: 'top' | 'up' | 'down' | 'bottom') =>
      run(() => torrentApi.queue(id, direction), 'toast.queueMoved'),
    update: (id: number, body: Record<string, unknown>) =>
      run(() => torrentApi.update(id, body), 'toast.updated'),
    singleStart: (id: number) => run(() => torrentApi.start(id), 'toast.started'),
    singleStartNow: (id: number) => run(() => torrentApi.startNow(id), 'toast.started'),
    singleStop: (id: number) => run(() => torrentApi.stop(id), 'toast.stopped'),
    singleRemove: (id: number, deleteData = false) =>
      run(() => torrentApi.remove(id, deleteData), 'toast.removed'),
    // 全部操作
    startAll: () => run(() => torrentApi.startAll(), 'toast.started'),
    pauseAll: () => run(() => torrentApi.pauseAll(), 'toast.stopped'),
    reannounceAll: () => run(() => torrentApi.reannounceAll(), 'toast.reannouncedAll'),
  }
}
