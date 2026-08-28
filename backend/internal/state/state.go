package state

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Server Transmission 服务端配置
type Server struct {
	Name    string `json:"name"`
	URL     string `json:"url"`
	User    string `json:"user"`
	Pass    string `json:"pass"`
	Enabled bool   `json:"enabled"`
}

// RSSFeed RSS 订阅源
type RSSFeed struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	URL          string   `json:"url"`
	IntervalMin  int      `json:"intervalMin"`
	Enabled      bool     `json:"enabled"`
	DownloadDir  string   `json:"downloadDir"`
	Labels       []string `json:"labels"`
	Paused       bool     `json:"paused"`
	MinSizeMB    float64  `json:"minSizeMB"`
	MaxSizeMB    float64  `json:"maxSizeMB"`
	Keywords     []string `json:"keywords"`
	ExcludeWords []string `json:"excludeWords"`
	IncludeRegex string   `json:"includeRegex"`
	ExcludeRegex string   `json:"excludeRegex"`
	LastFetchAt  int64    `json:"lastFetchAt"`
	LastError    string   `json:"lastError"`
	Processed    int64    `json:"processed"`
}

// AutoMoveRule 自动文件管理规则
type AutoMoveRule struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Enabled   bool     `json:"enabled"`
	Sites     []string `json:"sites"`     // Tracker 站点（主机名）
	Labels    []string `json:"labels"`    // 标签
	NameMatch string   `json:"nameMatch"` // 名称包含
	TargetDir string   `json:"targetDir"`
}

// State 持久化状态
type State struct {
	Servers         []Server            `json:"servers"`
	ActiveServer    int                 `json:"activeServer"`
	RSSFeeds        []RSSFeed           `json:"rssFeeds"`
	AutoMoveRules   []AutoMoveRule      `json:"autoMoveRules"`
	ProcessedRSS    map[string]string   `json:"processedRss"`   // feedID+"\x00"+itemGUID -> time
	ProcessedMoves  map[string]string   `json:"processedMoves"` // hashString -> time
}

// Store JSON 文件存储（线程安全）
type Store struct {
	mu   sync.RWMutex
	path string
	data *State
}

// Load 加载状态文件，不存在时创建默认空状态
func Load(path string) (*Store, error) {
	s := &Store{path: path}
	if data, err := os.ReadFile(path); err == nil {
		var st State
		if err := json.Unmarshal(data, &st); err != nil {
			return nil, err
		}
		if st.ProcessedRSS == nil {
			st.ProcessedRSS = map[string]string{}
		}
		if st.ProcessedMoves == nil {
			st.ProcessedMoves = map[string]string{}
		}
		s.data = &st
		return s, nil
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	s.data = &State{
		Servers:        []Server{},
		RSSFeeds:       []RSSFeed{},
		AutoMoveRules:  []AutoMoveRule{},
		ProcessedRSS:   map[string]string{},
		ProcessedMoves: map[string]string{},
	}
	_ = s.save()
	return s, nil
}

// Get 返回当前状态的深拷贝（调用方可自由修改，不影响内部数据）
func (s *Store) Get() State {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return *s.data.clone()
}

// clone 通过 JSON 往返复制状态（内部持有读锁时调用）
func (st *State) clone() *State {
	data, err := json.Marshal(st)
	if err != nil {
		return st
	}
	var cp State
	if err := json.Unmarshal(data, &cp); err != nil {
		return st
	}
	if cp.ProcessedRSS == nil {
		cp.ProcessedRSS = map[string]string{}
	}
	if cp.ProcessedMoves == nil {
		cp.ProcessedMoves = map[string]string{}
	}
	return &cp
}

// Update 在锁内修改状态并持久化
func (s *Store) Update(fn func(*State)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	fn(s.data)
	return s.save()
}

func (s *Store) save() error {
	data, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	if dir := filepath.Dir(s.path); dir != "" && dir != "." {
		_ = os.MkdirAll(dir, 0o755)
	}
	// 原子写入：先写临时文件再改名，避免进程中断导致损坏
	// 状态文件含服务器明文密码，权限收紧为仅属主可读写
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// DefaultStatePath 返回默认状态文件路径
func DefaultStatePath(dir string) string {
	if dir != "" {
		return filepath.Join(dir, "tm-state.json")
	}
	return "tm-state.json"
}

// RSSKey 构造 RSS 已处理条目键
func RSSKey(feedID, guid string) string {
	return feedID + "\x00" + guid
}

// NowUnix 当前 Unix 时间戳
func NowUnix() int64 {
	return time.Now().Unix()
}
