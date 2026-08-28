package api

import (
	"net"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/oschwald/geoip2-golang"
)

// GeoService MaxMind GeoIP 查询服务（mmdb 文件缺失时优雅降级为空查询）
type GeoService struct {
	mu     sync.RWMutex
	reader *geoip2.Reader
}

// NewGeoService 加载 mmdb 数据库，失败时返回可用的空服务
func NewGeoService(dbPath string) *GeoService {
	reader, err := geoip2.Open(dbPath)
	if err != nil {
		return &GeoService{}
	}
	return &GeoService{reader: reader}
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
