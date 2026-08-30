package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/trpanel/backend/internal/automove"
	"github.com/trpanel/backend/internal/config"
	"github.com/trpanel/backend/internal/middleware"
	"github.com/trpanel/backend/internal/models"
	"github.com/trpanel/backend/internal/platform"
	"github.com/trpanel/backend/internal/rpc"
	"github.com/trpanel/backend/internal/seedpolicy"
	"github.com/trpanel/backend/internal/state"
)

// Handler API 处理器
type Handler struct {
	rpc        *rpc.Manager
	hub        *Hub
	geo        *GeoService
	state      *state.Store
	automove   *automove.Service
	seedpolicy *seedpolicy.Service
	plat       platform.Platform
	dataDir    string
	apiToken   string
}

// NewHandler 创建处理器。
// plat 提供宿主平台能力：本地文件读取白名单、同源判定策略、宿主专属路由（如 fnOS 应用更新）。
func NewHandler(manager *rpc.Manager, hub *Hub, geo *GeoService, st *state.Store, moveSvc *automove.Service, policySvc *seedpolicy.Service, cfg *config.Config, plat platform.Platform) *Handler {
	return &Handler{
		rpc:        manager,
		hub:        hub,
		geo:        geo,
		state:      st,
		automove:   moveSvc,
		seedpolicy: policySvc,
		plat:       plat,
		dataDir:    cfg.DataDir,
		apiToken:   cfg.APIToken,
	}
}

// Register 注册所有路由。
// 身份认证默认交由宿主网关或反向代理承担，但本服务仍强制校验写请求的同源性
// （否则任意网页都能以「简单请求」直接增删种子），并在配置了 API_TOKEN 时启用令牌鉴权。
// prefix：网关部署时传入（如 /app/transmission），路由直接挂在带前缀路径下；
// Gin 在中间件执行前即按原始 URL.Path 匹配路由，故不能在中间件里改前缀。
func (h *Handler) Register(r *gin.Engine, prefix string) {
	guard := []gin.HandlerFunc{middleware.SameOriginWriteGuard(h.plat)}
	if h.apiToken != "" {
		guard = append(guard, middleware.Auth(h.apiToken))
	}
	api := r.Group(prefix+"/api", guard...)
	{
		// 种子
		api.GET("/torrents", h.listTorrents)
		api.GET("/torrents/sites", h.torrentSites)
		api.GET("/torrents/:id", h.getTorrent)
		api.POST("/torrents/add", h.addTorrent)
		api.POST("/torrents/add-batch", h.addTorrentBatch)
		api.POST("/torrents/replace-tracker", h.replaceTracker)
		api.POST("/torrents/:id/start", h.startTorrent)
		api.POST("/torrents/:id/start-now", h.startNowTorrent)
		api.POST("/torrents/:id/stop", h.stopTorrent)
		api.POST("/torrents/:id/verify", h.verifyTorrent)
		api.POST("/torrents/:id/reannounce", h.reannounceTorrent)
		api.POST("/torrents/:id/move", h.moveTorrent)
		api.POST("/torrents/:id/rename", h.renameTorrent)
		api.POST("/torrents/:id/queue", h.queueMove)
		api.PUT("/torrents/:id", h.updateTorrent)
		api.DELETE("/torrents/:id", h.deleteTorrent)
		// 批量
		api.POST("/torrents/start", h.startTorrents)
		api.POST("/torrents/start-now", h.startNowTorrents)
		api.POST("/torrents/stop", h.stopTorrents)
		api.POST("/torrents/move", h.moveTorrents)
		api.POST("/torrents/update", h.updateTorrents)
		api.DELETE("/torrents", h.deleteTorrents)
		// 全部操作
		api.POST("/torrents/start-all", h.startAllTorrents)
		api.POST("/torrents/pause-all", h.pauseAllTorrents)
		api.POST("/torrents/reannounce-all", h.reannounceAllTorrents)
		// 会话
		api.GET("/session", h.getSession)
		api.PUT("/session", h.setSession)
		api.GET("/session/status", h.sessionStatus)
		api.GET("/session/stats", h.sessionStats)
		api.GET("/session/port-test", h.portTest)
		api.POST("/session/blocklist/update", h.blocklistUpdate)
		api.GET("/session/free-space", h.freeSpace)
		// 连接配置（界面设置）
		api.GET("/settings", h.getSettings)
		api.PUT("/settings", h.updateSettings)
		// 多服务器管理
		api.GET("/servers", h.listServers)
		api.POST("/servers", h.saveServers)
		api.DELETE("/servers/:index", h.deleteServer)
		api.POST("/servers/switch", h.switchServer)
		// 自动文件管理
		api.GET("/automove", h.listAutoMoveRules)
		api.POST("/automove", h.saveAutoMoveRule)
		api.DELETE("/automove/:id", h.deleteAutoMoveRule)
		api.POST("/automove/run", h.runAutoMove)
		// 做种策略（按站点的分享率目标与达标动作）
		api.GET("/seedpolicy", h.listSeedPolicy)
		api.POST("/seedpolicy", h.saveSeedPolicyRule)
		api.DELETE("/seedpolicy/:id", h.deleteSeedPolicyRule)
		api.POST("/seedpolicy/guard", h.saveSeedPolicyGuard)
		api.POST("/seedpolicy/run", h.runSeedPolicy)
		api.POST("/seedpolicy/reset", h.resetSeedPolicy)
		api.POST("/seedpolicy/clear-logs", h.clearSeedPolicyLogs)
		// Peer 地理位置
		api.POST("/peers/geo", h.lookupPeers)
		// 系统命令
		api.POST("/system/:action", h.systemCommand)
	}
	// 宿主平台专属接口（如 fnOS 的应用更新；通用平台为空实现，不挂载任何路由）
	h.plat.RegisterRoutes(api)
	// WebSocket：浏览器无法为握手设置自定义请求头，令牌只能走 ?token=，
	// 因此这条路由单独使用允许查询参数的鉴权（普通 API 只认请求头）。
	wsGuard := []gin.HandlerFunc{}
	if h.apiToken != "" {
		wsGuard = append(wsGuard, middleware.AuthAllowQuery(h.apiToken))
	}
	r.GET(prefix+"/ws", append(wsGuard, h.hub.HandleWS)...)
}

// respond 成功响应
func respond(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, models.OK(data))
}

// respondError 失败响应。
// 统一经 sanitizeClientMsg 处理：上游 RPC 错误可能内嵌带凭据的地址，不做脱敏即等于泄露密码。
func respondError(c *gin.Context, status int, msg string) {
	c.JSON(status, models.Error(sanitizeClientMsg(msg)))
}
