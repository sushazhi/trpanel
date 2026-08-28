// 种子文件信息
export interface FileInfo {
  bytesCompleted: number
  length: number
  name: string
}

// 种子文件统计
export interface FileStat {
  bytesCompleted: number
  wanted: boolean
  priority: number
}

// Tracker 基础信息
export interface Tracker {
  announce: string
  id: number
  scrape: string
  sitename: string
  tier: number
}

// Tracker 状态
export interface TrackerStat {
  id: number
  host: string
  announce: string
  announceState: number
  tier: number
  isBackup: boolean
  lastAnnounceResult: string
  lastAnnounceSucceeded: boolean
  lastAnnounceTimedOut: boolean
  lastAnnounceTime: number
  lastAnnouncePeerCount: number
  nextAnnounceTime: number
  scrapeState: number
  lastScrapeResult: string
  lastScrapeSucceeded: boolean
  lastScrapeTime: number
  nextScrapeTime: number
  seederCount: number
  leecherCount: number
  downloadCount: number
}

// Peer 信息
export interface Peer {
  address: string
  clientName: string
  flagStr: string
  progress: number
  rateToClient: number
  rateToPeer: number
  isDownloadingFrom: boolean
  isUploadingTo: boolean
  isEncrypted: boolean
  isIncoming: boolean
  isUTP: boolean
  port: number
}

// 种子数据
export interface Torrent {
  id: number
  name: string
  hashString: string
  creator: string
  totalSize: number
  sizeWhenDone: number
  percentDone: number
  status: number
  rateDownload: number
  rateUpload: number
  eta: number
  uploadedEver: number
  downloadedEver: number
  uploadRatio: number
  secondsSeeding: number
  error: number
  errorString: string
  labels: string[]
  queuePosition: number
  peersConnected: number
  peersSendingToUs: number
  peersGettingFromUs: number
  downloadDir: string
  addedDate: number
  doneDate: number
  activityDate: number
  isFinished: boolean
  isStalled: boolean
  isPrivate: boolean
  magnetLink: string
  fileCount: number
  haveValid: number
  haveUnchecked: number
  leftUntilDone: number
  comment: string
  peerLimit: number
  seedIdleLimit: number
  seedIdleMode: number
  seedRatioLimit: number
  seedRatioMode: number
  bandwidthPriority: number
  sequentialDownload: boolean
  honorsSessionLimits: boolean
  downloadLimited: boolean
  downloadLimit: number
  uploadLimited: boolean
  uploadLimit: number
  files?: FileInfo[]
  fileStats?: FileStat[]
  trackers?: Tracker[]
  trackerStats?: TrackerStat[]
  peers?: Peer[]
  // 块位图（详情接口返回，base64 编码）
  pieces?: string
  pieceCount?: number
  pieceSize?: number
}

// 会话信息
export interface Session {
  version: string
  rpcVersion: number
  downloadDir: string
  speedLimitDown: number
  speedLimitDownOn: boolean
  speedLimitUp: number
  speedLimitUpOn: boolean
  altSpeedDown: number
  altSpeedUp: number
  altSpeedEnabled: boolean
  peerLimitGlobal: number
  peerPort: number
  peerPortRandomOnStart: boolean
  pexEnabled: boolean
  dhtEnabled: boolean
  lpdEnabled: boolean
  utpEnabled: boolean
  encryption: string
  seedRatioLimit: number
  startAdded: boolean
  incompleteDir: string
  downloadQueueSize: number
  downloadQueueEnabled: boolean
  seedQueueSize: number
  seedQueueEnabled: boolean
  queueStalledEnabled: boolean
  queueStalledMinutes: number
  blocklistEnabled: boolean
  blocklistUrl: string
  blocklistSize: number
  portForwardingEnabled: boolean
  incompleteDirEnabled: boolean
  cacheSizeMB: number
  altSpeedTimeEnabled: boolean
  altSpeedTimeBegin: number
  altSpeedTimeEnd: number
  altSpeedTimeDay: number
  scriptTorrentAddedEnabled: boolean
  scriptTorrentAddedFilename: string
  scriptTorrentDoneEnabled: boolean
  scriptTorrentDoneFilename: string
  scriptTorrentDoneSeedingEnabled: boolean
  scriptTorrentDoneSeedingFilename: string
  defaultTrackers: string[]
  renamePartialFiles: boolean
  trashOriginalTorrentFiles: boolean
  idleSeedingLimitEnabled: boolean
  idleSeedingLimit: number
}

// 连接状态
export interface SessionStatus {
  connected: boolean
  version?: string
  error?: string
}

// 会话统计
export interface SessionStats {
  activeTorrentCount: number
  downloadSpeed: number
  pausedTorrentCount: number
  torrentCount: number
  uploadSpeed: number
  cumulative: SessionStatsDetails
  current: SessionStatsDetails
}

export interface SessionStatsDetails {
  downloadedBytes: number
  filesAdded: number
  secondsActive: number
  sessionCount: number
  uploadedBytes: number
}

// 统一 API 响应
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

// WebSocket 消息
export interface WsMessage {
  type: 'full' | 'update' | 'ping'
  data: Torrent[]
  timestamp: number
}

// 表格列配置
export interface ColumnConfig {
  key: string
  label: string
  visible: boolean
  width?: number
}

// 过滤选项
export interface FilterOptions {
  status: string[]
  labels: string[]
  sites: string[]
  downloadDirs: string[]
  error: string[]
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

// 多服务器
export interface ServerInfo {
  index?: number
  name: string
  url: string
  user: string
  pass?: string
  hasPass?: boolean
  enabled: boolean
}

// RSS 订阅源
export interface RSSFeed {
  id: string
  name: string
  url: string
  intervalMin: number
  enabled: boolean
  downloadDir: string
  labels: string[]
  paused: boolean
  minSizeMB: number
  maxSizeMB: number
  keywords: string[]
  excludeWords: string[]
  includeRegex: string
  excludeRegex: string
  lastFetchAt: number
  lastError: string
  processed: number
}

// 自动文件管理规则
export interface AutoMoveRule {
  id: string
  name: string
  enabled: boolean
  sites: string[]
  labels: string[]
  nameMatch: string
  targetDir: string
}
