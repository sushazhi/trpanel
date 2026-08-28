// 解析 .torrent 文件（bencode 解码），提取文件列表、Tracker、元信息
import { bencodeDecode } from './bencode'
import type { BencodeValue } from './bencode'

export interface TorrentParsedFile {
  name: string
  length: number
}

export interface ParsedTorrent {
  name: string
  comment: string
  createdBy: string
  private: boolean
  totalSize: number
  files: TorrentParsedFile[]
  announceList: string[]
}

function bytesToStr(v: BencodeValue | undefined): string {
  if (v instanceof Uint8Array) {
    // 逐字节替换非法 UTF-8 序列为 '?'，避免个别名称导致整个解析失败
    return utf8Decode(v)
  }
  return ''
}

function utf8Decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\u0000/g, '')
  } catch {
    return new TextDecoder('latin1').decode(bytes).replace(/\u0000/g, '')
  }
}

export function parseTorrentFile(data: Uint8Array): ParsedTorrent | null {
  try {
    const decoded = bencodeDecode(data)
    if (typeof decoded !== 'object' || Array.isArray(decoded)) return null
    const root = decoded as Record<string, BencodeValue>
    const info = root['info']
    if (typeof info !== 'object' || Array.isArray(info) || info === null) return null
    const infoDict = info as Record<string, BencodeValue>

    const name = bytesToStr(infoDict['name']) || '未命名种子'
    const files: TorrentParsedFile[] = []
    let totalSize = 0

    // 单文件种子：info.length
    if (typeof infoDict['length'] === 'number') {
      const len = infoDict['length'] as number
      files.push({ name, length: len })
      totalSize += len
    }
    // 多文件种子：info.files
    const fileList = infoDict['files']
    if (Array.isArray(fileList)) {
      for (const f of fileList) {
        if (typeof f !== 'object' || Array.isArray(f) || f === null) continue
        const fd = f as Record<string, BencodeValue>
        const pathArr = fd['path']
        const path = Array.isArray(pathArr)
          ? pathArr.map((p) => bytesToStr(p)).filter(Boolean).join('/')
          : name
        const len = typeof fd['length'] === 'number' ? (fd['length'] as number) : 0
        files.push({ name: path || name, length: len })
        totalSize += len
      }
    }

    // 提取 Tracker：announce + announce-list
    const announces = new Set<string>()
    const announce = bytesToStr(root['announce'])
    if (announce) announces.add(announce)
    const announceList = root['announce-list']
    if (Array.isArray(announceList)) {
      for (const tier of announceList) {
        if (Array.isArray(tier)) {
          for (const a of tier) {
            const s = bytesToStr(a)
            if (s) announces.add(s)
          }
        }
      }
    }

    return {
      name,
      comment: bytesToStr(root['comment']),
      createdBy: bytesToStr(root['created by']),
      private: infoDict['private'] === 1,
      totalSize,
      files,
      announceList: [...announces],
    }
  } catch {
    return null
  }
}
