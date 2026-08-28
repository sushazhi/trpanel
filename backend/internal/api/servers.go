package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/transmission-manager/backend/internal/config"
	"github.com/transmission-manager/backend/internal/state"
)

// listServers 获取服务器列表（脱敏密码）
func (h *Handler) listServers(c *gin.Context) {
	st := h.state.Get()
	out := make([]map[string]any, 0, len(st.Servers))
	for i, s := range st.Servers {
		out = append(out, map[string]any{
			"index":   i,
			"name":    s.Name,
			"url":     s.URL,
			"user":    s.User,
			"hasPass": s.Pass != "",
			"enabled": s.Enabled,
		})
	}
	respond(c, gin.H{"servers": out, "activeServer": st.ActiveServer})
}

// saveServers 全量保存服务器列表
func (h *Handler) saveServers(c *gin.Context) {
	var body struct {
		Servers []state.Server `json:"servers"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		respondError(c, http.StatusBadRequest, "请求体无效: "+err.Error())
		return
	}
	for i := range body.Servers {
		if body.Servers[i].URL == "" {
			respondError(c, http.StatusBadRequest, "服务器地址不能为空")
			return
		}
	}
	err := h.state.Update(func(st *state.State) {
		// 列表接口不返回密码（仅返回 hasPass），因此前端全量回传时 Pass 为空。
		// 约定：地址未变且 Pass 为空 = 保持原密码不变，避免静默清空凭据。
		for i := range body.Servers {
			if body.Servers[i].Pass != "" {
				continue
			}
			if i < len(st.Servers) && st.Servers[i].URL == body.Servers[i].URL {
				body.Servers[i].Pass = st.Servers[i].Pass
			}
		}
		st.Servers = body.Servers
		if st.ActiveServer >= len(st.Servers) {
			st.ActiveServer = 0
		}
	})
	if err != nil {
		respondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	respond(c, gin.H{"updated": true})
}

// deleteServer 删除指定服务器
func (h *Handler) deleteServer(c *gin.Context) {
	idx, err := strconv.Atoi(c.Param("index"))
	if err != nil {
		respondError(c, http.StatusBadRequest, "无效的服务器索引")
		return
	}
	var deleted bool
	_ = h.state.Update(func(st *state.State) {
		if idx < 0 || idx >= len(st.Servers) {
			return
		}
		st.Servers = append(st.Servers[:idx], st.Servers[idx+1:]...)
		if st.ActiveServer == idx {
			st.ActiveServer = 0
		} else if st.ActiveServer > idx {
			st.ActiveServer--
		}
		deleted = true
	})
	if !deleted {
		respondError(c, http.StatusBadRequest, "服务器不存在")
		return
	}
	respond(c, gin.H{"deleted": true})
}

// switchServer 切换到指定服务器（测试连通后热更新并持久化）
func (h *Handler) switchServer(c *gin.Context) {
	var body struct {
		Index int `json:"index"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		respondError(c, http.StatusBadRequest, "请求体无效: "+err.Error())
		return
	}
	st := h.state.Get()
	if body.Index < 0 || body.Index >= len(st.Servers) {
		respondError(c, http.StatusBadRequest, "服务器不存在")
		return
	}
	srv := st.Servers[body.Index]
	if !srv.Enabled {
		respondError(c, http.StatusBadRequest, "该服务器未启用")
		return
	}
	// 记录当前配置以便失败回滚
	oldURL, oldUser, oldPass := h.rpc.Credentials()

	// 热更新客户端
	if err := h.rpc.Reconfigure(srv.URL, srv.User, srv.Pass); err != nil {
		respondError(c, http.StatusBadGateway, "切换失败: "+err.Error())
		return
	}
	// 测试连通性
	version, err := h.rpc.Client().Ping(c.Request.Context())
	if err != nil {
		_ = h.rpc.Reconfigure(oldURL, oldUser, oldPass)
		respondError(c, http.StatusBadGateway, "无法连接该服务器，已回滚: "+err.Error())
		return
	}
	// 持久化
	_ = h.state.Update(func(st2 *state.State) { st2.ActiveServer = body.Index })
	_ = config.SaveConnection(h.dataDir, srv.URL, srv.User, srv.Pass, h.hub.getPollInterval().String())
	// 切换后立即触发一次拉取
	h.hub.Bump()
	respond(c, gin.H{"index": body.Index, "version": version})
}
