// Package mcpserver 把 trpanel 的种子管理能力以 MCP（Model Context Protocol）工具
// 暴露给 AI 客户端：streamable HTTP 传输，鉴权复用与 REST 相同的令牌机制（中间件层处理）。
package mcpserver

import (
	"net/http"
	"runtime/debug"
	"sync/atomic"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/trpanel/backend/internal/platform"
	"github.com/trpanel/backend/internal/rpc"
	"github.com/trpanel/backend/internal/seedpolicy"
	"github.com/trpanel/backend/internal/state"
)

// Server MCP 工具服务：复用 RPC 管理器、做种策略引擎与文件访问白名单
type Server struct {
	manager *rpc.Manager
	policy  *seedpolicy.Service
	store   *state.Store
	plat    platform.Platform
	// allowDelete 控制删除类工具是否可用（高危操作，默认关闭）；
	// 指向共享的原子开关，设置界面修改后无需重启即生效
	allowDelete *atomic.Bool
	// allowDangerous 控制移动 / 重命名 / 立即执行做种策略等其它高危工具（默认关闭）
	allowDangerous *atomic.Bool
	// onMutation 写操作成功后回调（触发 WebSocket 立即刷新），可为 nil
	onMutation func()
}

// New 创建 MCP 服务
func New(manager *rpc.Manager, policy *seedpolicy.Service, store *state.Store, plat platform.Platform, allowDelete, allowDangerous *atomic.Bool, onMutation func()) *Server {
	return &Server{
		manager:        manager,
		policy:         policy,
		store:          store,
		plat:           plat,
		allowDelete:    allowDelete,
		allowDangerous: allowDangerous,
		onMutation:     onMutation,
	}
}

// Handler 返回可挂载到任意 HTTP 路由的 streamable HTTP 处理器。
// 采用 stateless + JSON 响应：本服务只提供工具调用、无服务端主动通知，
// 无会话握手对简单客户端与调试最友好（GET 长连接 / DELETE 会话返回 405 属预期）。
func (s *Server) Handler() http.Handler {
	srv := mcp.NewServer(&mcp.Implementation{Name: "trpanel", Version: version()}, nil)
	registerTools(srv, s)
	return mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return srv }, &mcp.StreamableHTTPOptions{
		Stateless:    true,
		JSONResponse: true,
	})
}

// bump 通知前端立即刷新（写操作之后）
func (s *Server) bump() {
	if s.onMutation != nil {
		s.onMutation()
	}
}

// version 取模块版本（go build 携带模块信息时有效），兜底 dev
func version() string {
	if info, ok := debug.ReadBuildInfo(); ok && info.Main.Version != "" && info.Main.Version != "(devel)" {
		return info.Main.Version
	}
	return "dev"
}
