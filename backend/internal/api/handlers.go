package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/transmission-manager/backend/internal/automove"
	"github.com/transmission-manager/backend/internal/models"
	"github.com/transmission-manager/backend/internal/rpc"
	"github.com/transmission-manager/backend/internal/rss"
	"github.com/transmission-manager/backend/internal/state"
)

// Handler API 处理器
type Handler struct {
	rpc      *rpc.Manager
	hub      *Hub
	geo      *GeoService
	state    *state.Store
	rss      *rss.Service
	automove *automove.Service
	dataDir  string
}

// NewHandler 创建处理器
func NewHandler(manager *rpc.Manager, hub *Hub, geo *GeoService, st *state.Store, rssSvc *rss.Service, moveSvc *automove.Service, dataDir string) *Handler {
	return &Handler{rpc: manager, hub: hub, geo: geo, state: st, rss: rssSvc, automove: moveSvc, dataDir: dataDir}
}

// Register 注册所有路由（本服务不做鉴权，访问控制交由飞牛统一认证/反向代理）
func (h *Handler) Register(r *gin.Engine) {
	api := r.Group("/api")
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
		// RSS 订阅
		api.GET("/rss", h.listRSSFeeds)
		api.POST("/rss", h.saveRSSFeed)
		api.DELETE("/rss/:id", h.deleteRSSFeed)
		api.POST("/rss/:id/fetch", h.fetchRSS)
		// 自动文件管理
		api.GET("/automove", h.listAutoMoveRules)
		api.POST("/automove", h.saveAutoMoveRule)
		api.DELETE("/automove/:id", h.deleteAutoMoveRule)
		api.POST("/automove/run", h.runAutoMove)
		// Peer 地理位置
		api.POST("/peers/geo", h.lookupPeers)
		// 系统命令
		api.POST("/system/:action", h.systemCommand)
	}
	// WebSocket
	r.GET("/ws", h.hub.HandleWS)
}

// respond 成功响应
func respond(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, models.OK(data))
}

// respondError 失败响应
func respondError(c *gin.Context, status int, msg string) {
	c.JSON(status, models.Error(msg))
}
