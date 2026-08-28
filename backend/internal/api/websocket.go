package api

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/url"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/transmission-manager/backend/internal/rpc"
)

const (
	writeWait     = 10 * time.Second
	pongWait      = 60 * time.Second
	pingPeriod    = 30 * time.Second
	maxSendBuffer = 256
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
	// Origin 校验（配合 /ws 令牌鉴权）：仅允许同源或本机开发源
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // 非浏览器客户端不带 Origin
		}
		u, err := url.Parse(origin)
		if err != nil {
			return false
		}
		if u.Host == r.Host {
			return true
		}
		h := u.Hostname()
		return h == "localhost" || h == "127.0.0.1"
	},
}

// wsClient 单个 WebSocket 客户端
type wsClient struct {
	conn *websocket.Conn
	send chan []byte
}

// Hub WebSocket 广播中心
type Hub struct {
	rpc          *rpc.Manager
	pollInterval atomic.Int64 // 纳秒，支持运行期热调整

	mu          sync.RWMutex
	lastData    []byte // 最近一次推送的全量数据缓存
	pollMu      sync.Mutex
	clients     map[*wsClient]struct{}
	clientCount atomic.Int64
	register    chan *wsClient
	unregister  chan *wsClient
	broadcast   chan []byte
}

// NewHub 创建 Hub
func NewHub(manager *rpc.Manager, interval time.Duration) *Hub {
	h := &Hub{
		rpc:         manager,
		clients:     make(map[*wsClient]struct{}),
		register:    make(chan *wsClient),
		unregister:  make(chan *wsClient),
		broadcast:   make(chan []byte, 16),
	}
	h.pollInterval.Store(interval.Nanoseconds())
	return h
}

// getPollInterval 获取当前轮询间隔
func (h *Hub) getPollInterval() time.Duration {
	return time.Duration(h.pollInterval.Load())
}

// SetPollInterval 运行期调整轮询间隔
func (h *Hub) SetPollInterval(interval time.Duration) {
	if interval < 500*time.Millisecond {
		interval = 500 * time.Millisecond
	}
	h.pollInterval.Store(interval.Nanoseconds())
}

// Start 启动轮询与事件循环
func (h *Hub) Start(ctx context.Context) {
	go h.run()
	go h.pollLoop(ctx)
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = struct{}{}
			// 首个客户端接入时刷新一次数据（无客户端期间未轮询，缓存可能过期）
			if h.clientCount.Add(1) == 1 {
				h.Bump()
			}
			// 新连接立即推送当前缓存
			h.mu.RLock()
			last := h.lastData
			h.mu.RUnlock()
			if last != nil {
				select {
				case client.send <- last:
				default:
				}
			}
		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				h.clientCount.Add(-1)
			}
		case data := <-h.broadcast:
			for client := range h.clients {
				select {
				case client.send <- data:
				default:
					// 发送缓冲区满，判定客户端过慢，断开
					delete(h.clients, client)
					close(client.send)
				}
			}
		}
	}
}

func (h *Hub) pollLoop(ctx context.Context) {
	h.poll() // 立即先拉一次，预热缓存
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(h.getPollInterval()):
			// 无客户端时跳过轮询，避免对 Transmission 无意义的高频请求
			if h.clientCount.Load() == 0 {
				continue
			}
			h.poll()
		}
	}
}

// Bump 变更后立即拉取并广播（异步；已有轮询在跑时跳过，其结果会覆盖本次变更）
func (h *Hub) Bump() {
	if !h.pollMu.TryLock() {
		return
	}
	go func() {
		defer h.pollMu.Unlock()
		h.pollLocked()
	}()
}

// poll 拉取全量种子并广播（串行执行）
func (h *Hub) poll() {
	h.pollMu.Lock()
	defer h.pollMu.Unlock()
	h.pollLocked()
}

// pollLocked 实际拉取逻辑（调用方需持有 pollMu；数据无变化时跳过广播）
func (h *Hub) pollLocked() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	torrents, err := h.rpc.Client().GetTorrents(ctx)
	if err != nil {
		slog.Error("轮询种子失败", "err", err)
		return
	}
	// 差异比较仅基于种子数据（不含 timestamp，否则每次不同导致去重失效）
	torrentsData, err := json.Marshal(torrents)
	if err != nil {
		slog.Error("序列化种子数据失败", "err", err)
		return
	}
	h.mu.Lock()
	unchanged := bytes.Equal(h.lastData, torrentsData)
	h.lastData = torrentsData
	h.mu.Unlock()
	if unchanged {
		return
	}
	data, err := json.Marshal(map[string]interface{}{
		"type":      "full",
		"data":      torrents,
		"timestamp": time.Now().UnixMilli(),
	})
	if err != nil {
		slog.Error("序列化推送数据失败", "err", err)
		return
	}
	h.broadcast <- data
}

// HandleWS 处理 WebSocket 连接
func (h *Hub) HandleWS(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		slog.Error("升级 WebSocket 失败", "err", err)
		return
	}
	client := &wsClient{conn: conn, send: make(chan []byte, maxSendBuffer)}
	h.register <- client
	go h.writePump(client)
	h.readPump(client)
}

func (h *Hub) readPump(client *wsClient) {
	defer func() {
		h.unregister <- client
		client.conn.Close()
	}()
	client.conn.SetReadLimit(512)
	_ = client.conn.SetReadDeadline(time.Now().Add(pongWait))
	client.conn.SetPongHandler(func(string) error {
		return client.conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		if _, _, err := client.conn.ReadMessage(); err != nil {
			break
		}
	}
}

func (h *Hub) writePump(client *wsClient) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		client.conn.Close()
	}()
	for {
		select {
		case message, ok := <-client.send:
			_ = client.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = client.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := client.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			_ = client.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := client.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
