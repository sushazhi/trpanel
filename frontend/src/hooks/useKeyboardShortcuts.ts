import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useTorrentActions } from '@/hooks/useTorrentActions'
import { useAppStore } from '@/stores/appStore'
import { confirm } from '@/lib/confirm'

// 键盘快捷键：Delete 删除 / Space 开始暂停 / Ctrl+A 全选（当前过滤结果）/ Esc 取消选择 / N 添加 / / 聚焦搜索
export function useKeyboardShortcuts({ onAdd, onSelectAll }: {
  onAdd: () => void
  onSelectAll?: () => void
}) {
  const actions = useTorrentActions()
  const { t } = useTranslation()
  const onAddRef = useRef(onAdd)
  const onSelectAllRef = useRef(onSelectAll)
  useEffect(() => {
    onAddRef.current = onAdd
  }, [onAdd])
  useEffect(() => {
    onSelectAllRef.current = onSelectAll
  }, [onSelectAll])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      // 输入框内不拦截
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      const { selectedIds, torrents, clearSelection, selectAll } = useAppStore.getState()
      const isCtrl = e.ctrlKey || e.metaKey

      if (isCtrl && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        if (onSelectAllRef.current) onSelectAllRef.current()
        else selectAll()
        return
      }
      // 字体大小调节：Ctrl+= / Ctrl+-
      if (isCtrl && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        const { fontSize, setFontSize } = useAppStore.getState()
        setFontSize(Math.min(20, fontSize + 1))
        return
      }
      if (isCtrl && e.key === '-') {
        e.preventDefault()
        const { fontSize, setFontSize } = useAppStore.getState()
        setFontSize(Math.max(12, fontSize - 1))
        return
      }
      if (e.key === 'Escape') {
        clearSelection()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0) {
          e.preventDefault()
          void confirm({
            title: t('confirm.removeTitle'),
            content: t('confirm.removeContent'),
            danger: true,
          }).then((ok) => {
            if (ok) void actions.remove(selectedIds)
          })
        }
        return
      }
      if (e.key === ' ') {
        if (selectedIds.length > 0) {
          e.preventDefault()
          const anyActive = selectedIds.some((id) => {
            const t2 = torrents.find((x) => x.id === id)
            return t2 && (t2.status === 4 || t2.status === 6)
          })
          if (anyActive) void actions.stop(selectedIds)
          else void actions.start(selectedIds)
        }
        return
      }
      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        onAddRef.current()
        return
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        document.getElementById('search-input')?.focus()
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [actions, t, onAdd])
}
