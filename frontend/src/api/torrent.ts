import { client, request } from './client'
import type { AutoMoveRule, RSSFeed, ServerInfo, Session, SessionStats, SessionStatus, Torrent } from '@/types'

// 种子相关接口
export const torrentApi = {
  // 获取种子列表
  list: () => request<Torrent[]>(client.get('/torrents')),
  // 获取每个种子的 Tracker 站点（站点过滤）
  sites: () => request<Record<number, string[]>>(client.get('/torrents/sites')),
  // 获取种子详情（含文件/Peers/Trackers）
  detail: (id: number) => request<Torrent>(client.get(`/torrents/${id}`)),
  // 添加种子（文件；filesWanted/filesUnwanted 为文件索引，不传=全部下载）
  addFile: (file: File, downloadDir?: string, paused = false, labels?: string[], priority?: number, verify = false, filesWanted?: number[], filesUnwanted?: number[]) => {
    const form = new FormData()
    form.append('file', file)
    if (downloadDir) form.append('downloadDir', downloadDir)
    if (paused) form.append('paused', 'true')
    if (verify) form.append('verify', 'true')
    if (labels?.length) form.append('labels', labels.join(','))
    if (priority != null) form.append('bandwidthPriority', String(priority))
    if (filesWanted?.length) form.append('filesWanted', JSON.stringify(filesWanted))
    if (filesUnwanted?.length) form.append('filesUnwanted', JSON.stringify(filesUnwanted))
    return request<{ id: number }>(client.post('/torrents/add', form))
  },
  // 添加种子（URL/磁力链接）
  addUrl: (url: string, downloadDir?: string, paused = false, labels?: string[], priority?: number, verify = false) =>
    request<{ id: number }>(client.post('/torrents/add', { url, downloadDir, paused, verify, labels, bandwidthPriority: priority })),
  // 批量添加多个URL/磁力链接
  addUrls: (urls: string[], downloadDir?: string, paused = false, labels?: string[], priority?: number, verify = false) =>
    request<{ ids: number[] }>(client.post('/torrents/add-batch', { urls, downloadDir, paused, verify, labels, bandwidthPriority: priority })),
  // 启动/强制启动/暂停/校验/重新宣告
  start: (id: number) => request(client.post(`/torrents/${id}/start`)),
  startNow: (id: number) => request(client.post(`/torrents/${id}/start-now`)),
  stop: (id: number) => request(client.post(`/torrents/${id}/stop`)),
  verify: (id: number) => request(client.post(`/torrents/${id}/verify`)),
  reannounce: (id: number) => request(client.post(`/torrents/${id}/reannounce`)),
  // 修改属性
  update: (id: number, body: Record<string, unknown>) => request(client.put(`/torrents/${id}`, body)),
  // 移动下载位置
  move: (id: number, location: string, move = true) =>
    request(client.post(`/torrents/${id}/move`, { location, move })),
  // 重命名文件/目录
  rename: (id: number, path: string, name: string) =>
    request(client.post(`/torrents/${id}/rename`, { path, name })),
  // 队列移动
  queue: (id: number, direction: 'top' | 'up' | 'down' | 'bottom') =>
    request(client.post(`/torrents/${id}/queue`, { direction })),
  // 删除
  remove: (id: number, deleteData = false) =>
    request(client.delete(`/torrents/${id}`, { params: { deleteData } })),
  // 批量操作
  startMany: (ids: number[]) => request(client.post('/torrents/start', { ids })),
  startNowMany: (ids: number[]) => request(client.post('/torrents/start-now', { ids })),
  stopMany: (ids: number[]) => request(client.post('/torrents/stop', { ids })),
  // 批量启动/暂停所有种子
  startAll: () => request(client.post('/torrents/start-all')),
  pauseAll: () => request(client.post('/torrents/pause-all')),
  reannounceAll: () => request(client.post('/torrents/reannounce-all')),
  moveMany: (ids: number[], location: string, move = true) =>
    request(client.post('/torrents/move', { ids, location, move })),
  updateMany: (ids: number[], body: Record<string, unknown>) =>
    request(client.post('/torrents/update', { ids, ...body })),
  removeMany: (ids: number[], deleteData = false) =>
    request(client.delete('/torrents', { data: { ids, deleteData } })),
  // Peer 地理位置查询（批量）
  peersGeo: (ips: string[]) =>
    request<Record<string, { country: string; city: string }>>(client.post('/peers/geo', { ips })),
}

// 系统命令
export const systemApi = {
  command: (action: 'shutdown' | 'reboot') => request(client.post(`/system/${action}`)),
}

// 会话相关接口
export const sessionApi = {
  get: () => request<Session>(client.get('/session')),
  update: (body: Record<string, unknown>) => request(client.put('/session', body)),
  status: () => request<SessionStatus>(client.get('/session/status')),
  stats: () => request<SessionStats>(client.get('/session/stats')),
  portTest: () => request<{ open: boolean }>(client.get('/session/port-test')),
  blocklistUpdate: () => request<{ entries: number }>(client.post('/session/blocklist/update')),
  freeSpace: (path: string) =>
    request<{ path: string; freeSpace: number; totalSize: number }>(client.get('/session/free-space', { params: { path } })),
}

// 多服务器管理
export const serverApi = {
  list: () => request<{ servers: ServerInfo[]; activeServer: number }>(client.get('/servers')),
  save: (servers: ServerInfo[]) => request(client.post('/servers', { servers })),
  remove: (index: number) => request(client.delete(`/servers/${index}`)),
  switch: (index: number) => request<{ index: number; version: string }>(client.post('/servers/switch', { index })),
}

// RSS 订阅
export const rssApi = {
  list: () => request<{ feeds: RSSFeed[] }>(client.get('/rss')),
  save: (feed: RSSFeed) => request<{ id: string }>(client.post('/rss', feed)),
  remove: (id: string) => request(client.delete(`/rss/${id}`)),
  fetch: (id: string) => request(client.post(`/rss/${id}/fetch`)),
}

// 自动文件管理
export const autoMoveApi = {
  list: () => request<{ rules: AutoMoveRule[] }>(client.get('/automove')),
  save: (rule: AutoMoveRule) => request<{ id: string }>(client.post('/automove', rule)),
  remove: (id: string) => request(client.delete(`/automove/${id}`)),
  run: () => request(client.post('/automove/run')),
}
