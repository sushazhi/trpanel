package api

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/oschwald/geoip2-golang"
)

// GeoLite2-City 自动下载镜像（GitHub Release，每日构建；仅本地缺失 mmdb 时使用，
// 数据约 60MB，下载到数据目录后重启不再重复下载）
const geoMirrorURL = "https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-City.mmdb"

// 下载约束：镜像异常（连接挂死 / 无限流）时不能把协程与磁盘拖死。
// 内容是否真的是 mmdb 由 geoip2.Open 校验，失败即删除重下，故此处只需限制时长与体积。
const (
	geoDownloadTimeout = 10 * time.Minute
	geoMaxBytes        = 256 << 20
)

// GeoService MaxMind GeoIP 查询服务（mmdb 文件缺失时优雅降级为空查询）
type GeoService struct {
	mu     sync.RWMutex
	reader *geoip2.Reader
}

// NewGeoService 加载 mmdb 数据库，失败时返回可用的空服务
func NewGeoService(dbPath string) *GeoService {
	g := &GeoService{}
	if err := g.Open(dbPath); err != nil {
		slog.Info("GeoIP 数据库不可用，归属地功能暂时降级", "path", dbPath)
	}
	return g
}

// Open 加载 mmdb 并热替换现有 reader
func (g *GeoService) Open(dbPath string) error {
	reader, err := geoip2.Open(dbPath)
	if err != nil {
		return err
	}
	g.mu.Lock()
	old := g.reader
	g.reader = reader
	g.mu.Unlock()
	if old != nil {
		_ = old.Close()
	}
	return nil
}

// Loaded 是否已有可用数据库
func (g *GeoService) Loaded() bool {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.reader != nil
}

// EnsureAvailable 保证 mmdb 可用：已加载直接返回；本地有文件就加载；
// 都没有则从镜像下载到 dbPath 后热加载。失败只记日志，不影响服务启动。
func (g *GeoService) EnsureAvailable(ctx context.Context, dbPath string) {
	if g.Loaded() {
		return
	}
	if _, err := os.Stat(dbPath); err == nil {
		if err := g.Open(dbPath); err == nil {
			slog.Info("GeoIP 数据库已加载", "path", dbPath)
			return
		}
		slog.Warn("GeoIP 数据库加载失败，尝试重新下载", "path", dbPath)
	}
	if err := g.download(ctx, dbPath); err != nil {
		slog.Warn("GeoIP 数据库下载失败，归属地将显示为 -", "err", err)
		return
	}
	slog.Info("GeoIP 数据库下载完成，归属地功能已启用", "path", dbPath)
}

// download 从镜像拉取 mmdb 到 dbPath（先写临时文件再改名，避免半截文件被当作有效库）
func (g *GeoService) download(ctx context.Context, dbPath string) error {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, geoMirrorURL, nil)
	if err != nil {
		return err
	}
	resp, err := (&http.Client{Timeout: geoDownloadTimeout}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("下载返回状态 %d", resp.StatusCode)
	}
	if resp.ContentLength > geoMaxBytes {
		return fmt.Errorf("数据库体积异常: %d 字节", resp.ContentLength)
	}
	tmp := dbPath + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	// LimitReader 多读 1 字节用于判定「超出上限」，避免无界写入
	written, copyErr := io.Copy(f, io.LimitReader(resp.Body, geoMaxBytes+1))
	closeErr := f.Close()
	if copyErr == nil {
		copyErr = closeErr
	}
	if copyErr == nil && written > geoMaxBytes {
		copyErr = fmt.Errorf("下载内容超过大小上限 (%d MB)", geoMaxBytes>>20)
	}
	if copyErr == nil && written == 0 {
		copyErr = fmt.Errorf("下载内容为空")
	}
	if copyErr != nil {
		_ = os.Remove(tmp)
		return copyErr
	}
	// Windows 上 rename 不能覆盖已存在文件，先移除（该路径仅在加载失败时会存在残留）
	_ = os.Remove(dbPath)
	if err := os.Rename(tmp, dbPath); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := g.Open(dbPath); err != nil {
		// 下载内容不是有效 mmdb（如镜像返回错误页），删掉避免下次误判
		_ = os.Remove(dbPath)
		return err
	}
	return nil
}

// Lookup 查询 IP 归属地，返回国家代码与城市
func (g *GeoService) Lookup(ip string) (country, city string) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	if g.reader == nil {
		return "", ""
	}
	// Transmission 返回的 Peer 地址可能带端口（ip:port），先剥离再解析
	host := ip
	if h, _, err := net.SplitHostPort(ip); err == nil {
		host = h
	}
	parsed := net.ParseIP(host)
	if parsed == nil {
		return "", ""
	}
	record, err := g.reader.City(parsed)
	if err != nil {
		return "", ""
	}
	country = record.Country.IsoCode
	city = record.City.Names["zh-CN"]
	if city == "" {
		city = record.City.Names["en"]
	}
	return country, city
}

// Close 释放资源
func (g *GeoService) Close() {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.reader != nil {
		_ = g.reader.Close()
		g.reader = nil
	}
}

// lookupPeers 批量查询 Peer IP 地理位置
func (h *Handler) lookupPeers(c *gin.Context) {
	var body struct {
		IPs []string `json:"ips"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		respondError(c, http.StatusBadRequest, "请求体无效")
		return
	}
	if len(body.IPs) > 500 {
		respondError(c, http.StatusBadRequest, "单次查询 IP 数量不能超过 500")
		return
	}
	result := make(map[string]gin.H, len(body.IPs))
	for _, ip := range body.IPs {
		country, city := h.geo.Lookup(ip)
		result[ip] = gin.H{"country": country, "city": city}
	}
	respond(c, result)
}
