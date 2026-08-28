package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/transmission-manager/backend/internal/config"
	"github.com/transmission-manager/backend/internal/rpc"
)

// getSettings 获取当前连接配置（不返回明文密码）
func (h *Handler) getSettings(c *gin.Context) {
	url, user, _ := h.rpc.Credentials()
	respond(c, gin.H{"url": url, "user": user, "pollInterval": h.hub.getPollInterval().String()})
}

// updateSettings 更新连接配置（测试连通后保存并热更新）
func (h *Handler) updateSettings(c *gin.Context) {
	var body struct {
		URL          string `json:"url"`
		User         string `json:"user"`
		Pass         string `json:"pass"`
		PollInterval string `json:"pollInterval"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		respondError(c, http.StatusBadRequest, "请求体无效: "+err.Error())
		return
	}
	if body.URL == "" {
		respondError(c, http.StatusBadRequest, "Transmission 地址不能为空")
		return
	}

	// 密码未提供时沿用现有凭据：前端出于安全不回显明文密码，
	// 未修改密码直接保存时 body.Pass 为空，若用它重新探测会导致 502 认证失败
	if body.Pass == "" {
		_, _, body.Pass = h.rpc.Credentials()
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

	// 持久化到数据目录的 .env.local
	if err := config.SaveConnection(h.dataDir, body.URL, body.User, body.Pass, body.PollInterval); err != nil {
		respondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	// 热更新轮询间隔
	if pollInterval > 0 {
		h.hub.SetPollInterval(pollInterval)
	}
	respond(c, gin.H{"updated": true})
}
