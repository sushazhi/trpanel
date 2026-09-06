package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/trpanel/backend/internal/config"
	"github.com/trpanel/backend/internal/rpc"
)

// getSettings 获取当前连接配置（不返回明文密码）与 MCP 服务开关。
// MCP 接入令牌明文返回：它只用于外部 AI 客户端接入（能力面小于管理口令），
// 且用户需要复制到 AI 客户端配置里，不回显就无法接入
func (h *Handler) getSettings(c *gin.Context) {
	url, user, _ := h.rpc.Credentials()
	var mcpToken string
	if t := h.mcp.Token.Load(); t != nil {
		mcpToken = *t
	}
	// "0" 与空等价（不启用直连端口），统一按空回显，避免前端把它当有效端口拼地址
	mcpPort := h.mcpPort
	if mcpPort == "0" {
		mcpPort = ""
	}
	respond(c, gin.H{
		"url":               url,
		"user":              user,
		"pollInterval":      h.hub.getPollInterval().String(),
		"mcpEnabled":        h.mcp.Enabled.Load(),
		"mcpAllowDelete":    h.mcp.AllowDelete.Load(),
		"mcpAllowDangerous": h.mcp.AllowDangerous.Load(),
		"mcpToken":          mcpToken,
		"mcpPort":           mcpPort,
	})
}

// updateSettings 更新设置：连接配置（带 URL 时）与 MCP 开关（提供字段时）可分别提交，
// 持久化统一合并当前生效值整文件写入 .env.local，两类设置互不覆盖
func (h *Handler) updateSettings(c *gin.Context) {
	var body struct {
		URL               string  `json:"url"`
		User              string  `json:"user"`
		Pass              string  `json:"pass"`
		PollInterval      string  `json:"pollInterval"`
		MCPEnabled        *bool   `json:"mcpEnabled"`
		MCPAllowDelete    *bool   `json:"mcpAllowDelete"`
		MCPAllowDangerous *bool   `json:"mcpAllowDangerous"`
		MCPToken          *string `json:"mcpToken"`
		MCPPort           *string `json:"mcpPort"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		respondError(c, http.StatusBadRequest, "请求体无效: "+err.Error())
		return
	}
	if body.URL == "" && body.MCPEnabled == nil && body.MCPAllowDelete == nil && body.MCPAllowDangerous == nil && body.MCPToken == nil && body.MCPPort == nil {
		respondError(c, http.StatusBadRequest, "没有要保存的设置")
		return
	}
	if body.MCPToken != nil {
		*body.MCPToken = strings.TrimSpace(*body.MCPToken)
		if err := config.ValidateEnvValue("接入令牌", *body.MCPToken); err != nil {
			respondError(c, http.StatusBadRequest, err.Error())
			return
		}
	}
	if body.MCPPort != nil {
		*body.MCPPort = strings.TrimSpace(*body.MCPPort)
		if *body.MCPPort != "" {
			if p, err := strconv.Atoi(*body.MCPPort); err != nil || p < 1 || p > 65535 {
				respondError(c, http.StatusBadRequest, "MCP 直连端口必须是 1-65535 的端口号")
				return
			}
		}
	}

	if body.URL != "" {
		// 这些值会以 KEY=value 写入 .env.local 并被按行解析，含换行即等于注入新的配置键
		for _, f := range []struct{ name, value string }{
			{"地址", body.URL}, {"用户名", body.User}, {"密码", body.Pass},
		} {
			if err := config.ValidateEnvValue(f.name, f.value); err != nil {
				respondError(c, http.StatusBadRequest, err.Error())
				return
			}
		}
	}

	// 校验轮询间隔（可选）
	var pollInterval time.Duration
	if body.PollInterval != "" {
		d, err := time.ParseDuration(body.PollInterval)
		if err != nil || d < 500*time.Millisecond {
			respondError(c, http.StatusBadRequest, "轮询间隔格式无效（如 2s，最小 0.5s）")
			return
		}
		pollInterval = d
	}

	if body.URL != "" {
		// 密码未提供时沿用现有凭据：前端出于安全不回显明文密码，
		// 未修改密码直接保存时 body.Pass 为空，若用它重新探测会导致 502 认证失败
		if body.Pass == "" {
			_, _, body.Pass = h.rpc.Credentials()
		}

		// 先测试新配置连通性
		probe, err := rpc.New(body.URL, body.User, body.Pass)
		if err != nil {
			respondError(c, http.StatusBadRequest, "配置无效: "+err.Error())
			return
		}
		if _, err := probe.Ping(c.Request.Context()); err != nil {
			respondError(c, http.StatusBadGateway, "无法连接 Transmission: "+err.Error())
			return
		}

		// 先热更新运行中的客户端（内存切换成功后再持久化，避免 .env.local 与内存不一致）
		if err := h.rpc.Reconfigure(body.URL, body.User, body.Pass); err != nil {
			respondError(c, http.StatusInternalServerError, err.Error())
			return
		}
	}

	// 热更新轮询间隔
	if pollInterval > 0 {
		h.hub.SetPollInterval(pollInterval)
	}

	// MCP 开关：指针区分「未提交」与 false，切换即时生效
	if body.MCPEnabled != nil {
		h.mcp.Enabled.Store(*body.MCPEnabled)
	}
	if body.MCPAllowDelete != nil {
		h.mcp.AllowDelete.Store(*body.MCPAllowDelete)
	}
	if body.MCPAllowDangerous != nil {
		h.mcp.AllowDangerous.Store(*body.MCPAllowDangerous)
	}
	if body.MCPToken != nil {
		if *body.MCPToken == "" {
			h.mcp.Token.Store(nil)
		} else {
			t := *body.MCPToken
			h.mcp.Token.Store(&t)
		}
	}
	// 端口无法热应用（监听器随进程启动绑定），仅更新内存值供回显，重启后生效
	if body.MCPPort != nil {
		h.mcpPort = *body.MCPPort
	}

	// 持久化到数据目录的 .env.local：未提交的类目沿用当前生效值
	url, user, pass := body.URL, body.User, body.Pass
	if url == "" {
		url, user, pass = h.rpc.Credentials()
	}
	pollStr := body.PollInterval
	if pollStr == "" {
		pollStr = h.hub.getPollInterval().String()
	}
	var mcpToken string
	if t := h.mcp.Token.Load(); t != nil {
		mcpToken = *t
	}
	if err := config.SaveLocalSettings(h.dataDir, config.LocalSettings{
		TransmissionURL:   url,
		User:              user,
		Pass:              pass,
		PollInterval:      pollStr,
		MCPEnabled:        h.mcp.Enabled.Load(),
		MCPAllowDelete:    h.mcp.AllowDelete.Load(),
		MCPAllowDangerous: h.mcp.AllowDangerous.Load(),
		MCPToken:          mcpToken,
		MCPPort:           h.mcpPort,
	}); err != nil {
		respondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	respond(c, gin.H{"updated": true})
}
