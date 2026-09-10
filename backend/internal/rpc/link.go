package rpc

import "strings"

// ValidTorrentLink 校验「按链接添加种子」的 URL / 磁力链接 scheme。
// Transmission 的 torrent-add filename 参数原生支持本地路径：若不限制 scheme，
// 调用方可用它传任意本地路径，借 Transmission 进程权限绕过文件读取白名单，
// 同时也构成由 Transmission 发起的任意出网下载。REST 与 MCP 两个入口共用本函数，
// 避免只在一侧校验而留下绕过通道。
func ValidTorrentLink(link string) bool {
	l := strings.ToLower(strings.TrimSpace(link))
	return strings.HasPrefix(l, "http://") ||
		strings.HasPrefix(l, "https://") ||
		strings.HasPrefix(l, "magnet:")
}
