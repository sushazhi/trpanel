package fnos

import (
	"log/slog"
	"strings"

	"github.com/gin-gonic/gin"
)

// 语义路径展示：把 Transmission 报上来的内部路径转成宿主展示路径。
// 展示属增强能力，任何失败都按「不可用」返回空映射，前端静默回退原始路径，不让 UI 报错。
type pathHandler struct {
	tc *trimPathClient
}

type semanticReq struct {
	Paths    []string `json:"paths"`
	Language string   `json:"language"`
}

const semanticMaxPaths = 256

// normalizeLanguage 前端界面语言（'zh'|'en'）归一化为宿主 locale
func normalizeLanguage(lang string) string {
	switch strings.TrimSpace(strings.ToLower(lang)) {
	case "en", "en-us":
		return "en-US"
	default:
		return "zh-CN"
	}
}

func (h *pathHandler) convert(c *gin.Context) {
	var body semanticReq
	if err := c.ShouldBindJSON(&body); err != nil {
		respond(c, gin.H{"available": false, "map": gin.H{}})
		return
	}
	if len(body.Paths) > semanticMaxPaths {
		body.Paths = body.Paths[:semanticMaxPaths]
	}
	m, err := h.tc.Convert(c.Request.Context(), body.Paths, normalizeLanguage(body.Language))
	if err != nil {
		slog.Warn("语义路径转换不可用", "err", err)
		respond(c, gin.H{"available": false, "map": gin.H{}})
		return
	}
	respond(c, gin.H{"available": true, "map": m})
}
