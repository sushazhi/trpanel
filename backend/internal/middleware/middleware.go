package middleware

import (
	"crypto/subtle"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/transmission-manager/backend/internal/platform"
)

// respondForbidden 拒绝跨站/未授权写操作
func respondForbidden(c *gin.Context, status int, msg string) {
	c.AbortWithStatusJSON(status, gin.H{"code": 1, "message": msg})
}

// CORS 跨域中间件：仅放行同站来源与平台白名单中的开发前端源，
// 且不携带凭证，杜绝任意网站跨域读取响应。
func CORS(p platform.Platform) gin.HandlerFunc {
	pol := p.SecurityPolicy()
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && pol.IsSameSiteOrigin(c.Request, origin) {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Auth-Token")
			c.Header("Access-Control-Max-Age", "86400")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

// SameOriginWriteGuard 跨站写请求防护。
// 本服务对 API 不做凭证校验，而 multipart 表单提交属于 CORS「简单请求」（不触发预检），
// 任意网页都能直接对端口发起添加/删除种子的请求；因此要求浏览器侧 Origin 指向本机。
// 无 Origin 的非浏览器客户端（curl、脚本）不受影响，但若浏览器上报了跨站 Sec-Fetch-Site 则拒绝。
func SameOriginWriteGuard(p platform.Platform) gin.HandlerFunc {
	pol := p.SecurityPolicy()
	return func(c *gin.Context) {
		switch c.Request.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			c.Next()
			return
		}
		// 网关模式：宿主统一认证 + 服务仅本机 socket/回环可达，信任网关转发，
		// 只保留浏览器侧的 Sec-Fetch-Site 跨站标记校验；直连部署保持严格同源比对。
		// 若不放开，网关改写的 Host / 缺失的 X-Forwarded-Host 会让所有写请求误判跨域而 403。
		if pol.AllowEmbedding {
			if site := c.GetHeader("Sec-Fetch-Site"); site == "cross-site" {
				respondForbidden(c, http.StatusForbidden, "跨站请求已被拒绝（Sec-Fetch-Site: cross-site）")
				return
			}
			c.Next()
			return
		}
		origin := c.GetHeader("Origin")
		if origin == "" {
			switch site := c.GetHeader("Sec-Fetch-Site"); site {
			case "", "same-origin", "none":
				c.Next()
			default:
				respondForbidden(c, http.StatusForbidden, "跨站请求已被拒绝（Sec-Fetch-Site: "+site+"）")
			}
			return
		}
		if !pol.IsSameSiteOrigin(c.Request, origin) {
			respondForbidden(c, http.StatusForbidden, "跨站请求已被拒绝（Origin 与当前服务不一致）")
			return
		}
		c.Next()
	}
}

// Auth 可选令牌鉴权（API_TOKEN 为空时整条链路保持原有「依赖宿主网关认证」的部署模型）。
// 令牌只从请求头读取：查询参数会进入浏览器历史、代理与服务端访问日志、Referer，
// 因此普通接口不接受 ?token=，WebSocket 握手另用 AuthAllowQuery。
func Auth(token string) gin.HandlerFunc {
	return authWith(token, false)
}

// AuthAllowQuery 在 Auth 基础上额外接受 ?token= 查询参数。
// 仅供 WebSocket 握手使用——浏览器不能为 ws 请求设置自定义请求头。
func AuthAllowQuery(token string) gin.HandlerFunc {
	return authWith(token, true)
}

func authWith(token string, allowQuery bool) gin.HandlerFunc {
	if token == "" {
		return func(c *gin.Context) { c.Next() }
	}
	want := []byte(token)
	return func(c *gin.Context) {
		got := c.GetHeader("X-Auth-Token")
		if got == "" {
			if _, after, ok := strings.Cut(c.GetHeader("Authorization"), "Bearer "); ok {
				got = strings.TrimSpace(after)
			}
		}
		if got == "" && allowQuery {
			got = c.Query("token")
		}
		if subtle.ConstantTimeCompare([]byte(got), want) != 1 {
			respondForbidden(c, http.StatusUnauthorized, "未授权：缺少或错误的访问令牌")
			return
		}
		c.Next()
	}
}

// SecurityHeaders 安全响应头（CSP / 防嗅探 / 无 Referer）。
// 具体策略由宿主平台给出：经宿网关部署时放行 iframe 嵌入并信任转发头，
// 直连部署则保留点击劫持防护。
func SecurityHeaders(p platform.Platform) gin.HandlerFunc {
	pol := p.SecurityPolicy()
	return func(c *gin.Context) {
		c.Header("Content-Security-Policy", pol.ContentSecurityPolicy(pol.RequestHost(c.Request)))
		c.Header("X-Content-Type-Options", "nosniff")
		if !pol.AllowEmbedding {
			c.Header("X-Frame-Options", "DENY")
		}
		c.Header("Referrer-Policy", "no-referrer")
		c.Next()
	}
}

// Logger 基于 slog 的请求日志中间件；带令牌参数的请求不记录查询串，避免令牌落盘
func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		status := c.Writer.Status()
		attrs := []any{
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", status,
			"duration", time.Since(start).String(),
			"ip", c.ClientIP(),
		}
		switch {
		case status >= 500:
			slog.Error("request", attrs...)
		case status >= 400:
			slog.Warn("request", attrs...)
		default:
			slog.Info("request", attrs...)
		}
	}
}

// IsLoopback 判断监听地址是否为回环（用于启动时的暴露面告警）
func IsLoopback(host string) bool {
	if host == "" {
		return true
	}
	switch host {
	case "localhost":
		return true
	}
	if host == "*" {
		return false
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.IsLoopback()
	}
	return false
}
