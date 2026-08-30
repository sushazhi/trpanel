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

// 做种策略动作
const (
	PolicyActionPause      = "pause"
	PolicyActionDelete     = "delete"
	PolicyActionDeleteData = "deleteData"
)

// SeedPolicyRule 做种策略：按站点/标签/名称圈定范围，达到分享率等目标后执行动作。
// MinRatio 等达标条件填 0 表示不参与判断，但至少需配置一个，否则规则无意义。
type SeedPolicyRule struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Enabled     bool     `json:"enabled"`
	Sites       []string `json:"sites"`     // Tracker 站点（主机名）
	Labels      []string `json:"labels"`    // 标签
	NameMatch   string   `json:"nameMatch"` // 名称包含
	MinRatio    float64  `json:"minRatio"`
	MinSeedDays float64  `json:"minSeedDays"`
	MinUploadGB float64  `json:"minUploadGB"`
	Action      string   `json:"action"` // pause / delete / deleteData
}

// SeedPolicyGuard 做种策略全局安全保护，对所有规则生效
type SeedPolicyGuard struct {
	// Enforce 需显式开启，策略才会真正动作；关闭时只写预览记录。
	// 取这个方向是为了让「从未配置」落在安全的一侧。
	Enforce       bool     `json:"enforce"`
	MinSeedHours  float64  `json:"minSeedHours"`  // 全局最低做种时长（小时），0 表示不设下限
	ExcludeSites  []string `json:"excludeSites"`  // 排除的站点
	ExcludeLabels []string `json:"excludeLabels"` // 排除的标签
}

// SeedPolicyReasonPart 一条达标依据的结构化片段，由界面按语言渲染成文案
type SeedPolicyReasonPart struct {
	Kind   string  `json:"kind"`   // ratio / days / upload
	Actual float64 `json:"actual"` // 实际值（分享率 / 做种天数 / 上传 GB）
	Target float64 `json:"target"` // 规则设定的目标值
}

// SeedPolicyLog 策略执行记录，供界面回看引擎对哪些种子做了什么
type SeedPolicyLog struct {
	Time    int64                  `json:"time"`
	Rule    string                 `json:"rule"`
	Torrent string                 `json:"torrent"`
	Site    string                 `json:"site"`
	Action  string                 `json:"action"`
	Reason  []SeedPolicyReasonPart `json:"reason"`
	DryRun  bool                   `json:"dryRun"`
}

// State 持久化状态
type State struct {
	Servers         []Server          `json:"servers"`
	ActiveServer    int               `json:"activeServer"`
	AutoMoveRules   []AutoMoveRule    `json:"autoMoveRules"`
	SeedPolicyRules []SeedPolicyRule  `json:"seedPolicyRules"`
	SeedPolicyGuard SeedPolicyGuard   `json:"seedPolicyGuard"`
	SeedPolicyLogs  []SeedPolicyLog   `json:"seedPolicyLogs"`
	ProcessedMoves  map[string]string `json:"processedMoves"`  // hashString -> time
	ProcessedPolicy map[string]string `json:"processedPolicy"` // ruleID+"\x00"+hashString -> time
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
		st.normalize()
		s.data = &st
		return s, nil
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	s.data = &State{
		Servers:         []Server{},
		AutoMoveRules:   []AutoMoveRule{},
		SeedPolicyRules: []SeedPolicyRule{},
		ProcessedMoves:  map[string]string{},
		ProcessedPolicy: map[string]string{},
	}
	_ = s.save()
	return s, nil
}

// normalize 补齐反序列化后可能缺失的映射表，并把下线动作降级到安全一侧
func (st *State) normalize() {
	if st.ProcessedMoves == nil {
		st.ProcessedMoves = map[string]string{}
	}
	if st.ProcessedPolicy == nil {
		st.ProcessedPolicy = map[string]string{}
	}
	// 归档（move）已下线：旧规则改成暂停，避免被引擎静默跳过
	for i := range st.SeedPolicyRules {
		if st.SeedPolicyRules[i].Action == "move" {
			st.SeedPolicyRules[i].Action = PolicyActionPause
		}
	}
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
	cp.normalize()
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

// PolicyKey 构造做种策略已处理标记键
func PolicyKey(ruleID, hashString string) string {
	return ruleID + "\x00" + hashString
}

// NowUnix 当前 Unix 时间戳
func NowUnix() int64 {
	return time.Now().Unix()
}
