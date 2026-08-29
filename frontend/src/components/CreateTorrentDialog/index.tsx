import { useMemo, useRef, useState } from 'react'
import { FilePlus, FolderPlus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  collectDirHandle,
  createTorrent,
  suggestPieceLength,
} from '@/utils/createTorrent'
import type { TorrentSourceFile } from '@/utils/createTorrent'
import { downloadBytes } from '@/utils/bencode'
import { formatBytes } from '@/utils/format'
import { torrentApi } from '@/api/torrent'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

// 浏览器端创建 .torrent 对话框
export function CreateTorrentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [sources, setSources] = useState<TorrentSourceFile[]>([])
  const [announce, setAnnounce] = useState('')
  const [webSeeds, setWebSeeds] = useState('')
  const [comment, setComment] = useState('')
  const [privateTorrent, setPrivateTorrent] = useState(false)
  const [addAfterBuild, setAddAfterBuild] = useState(false)
  const [pieceMode, setPieceMode] = useState('auto')
  const [building, setBuilding] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dirInputRef = useRef<HTMLInputElement>(null)

  const totalSize = useMemo(() => sources.reduce((n, s) => n + s.file.size, 0), [sources])
  // 分块大小映射（16KB ~ 16MB 全档位）
  const pieceMap: Record<string, number> = {
    '16k': 16 * 1024,
    '32k': 32 * 1024,
    '64k': 64 * 1024,
    '128k': 128 * 1024,
    '256k': 256 * 1024,
    '512k': 512 * 1024,
    '1m': 1024 * 1024,
    '2m': 2 * 1024 * 1024,
    '4m': 4 * 1024 * 1024,
    '8m': 8 * 1024 * 1024,
    '16m': 16 * 1024 * 1024,
  }
  const pieceLength = useMemo(() => pieceMap[pieceMode] ?? suggestPieceLength(totalSize), [pieceMode, totalSize])

  const pickDir = async () => {
    const picker = (window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> })
      .showDirectoryPicker
    if (picker) {
      try {
        const dir = await picker()
        const files = await collectDirHandle(dir)
        if (files.length) setSources((prev) => [...prev, ...files])
      } catch {
        // 用户取消
      }
    } else {
      dirInputRef.current?.click()
    }
  }

  const build = async () => {
    if (sources.length === 0) return
    setBuilding(true)
    setProgress(0)
    try {
      const data = await createTorrent(
        sources,
        {
          announce: announce || undefined,
          privateTorrent,
          pieceLength,
          comment: comment || undefined,
          createdBy: 'Transmission WebUI for fnOS',
          webSeeds: webSeeds.split('\n').map((x) => x.trim()).filter(Boolean),
        },
        (done, total) => setProgress(total ? Math.round((done / total) * 100) : 0),
      )
      const name = sources[0].path.split('/').pop()?.replace(/[\\/:*?"<>|]/g, '_') || 'torrent'
      if (addAfterBuild) {
        // 生成后自动添加该种子到下载列表
        const torrentFile = new File([data as unknown as BlobPart], `${name}.torrent`, { type: 'application/x-bittorrent' })
        await torrentApi.addFile(torrentFile)
        toast.success(t('toast.added'))
      } else {
        downloadBytes(data, `${name}.torrent`)
        toast.success(t('toast.copied'))
      }
      setSources([])
      setAnnounce('')
      setComment('')
      setPrivateTorrent(false)
      setAddAfterBuild(false)
      onClose()
    } catch {
      toast.error(t('common.loading'))
    } finally {
      setBuilding(false)
    }
  }

  const canBuild = sources.length > 0 && !building

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t('createTorrent.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 文件选择 */}
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []).map((f) => ({ path: f.name, file: f }))
                setSources((prev) => [...prev, ...fs])
              }}
            />
            <input
              ref={dirInputRef}
              type="file"
              multiple
              className="hidden"
              // @ts-expect-error webkitdirectory 非标准属性
              webkitdirectory=""
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []).map((f) => ({
                  path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
                  file: f,
                }))
                setSources((prev) => [...prev, ...fs])
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <FilePlus className="w-4 h-4" />
              {t('createTorrent.addFiles')}
            </Button>
            <Button variant="outline" size="sm" onClick={pickDir}>
              <FolderPlus className="w-4 h-4" />
              {t('createTorrent.addFolder')}
            </Button>
          </div>

          {sources.length > 0 && (
            <div className="max-h-40 overflow-y-auto border border-gray-200/40 dark:border-gray-700/40 rounded-lg p-2 space-y-1">
              {sources.slice(0, 50).map((s, i) => (
                <div key={`${s.path}-${i}`} className="flex items-center gap-2 text-footnote text-gray-600 dark:text-gray-300">
                  <span className="truncate flex-1">{s.path}</span>
                  <span className="text-gray-400 shrink-0">{formatBytes(s.file.size)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-gray-400 hover:text-red-500"
                    onClick={() => setSources((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              {sources.length > 50 && <div className="text-footnote text-gray-400">{t('createTorrent.moreFiles', { count: sources.length - 50 })}</div>}
            </div>
          )}
          {sources.length > 0 && (
            <div className="text-footnote text-gray-500">
              {t('createTorrent.fileSummary', { count: sources.length, size: formatBytes(totalSize) })}
            </div>
          )}

          {/* 选项 */}
          <Input
            placeholder={t('createTorrent.announcePlaceholder')}
            value={announce}
            onChange={(e) => setAnnounce(e.target.value)}
          />
          <textarea
            rows={2}
            placeholder={t('createTorrent.webSeeds')}
            value={webSeeds}
            onChange={(e) => setWebSeeds(e.target.value)}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-body shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Input
            placeholder={t('createTorrent.comment')}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <span className="text-body">{t('createTorrent.private')}</span>
            <Switch checked={privateTorrent} onCheckedChange={setPrivateTorrent} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-body">{t('createTorrent.pieceLength')}</span>
            <Select value={pieceMode} onValueChange={(v) => setPieceMode(v)}>
              <SelectTrigger className="h-8 w-40 text-footnote">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-panel-solid">
                <SelectItem value="auto">{t('createTorrent.autoPiece')} ({formatBytes(pieceLength)})</SelectItem>
                {[16, 32, 64, 128, 256, 512].map((k) => (
                  <SelectItem key={k} value={`${k}k`}>{k} KB</SelectItem>
                ))}
                {[1, 2, 4, 8, 16].map((m) => (
                  <SelectItem key={m} value={`${m}m`}>{m} MB</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-body">{t('createTorrent.addAfterBuild')}</span>
            <Switch checked={addAfterBuild} onCheckedChange={setAddAfterBuild} />
          </div>

          {building && <Progress value={progress} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!canBuild} onClick={build}>
            {building ? t('createTorrent.building') : t('createTorrent.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
