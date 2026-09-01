package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	trpc "github.com/hekmon/transmissionrpc/v3"
	"github.com/trpanel/backend/internal/models"
	"github.com/trpanel/backend/internal/rpc"
)

// getSession 获取会话配置
func (h *Handler) getSession(c *gin.Context) {
	sess, err := h.rpc.Client().GetSession(c.Request.Context())
	if err != nil {
		respondError(c, http.StatusBadGateway, "获取会话信息失败: "+err.Error())
		return
	}
	respond(c, sess)
}

// sessionStatus 连接状态检测
func (h *Handler) sessionStatus(c *gin.Context) {
	version, err := h.rpc.Client().Ping(c.Request.Context())
	if err != nil {
		// 该接口以 200 返回连接状态，绕过了 respondError 的统一脱敏，需自行抹掉错误里的凭据
		respond(c, models.SessionStatus{Connected: false, Error: rpc.SanitizeClientMsg(err.Error())})
		return
	}
	respond(c, models.SessionStatus{Connected: true, Version: version})
}

// portTest 测试端口是否开放
func (h *Handler) portTest(c *gin.Context) {
	open, err := h.rpc.Client().TestPort(c.Request.Context())
	if err != nil {
		respondError(c, http.StatusBadGateway, "端口测试失败: "+err.Error())
		return
	}
	respond(c, gin.H{"open": open})
}

// blocklistUpdate 更新 Blocklist 规则
func (h *Handler) blocklistUpdate(c *gin.Context) {
	entries, err := h.rpc.Client().UpdateBlocklist(c.Request.Context())
	if err != nil {
		respondError(c, http.StatusBadGateway, "更新 Blocklist 失败: "+err.Error())
		return
	}
	respond(c, gin.H{"entries": entries})
}

// systemCommand 系统命令（支持 shutdown / reboot）
func (h *Handler) systemCommand(c *gin.Context) {
	// 破坏性操作：默认配置（无 API_TOKEN）下 Auth 为空操作，而同源写守卫只挡浏览器跨站请求，
	// 局域网内任意 curl 都能停机。因此要求部署本身具备认证边界：启用了令牌鉴权，
	// 或经宿主网关统一认证（fnOS 网关模式）。
	if h.apiToken == "" && !h.plat.SecurityPolicy().AllowEmbedding {
		respondError(c, http.StatusForbidden, "系统命令需认证：请设置 API_TOKEN 启用令牌鉴权，或经宿主网关部署")
		return
	}
	action := c.Param("action")
	if action != "shutdown" && action != "reboot" {
		respondError(c, http.StatusBadRequest, "不支持的系统命令: "+action)
		return
	}
	if err := h.rpc.Client().SystemCommand(c.Request.Context(), action); err != nil {
		respondError(c, http.StatusBadGateway, "执行失败: "+err.Error())
		return
	}
	respond(c, gin.H{"action": action})
}

// sessionStats 获取会话统计（累计/当前）
func (h *Handler) sessionStats(c *gin.Context) {
	stats, err := h.rpc.Client().GetSessionStats(c.Request.Context())
	if err != nil {
		respondError(c, http.StatusBadGateway, "获取会话统计失败: "+err.Error())
		return
	}
	respond(c, stats)
}

// freeSpace 查询目录可用空间
func (h *Handler) freeSpace(c *gin.Context) {
	path := c.Query("path")
	if path == "" {
		respondError(c, http.StatusBadRequest, "缺少 path 参数")
		return
	}
	free, total, err := h.rpc.Client().GetFreeSpace(c.Request.Context(), path)
	if err != nil {
		respondError(c, http.StatusBadGateway, "查询失败: "+err.Error())
		return
	}
	respond(c, gin.H{"path": path, "freeSpace": free, "totalSize": total})
}

// setSession 更新会话配置
func (h *Handler) setSession(c *gin.Context) {
	var body struct {
		DownloadDir          *string  `json:"downloadDir"`
		SpeedLimitDown       *int64   `json:"speedLimitDown"`
		SpeedLimitDownOn     *bool    `json:"speedLimitDownOn"`
		SpeedLimitUp         *int64   `json:"speedLimitUp"`
		SpeedLimitUpOn       *bool    `json:"speedLimitUpOn"`
		AltSpeedDown         *int64   `json:"altSpeedDown"`
		AltSpeedUp           *int64   `json:"altSpeedUp"`
		AltSpeedEnabled      *bool    `json:"altSpeedEnabled"`
		StartAdded           *bool    `json:"startAdded"`
		PeerLimitGlobal      *int64   `json:"peerLimitGlobal"`
		PEXEnabled           *bool    `json:"pexEnabled"`
		DHTEnabled           *bool    `json:"dhtEnabled"`
		SeedRatioLimit       *float64 `json:"seedRatioLimit"`
		Encryption           *string  `json:"encryption"`
		DownloadQueueEnabled *bool    `json:"downloadQueueEnabled"`
		DownloadQueueSize    *int64   `json:"downloadQueueSize"`
		SeedQueueEnabled     *bool    `json:"seedQueueEnabled"`
		SeedQueueSize        *int64   `json:"seedQueueSize"`
		QueueStalledEnabled  *bool    `json:"queueStalledEnabled"`
		QueueStalledMinutes  *int64   `json:"queueStalledMinutes"`
		BlocklistEnabled      *bool    `json:"blocklistEnabled"`
		BlocklistURL          *string  `json:"blocklistUrl"`
		PortForwardingEnabled *bool    `json:"portForwardingEnabled"`
		IncompleteDir         *string  `json:"incompleteDir"`
		IncompleteDirEnabled  *bool    `json:"incompleteDirEnabled"`
		CacheSizeMB           *int64   `json:"cacheSizeMB"`
		AltSpeedTimeEnabled   *bool    `json:"altSpeedTimeEnabled"`
		AltSpeedTimeBegin     *int64   `json:"altSpeedTimeBegin"`
		AltSpeedTimeEnd       *int64   `json:"altSpeedTimeEnd"`
		AltSpeedTimeDay       *int64   `json:"altSpeedTimeDay"`
		ScriptTorrentAddedEnabled        *bool    `json:"scriptTorrentAddedEnabled"`
		ScriptTorrentAddedFilename       *string  `json:"scriptTorrentAddedFilename"`
		ScriptTorrentDoneEnabled         *bool    `json:"scriptTorrentDoneEnabled"`
		ScriptTorrentDoneFilename        *string  `json:"scriptTorrentDoneFilename"`
		ScriptTorrentDoneSeedingEnabled  *bool    `json:"scriptTorrentDoneSeedingEnabled"`
		ScriptTorrentDoneSeedingFilename *string  `json:"scriptTorrentDoneSeedingFilename"`
		DefaultTrackers                  []string `json:"defaultTrackers"`
		RenamePartialFiles               *bool    `json:"renamePartialFiles"`
		TrashOriginalTorrentFiles        *bool    `json:"trashOriginalTorrentFiles"`
		IdleSeedingLimitEnabled          *bool    `json:"idleSeedingLimitEnabled"`
		IdleSeedingLimit                 *int64   `json:"idleSeedingLimit"`
		PeerPort                         *int64   `json:"peerPort"`
		PeerPortRandomOnStart            *bool    `json:"peerPortRandomOnStart"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		respondError(c, http.StatusBadRequest, "请求体无效: "+err.Error())
		return
	}

	payload := trpc.SessionArguments{
		DownloadDir:           body.DownloadDir,
		SpeedLimitDown:        body.SpeedLimitDown,
		SpeedLimitDownEnabled: body.SpeedLimitDownOn,
		SpeedLimitUp:          body.SpeedLimitUp,
		SpeedLimitUpEnabled:   body.SpeedLimitUpOn,
		AltSpeedDown:          body.AltSpeedDown,
		AltSpeedUp:            body.AltSpeedUp,
		AltSpeedEnabled:       body.AltSpeedEnabled,
		StartAddedTorrents:    body.StartAdded,
		PeerLimitGlobal:       body.PeerLimitGlobal,
		PEXEnabled:            body.PEXEnabled,
		DHTEnabled:            body.DHTEnabled,
		SeedRatioLimit:        body.SeedRatioLimit,
		DownloadQueueEnabled:  body.DownloadQueueEnabled,
		DownloadQueueSize:     body.DownloadQueueSize,
		SeedQueueEnabled:      body.SeedQueueEnabled,
		SeedQueueSize:         body.SeedQueueSize,
		QueueStalledEnabled:   body.QueueStalledEnabled,
		QueueStalledMinutes:   body.QueueStalledMinutes,
		BlocklistEnabled:      body.BlocklistEnabled,
		BlocklistURL:          body.BlocklistURL,
		PortForwardingEnabled: body.PortForwardingEnabled,
		IncompleteDir:         body.IncompleteDir,
		IncompleteDirEnabled:  body.IncompleteDirEnabled,
		CacheSizeMB:           body.CacheSizeMB,
		AltSpeedTimeEnabled:   body.AltSpeedTimeEnabled,
		AltSpeedTimeBegin:     body.AltSpeedTimeBegin,
		AltSpeedTimeEnd:       body.AltSpeedTimeEnd,
		AltSpeedTimeDay:       body.AltSpeedTimeDay,
		ScriptTorrentAddedEnabled:        body.ScriptTorrentAddedEnabled,
		ScriptTorrentAddedFilename:       body.ScriptTorrentAddedFilename,
		ScriptTorrentDoneEnabled:         body.ScriptTorrentDoneEnabled,
		ScriptTorrentDoneFilename:        body.ScriptTorrentDoneFilename,
		ScriptTorrentDoneSeedingEnabled:  body.ScriptTorrentDoneSeedingEnabled,
		ScriptTorrentDoneSeedingFilename: body.ScriptTorrentDoneSeedingFilename,
		DefaultTrackers:                  body.DefaultTrackers,
		RenamePartialFiles:               body.RenamePartialFiles,
		TrashOriginalTorrentFiles:        body.TrashOriginalTorrentFiles,
		IdleSeedingLimitEnabled:          body.IdleSeedingLimitEnabled,
		IdleSeedingLimit:                 body.IdleSeedingLimit,
		PeerPort:                         body.PeerPort,
		PeerPortRandomOnStart:            body.PeerPortRandomOnStart,
	}
	if body.Encryption != nil {
		enc := trpc.Encryption(*body.Encryption)
		payload.Encryption = &enc
	}

	if err := h.rpc.Client().SetSession(c.Request.Context(), payload); err != nil {
		respondError(c, http.StatusBadGateway, "更新会话失败: "+err.Error())
		return
	}
	respond(c, gin.H{"updated": true})
}
