package rpc

import "sync"

// Manager 管理 RPC 客户端实例，支持运行期热更新连接配置
type Manager struct {
	mu     sync.RWMutex
	client *Client
	url    string
	user   string
	pass   string
}

// NewManager 创建 Manager 并初始化客户端
func NewManager(transmissionURL, user, pass string) (*Manager, error) {
	c, err := New(transmissionURL, user, pass)
	if err != nil {
		return nil, err
	}
	return &Manager{client: c, url: transmissionURL, user: user, pass: pass}, nil
}

// Client 获取当前客户端
func (m *Manager) Client() *Client {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.client
}

// Reconfigure 使用新配置重建客户端
func (m *Manager) Reconfigure(transmissionURL, user, pass string) error {
	c, err := New(transmissionURL, user, pass)
	if err != nil {
		return err
	}
	m.mu.Lock()
	m.client = c
	m.url = transmissionURL
	m.user = user
	m.pass = pass
	m.mu.Unlock()
	return nil
}

// Credentials 返回当前连接配置（不含明文密码使用方）
func (m *Manager) Credentials() (url, user, pass string) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.url, m.user, m.pass
}
