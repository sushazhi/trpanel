package platform

import "github.com/gin-gonic/gin"

// generic 通用部署平台：最小权限，不假设任何宿主能力。
// 通用平台下 UI 上的宿主专属入口（文件选择器、打开目录、应用更新）
// 会因为拿不到能力而自动隐藏，核心的 Transmission 管理能力完全不受影响。
type generic struct {
	cfg Config
	fa  FileAccess
}

// NewGeneric 通用平台（Docker / 物理机 / 任意 Linux 直连部署）
func NewGeneric(cfg Config) Platform {
	return &generic{
		cfg: cfg,
		fa:  NewFileAccess(len(cfg.FileAllowedPrefixes) > 0, cfg.FileAllowedPrefixes),
	}
}

func (g *generic) ID() string { return IDGeneric }

func (g *generic) GatewayPrefix() string { return g.cfg.GatewayPrefix }

func (g *generic) SecurityPolicy() SecurityPolicy {
	return SecurityPolicy{
		AllowEmbedding:        false,
		TrustForwardedHeaders: false,
		AllowedOrigins: []string{
			"http://localhost:5173",
			"http://127.0.0.1:5173",
			"https://localhost:5173",
		},
	}
}

func (g *generic) FileAccess() FileAccess { return g.fa }

// RegisterRoutes 通用部署不提供宿主应用更新等专属接口
func (g *generic) RegisterRoutes(*gin.RouterGroup) {}
