package main

import (
	"context"
	"io/fs"
	"log/slog"
	"mime"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	static "github.com/transmission-manager/backend"
	"github.com/transmission-manager/backend/internal/api"
	"github.com/transmission-manager/backend/internal/automove"
	"github.com/transmission-manager/backend/internal/config"
	"github.com/transmission-manager/backend/internal/middleware"
	"github.com/transmission-manager/backend/internal/rpc"
	"github.com/transmission-manager/backend/internal/rss"
	"github.com/transmission-manager/backend/internal/state"
)

func main() {
	// 加载配置
	cfg, err := config.Load()
	if err != nil {
		slog.Error("加载配置失败", "err", err)
		os.Exit(1)
	}

	// 创建 RPC 管理器（支持运行期热更新连接）
	manager, err := rpc.NewManager(cfg.TransmissionURL, cfg.User, cfg.Password)
	if err != nil {
		slog.Error("初始化 Transmission 客户端失败", "err", err)
		os.Exit(1)
	}

	ctx, cancelCtx := context.WithCancel(context.Background())
	defer cancelCtx()

	// 启动时检测连接
	if version, err := manager.Client().Ping(ctx); err != nil {
		slog.Warn("Transmission 连接失败，请检查 TR_URL/TR_USER/TR_PASS", "err", err)
	} else {
		slog.Info("已连接 Transmission", "version", version)
	}

	// Gin 引擎
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(gin.Recovery(), middleware.Logger(), middleware.SecurityHeaders(), middleware.CORS())

	// GeoIP 服务（mmdb 文件缺失时自动降级为空查询）
	geo := api.NewGeoService("mmdb/GeoLite2-City.mmdb")

	// 持久化状态（多服务器/RSS/自动文件管理）
	store, err := state.Load(state.DefaultStatePath(cfg.DataDir))
	if err != nil {
		slog.Error("加载状态文件失败", "err", err)
		os.Exit(1)
	}

	// 注册 API 与 WebSocket
	hub := api.NewHub(manager, cfg.PollInterval)
	rssSvc := rss.New(manager, store)
	moveSvc := automove.New(manager, store)
	handler := api.NewHandler(manager, hub, geo, store, rssSvc, moveSvc, cfg.DataDir)
	handler.Register(r)
	hub.Start(ctx)
	go rssSvc.Run(ctx)
	go moveSvc.Run(ctx)

	// 内嵌前端静态资源（SPA）
	serveStatic(r)

	// HTTP 服务
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("HTTP 服务启动失败", "err", err)
			os.Exit(1)
		}
	}()
	slog.Info("服务已启动", "addr", srv.Addr)

	// 优雅退出
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	slog.Info("正在关闭服务...")
	// 通知后台任务停止（WS 轮询 / RSS 订阅 / 自动文件管理）
	cancelCtx()
	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelShutdown()
	_ = srv.Shutdown(shutdownCtx)
}

// serveStatic 通过 embed 提供前端静态文件，并支持 SPA 路由回退
func serveStatic(r *gin.Engine) {
	sub, err := fs.Sub(static.StaticFiles, "web/dist")
	if err != nil {
		slog.Error("内嵌静态资源加载失败", "err", err)
		return
	}
	index, err := fs.ReadFile(sub, "index.html")
	if err != nil {
		slog.Error("读取 index.html 失败", "err", err)
		return
	}
	r.NoRoute(func(c *gin.Context) {
		// API 未命中返回 JSON 404（避免前端拿到 HTML 造成解析错误）
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "接口不存在"})
			return
		}
		path := strings.TrimPrefix(c.Request.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		if data, err := fs.ReadFile(sub, path); err == nil {
			ct := mime.TypeByExtension(filepath.Ext(path))
			if strings.HasSuffix(path, ".webmanifest") {
				ct = "application/manifest+json; charset=utf-8"
			} else if ct == "" {
				ct = "application/octet-stream"
			}
			c.Data(http.StatusOK, ct, data)
			return
		}
		// SPA 路由回退
		c.Data(http.StatusOK, "text/html; charset=utf-8", index)
	})
}
