import { bencodeEncode } from './bencode'
import type { BencodeValue } from './bencode'

export interface TorrentSourceFile {
  /** 相对路径（多文件时含顶层目录名） */
  path: string
  file: File
}

export interface CreateTorrentOptions {
  announce?: string
  announceList?: string[][]
  privateTorrent?: boolean
  comment?: string
  createdBy?: string
  pieceLength?: number
  webSeeds?: string[]
}

async function sha1(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-1', data as BufferSource)
  return new Uint8Array(digest)
}

// 浏览器端创建 .torrent（bencode + 分片 SHA1）
export async function createTorrent(
  files: TorrentSourceFile[],
  opts: CreateTorrentOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  if (files.length === 0) throw new Error('没有文件')
  const pieceLength = opts.pieceLength ?? 1024 * 1024

  const hashes: Uint8Array[] = []
  let buffer = new Uint8Array(0)
  let totalSize = 0
  let processed = 0

  const flushPieces = async () => {
    while (buffer.length >= pieceLength) {
      const piece = buffer.slice(0, pieceLength)
      buffer = buffer.slice(pieceLength)
      hashes.push(await sha1(piece))
    }
  }

  for (const f of files) {
    totalSize += f.file.size
    let offset = 0
    while (offset < f.file.size) {
      const chunk = new Uint8Array(await f.file.slice(offset, offset + pieceLength).arrayBuffer())
      const merged = new Uint8Array(buffer.length + chunk.length)
      merged.set(buffer, 0)
      merged.set(chunk, buffer.length)
      buffer = merged
      offset += chunk.length
      processed += chunk.length
      await flushPieces()
      onProgress?.(processed, totalSize)
    }
  }
  if (buffer.length > 0) hashes.push(await sha1(buffer))

  const pieces = new Uint8Array(hashes.length * 20)
  hashes.forEach((h, i) => pieces.set(h, i * 20))

  // info 字典
  const firstParts = files[0].path.split('/').filter(Boolean)
  const isMulti = files.length > 1 || firstParts.length > 1
  const name = isMulti ? firstParts[0] : firstParts[firstParts.length - 1] || 'torrent'

  const info: Record<string, BencodeValue> = {
    name,
    'piece length': pieceLength,
    pieces,
  }
  if (opts.privateTorrent) info.private = 1

  if (isMulti) {
    const fileList: BencodeValue[] = files.map((f) => ({
      length: f.file.size,
      path: f.path.split('/').filter(Boolean).slice(1),
    }))
    info.files = fileList
  } else {
    info.length = totalSize
  }

  // 顶层字典
  const root: Record<string, BencodeValue> = { info }
  if (opts.announce?.trim()) root.announce = opts.announce.trim()
  if (opts.announceList?.length) root['announce-list'] = opts.announceList
  if (opts.comment?.trim()) root.comment = opts.comment.trim()
  if (opts.createdBy?.trim()) root['created by'] = opts.createdBy.trim()
  if (opts.webSeeds?.length) root['url-list'] = opts.webSeeds.filter((x) => x.trim())
  root.creationdate = Math.floor(Date.now() / 1000)

  return bencodeEncode(root)
}

// 推荐分片大小
export function suggestPieceLength(totalSize: number): number {
  if (totalSize < 256 * 1024 * 1024) return 256 * 1024
  if (totalSize < 1024 * 1024 * 1024) return 512 * 1024
  if (totalSize < 4 * 1024 * 1024 * 1024) return 1024 * 1024
  if (totalSize < 16 * 1024 * 1024 * 1024) return 4 * 1024 * 1024
  return 16 * 1024 * 1024
}

// 递归收集目录句柄中的文件
export async function collectDirHandle(
  dir: FileSystemDirectoryHandle,
  prefix = '',
): Promise<TorrentSourceFile[]> {
  const result: TorrentSourceFile[] = []
  const entries = (dir as unknown as {
    entries: () => AsyncIterableIterator<[string, FileSystemHandle]>
  }).entries()
  for await (const [name, handle] of entries) {
    const path = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'file') {
      const file = await (handle as FileSystemFileHandle).getFile()
      result.push({ path, file })
    } else {
      result.push(...(await collectDirHandle(handle as FileSystemDirectoryHandle, path)))
    }
  }
  return result
}
