// 极简 bencode 编码器（仅编码，用于浏览器端创建 .torrent）

export type BencodeValue =
  | string
  | number
  | Uint8Array
  | BencodeValue[]
  | { [key: string]: BencodeValue }

const te = new TextEncoder()

function bytesOf(s: string): Uint8Array {
  return te.encode(s)
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

export function bencodeEncode(value: BencodeValue): Uint8Array {
  if (typeof value === 'number') {
    return bytesOf(`i${Math.floor(value)}e`)
  }
  if (typeof value === 'string') {
    const body = bytesOf(value)
    return concat([bytesOf(String(body.length)), bytesOf(':'), body])
  }
  if (value instanceof Uint8Array) {
    return concat([bytesOf(String(value.length)), bytesOf(':'), value])
  }
  if (Array.isArray(value)) {
    const parts: Uint8Array[] = [bytesOf('l')]
    for (const item of value) parts.push(bencodeEncode(item))
    parts.push(bytesOf('e'))
    return concat(parts)
  }
  // 字典：键按 UTF-8 字节序排序
  const keys = Object.keys(value).sort()
  const parts: Uint8Array[] = [bytesOf('d')]
  for (const key of keys) {
    parts.push(bencodeEncode(key))
    parts.push(bencodeEncode(value[key]))
  }
  parts.push(bytesOf('e'))
  return concat(parts)
}

// 极简 bencode 解码器（用于浏览器端解析 .torrent 文件）
const latin1 = new TextDecoder('latin1')
const utf8 = new TextDecoder('utf-8')

export function bencodeDecode(data: Uint8Array): BencodeValue {
  let pos = 0

  const readNumber = (): number => {
    const start = pos
    while (pos < data.length && data[pos] !== 0x3a /* ':' */) pos++
    if (pos >= data.length) throw new Error('bencode: 缺少冒号')
    const n = Number(latin1.decode(data.subarray(start, pos)))
    pos++
    return n
  }

  const parse = (): BencodeValue => {
    if (pos >= data.length) throw new Error('bencode: 意外结束')
    const c = data[pos]
    // 整数 i...e
    if (c === 0x69 /* 'i' */) {
      pos++
      const start = pos
      while (pos < data.length && data[pos] !== 0x65 /* 'e' */) pos++
      if (pos >= data.length) throw new Error('bencode: 整数未结束')
      const s = latin1.decode(data.subarray(start, pos))
      pos++
      return Number(s)
    }
    // 字节串 <len>:<bytes>
    if (c >= 0x30 && c <= 0x39) {
      const len = readNumber()
      if (pos + len > data.length) throw new Error('bencode: 字节串越界')
      const bytes = data.slice(pos, pos + len)
      pos += len
      return bytes
    }
    // 列表 l...e
    if (c === 0x6c /* 'l' */) {
      pos++
      const arr: BencodeValue[] = []
      while (pos < data.length && data[pos] !== 0x65) arr.push(parse())
      if (pos >= data.length) throw new Error('bencode: 列表未结束')
      pos++
      return arr
    }
    // 字典 d...e
    if (c === 0x64 /* 'd' */) {
      pos++
      const obj: { [key: string]: BencodeValue } = {}
      while (pos < data.length && data[pos] !== 0x65) {
        const keyBytes = parse()
        if (!(keyBytes instanceof Uint8Array)) throw new Error('bencode: 字典键非字节串')
        const key = utf8.decode(keyBytes)
        obj[key] = parse()
      }
      if (pos >= data.length) throw new Error('bencode: 字典未结束')
      pos++
      return obj
    }
    throw new Error(`bencode: 意外字符 0x${c.toString(16)}`)
  }

  const result = parse()
  if (pos !== data.length) throw new Error('bencode: 数据未完全解析')
  return result
}

// 下载生成的文件
export function downloadBytes(data: Uint8Array, filename: string): void {
  const blob = new Blob([data as unknown as BlobPart], { type: 'application/x-bittorrent' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
