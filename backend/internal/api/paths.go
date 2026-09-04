package api

import "github.com/gin-gonic/gin"

// listPathMappings 返回「远端路径 → 本地路径」映射配置。
// 由 PATH_MAPPINGS 环境变量 / config.yaml 的 path_mappings 提供，
// 前端用于「打开所在文件夹」与「复制路径」时的展示转换（Transmission 与宿主
// 路径不一致的场景，如 Transmission 跑在容器内）。
func (h *Handler) listPathMappings(c *gin.Context) {
	respond(c, gin.H{"mappings": h.pathMappings})
}
