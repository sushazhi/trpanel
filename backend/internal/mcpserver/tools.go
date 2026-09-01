package mcpserver

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/trpanel/backend/internal/models"
	"github.com/trpanel/backend/internal/rpc"
)

// registerTools 注册全部 MCP 工具。
// 分级原则：只读工具全量提供；添加/启停默认开放；删除必须显式配置 mcp_allow_delete。
func registerTools(srv *mcp.Server, s *Server) {
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "list_torrents",
		Description: "列出 Transmission 种子，支持按关键词 / 状态 / 站点过滤；返回摘要字段，尺寸单位为字节",
	}, s.listTorrents)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "get_torrent",
		Description: "获取单个种子详情，含文件列表 / Peers / Tracker 状态",
	}, s.getTorrent)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "get_stats",
		Description: "获取 Transmission 会话统计：版本、种子数量、当前与累计上传 / 下载量",
	}, s.getStats)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "get_seed_policy_report",
		Description: "trpanel 做种策略报告：列出已配置规则，以及当前已达标但尚未处理的种子与达标依据；只读评估，不会执行暂停或删除",
	}, s.getSeedPolicyReport)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "add_torrent",
		Description: "添加种子：磁力链接 / .torrent 的 http(s) URL / Transmission 所在主机上的 .torrent 路径（受文件白名单限制）。默认以暂停状态添加",
	}, s.addTorrent)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "start_torrents",
		Description: "按 ID 批量开始种子（下载或做种）",
	}, s.startTorrents)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "stop_torrents",
		Description: "按 ID 批量暂停种子",
	}, s.stopTorrents)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "remove_torrents",
		Description: "按 ID 批量删除种子；deleteData=true 时同时删除本地文件（不可恢复）。需服务端显式开启",
	}, s.removeTorrents)
}

// emptyIn 无入参工具的占位
type emptyIn struct{}

// ---- list_torrents ----

type listTorrentsIn struct {
	Search string `json:"search,omitempty" jsonschema:"关键词过滤：大小写不敏感的子串，匹配名称 / 哈希 / 磁力链接"`
	Status string `json:"status,omitempty" jsonschema:"状态过滤：downloading(下载中) / seeding(做种中) / paused(已暂停) / checking(校验中) / finished(已完成) / error(出错)"`
	Site   string `json:"site,omitempty" jsonschema:"按 tracker 主机名过滤，大小写不敏感子串匹配"`
	Limit  int    `json:"limit,omitempty" jsonschema:"最多返回条数，默认 50，上限 500"`
}

// statusGroups 状态过滤到 Transmission 状态码的映射
var statusGroups = map[string][]int64{
	"downloading": {3, 4},
	"seeding":     {5, 6},
	"paused":      {0},
	"checking":    {1, 2},
}

// statusText Transmission 状态码的可读文本
var statusText = map[int64]string{
	0: "stopped", 1: "checkWait", 2: "checking",
	3: "downloadWait", 4: "downloading", 5: "seedWait", 6: "seeding",
}

func (s *Server) listTorrents(ctx context.Context, _ *mcp.CallToolRequest, in listTorrentsIn) (*mcp.CallToolResult, any, error) {
	status := strings.ToLower(strings.TrimSpace(in.Status))
	if status != "" && status != "finished" && status != "error" && statusGroups[status] == nil {
		return nil, nil, fmt.Errorf("status 无效: %q，可选 downloading/seeding/paused/checking/finished/error", in.Status)
	}
	torrents, err := s.manager.Client().GetTorrents(ctx)
	if err != nil {
		return nil, nil, errors.New(rpc.SanitizeClientMsg(err.Error()))
	}
	limit := in.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}
	search := strings.ToLower(strings.TrimSpace(in.Search))
	siteNeedle := strings.ToLower(strings.TrimSpace(in.Site))
	total := 0
	briefs := make([]map[string]any, 0, limit)
	for _, t := range torrents {
		if t == nil || !torrentMatches(t, status, search, siteNeedle) {
			continue
		}
		total++
		if len(briefs) < limit {
			briefs = append(briefs, torrentBrief(t))
		}
	}
	out := map[string]any{"total": total, "returned": len(briefs), "torrents": briefs}
	if total > len(briefs) {
		out["note"] = fmt.Sprintf("匹配 %d 条，仅返回前 %d 条；可用 search/status 收窄或调大 limit", total, limit)
	}
	return nil, out, nil
}

// torrentMatches 依次套用状态 / 关键词 / 站点过滤，空条件视为不限制
func torrentMatches(t *models.Torrent, status, search, site string) bool {
	switch {
	case status == "finished":
		if !t.IsFinished {
			return false
		}
	case status == "error":
		if t.Error == 0 {
			return false
		}
	default:
		if group := statusGroups[status]; group != nil {
			ok := false
			for _, v := range group {
				if t.Status == v {
					ok = true
					break
				}
			}
			if !ok {
				return false
			}
		}
	}
	if search != "" &&
		!strings.Contains(strings.ToLower(t.Name), search) &&
		!strings.Contains(strings.ToLower(t.HashString), search) &&
		!strings.Contains(strings.ToLower(t.MagnetLink), search) {
		return false
	}
	if site != "" {
		hit := false
		for _, ts := range t.TrackerStats {
			if strings.Contains(strings.ToLower(ts.Host), site) {
				hit = true
				break
			}
		}
		if !hit {
			return false
		}
	}
	return true
}

// torrentBrief 单个种子的摘要输出
func torrentBrief(t *models.Torrent) map[string]any {
	return map[string]any{
		"id": t.ID, "name": t.Name, "hash": t.HashString,
		"status": statusText[t.Status], "percentDone": t.PercentDone,
		"totalSize": t.TotalSize, "leftUntilDone": t.LeftUntilDone,
		"rateDownload": t.RateDownload, "rateUpload": t.RateUpload,
		"uploadedEver": t.UploadedEver, "uploadRatio": t.UploadRatio,
		"secondsSeeding": t.SecondsSeeding, "eta": t.ETA,
		"isFinished": t.IsFinished, "isStalled": t.IsStalled, "isPrivate": t.IsPrivate,
		"error": t.Error, "errorString": t.ErrorString,
		"labels": t.Labels, "queuePosition": t.QueuePosition,
		"downloadDir": t.DownloadDir, "site": primaryHost(t.TrackerStats),
		"addedDate": t.AddedDate, "doneDate": t.DoneDate,
	}
}

// primaryHost 取主 tracker 主机名
func primaryHost(stats []models.TrackerStat) string {
	for _, ts := range stats {
		if !ts.IsBackup && ts.Host != "" {
			return ts.Host
		}
	}
	if len(stats) > 0 {
		return stats[0].Host
	}
	return ""
}

// ---- get_torrent ----

type idIn struct {
	ID int64 `json:"id" jsonschema:"种子 ID（list_torrents 返回的 id）"`
}

func (s *Server) getTorrent(ctx context.Context, _ *mcp.CallToolRequest, in idIn) (*mcp.CallToolResult, any, error) {
	t, err := s.manager.Client().GetTorrentDetail(ctx, in.ID)
	if err != nil {
		return nil, nil, errors.New(rpc.SanitizeClientMsg(err.Error()))
	}
	// 块位图是 base64 大字段，对 AI 决策无意义
	t.Pieces = ""
	return nil, t, nil
}

// ---- get_stats ----

func (s *Server) getStats(ctx context.Context, _ *mcp.CallToolRequest, _ emptyIn) (*mcp.CallToolResult, any, error) {
	stats, err := s.manager.Client().GetSessionStats(ctx)
	if err != nil {
		return nil, nil, errors.New(rpc.SanitizeClientMsg(err.Error()))
	}
	sess, err := s.manager.Client().GetSession(ctx)
	if err != nil {
		return nil, nil, errors.New(rpc.SanitizeClientMsg(err.Error()))
	}
	return nil, map[string]any{
		"version":            sess.Version,
		"torrentCount":       stats.TorrentCount,
		"activeTorrentCount": stats.ActiveTorrentCount,
		"pausedTorrentCount": stats.PausedTorrentCount,
		"downloadSpeed":      stats.DownloadSpeed,
		"uploadSpeed":        stats.UploadSpeed,
		"cumulative":         stats.Cumulative,
		"current":            stats.Current,
	}, nil
}

// ---- get_seed_policy_report ----

func (s *Server) getSeedPolicyReport(ctx context.Context, _ *mcp.CallToolRequest, _ emptyIn) (*mcp.CallToolResult, any, error) {
	entries, enforce, err := s.policy.Preview(ctx)
	if err != nil {
		return nil, nil, errors.New(rpc.SanitizeClientMsg(err.Error()))
	}
	st := s.store.Get()
	mode := "preview"
	if enforce {
		mode = "execute"
	}
	rules := make([]map[string]any, 0, len(st.SeedPolicyRules))
	for _, r := range st.SeedPolicyRules {
		rules = append(rules, map[string]any{
			"id": r.ID, "name": r.Name, "enabled": r.Enabled, "action": r.Action,
			"minRatio": r.MinRatio, "minSeedDays": r.MinSeedDays, "minUploadGB": r.MinUploadGB,
			"sites": r.Sites, "labels": r.Labels, "nameMatch": r.NameMatch,
		})
	}
	out := map[string]any{"mode": mode, "rules": rules, "matched": len(entries), "items": entries}
	if len(st.SeedPolicyRules) == 0 {
		out["note"] = "尚未配置做种策略规则"
	}
	return nil, out, nil
}

// ---- add_torrent ----

type addTorrentIn struct {
	Link        string   `json:"link,omitempty" jsonschema:"磁力链接或 .torrent 的 http(s) URL；与 path 二选一"`
	Path        string   `json:"path,omitempty" jsonschema:"Transmission 所在主机上 .torrent 文件的绝对路径（受文件读取白名单限制）；与 link 二选一"`
	DownloadDir string   `json:"downloadDir,omitempty" jsonschema:"下载目录，留空使用 Transmission 全局默认目录"`
	Paused      *bool    `json:"paused,omitempty" jsonschema:"是否以暂停状态添加；默认 true（安全默认），添加后用 start_torrents 启动"`
	Labels      []string `json:"labels,omitempty" jsonschema:"标签列表"`
}

func (s *Server) addTorrent(ctx context.Context, _ *mcp.CallToolRequest, in addTorrentIn) (*mcp.CallToolResult, any, error) {
	if in.Link != "" && in.Path != "" {
		return nil, nil, errors.New("link 与 path 只能提供一个")
	}
	paused := true
	if in.Paused != nil {
		paused = *in.Paused
	}
	var (
		id  int64
		err error
	)
	switch {
	case in.Path != "":
		data, readErr := s.readTorrentFile(in.Path)
		if readErr != nil {
			slog.Warn("MCP 按路径添加种子被拒", "path", in.Path, "err", readErr)
			return nil, nil, errors.New("种子路径不可用")
		}
		id, err = s.manager.Client().AddTorrentByFile(ctx, data, in.DownloadDir, paused, in.Labels, nil, nil, nil)
	case in.Link != "":
		id, err = s.manager.Client().AddTorrentByURL(ctx, in.Link, in.DownloadDir, paused, in.Labels, nil)
	default:
		return nil, nil, errors.New("缺少 link 或 path")
	}
	if err != nil {
		return nil, nil, errors.New(rpc.SanitizeClientMsg(err.Error()))
	}
	s.bump()
	out := map[string]any{"id": id, "paused": paused}
	if paused {
		out["note"] = "种子已按暂停添加，需调用 start_torrents 启动"
	}
	return nil, out, nil
}

// readTorrentFile 按宿主机路径读取种子内容，白名单口径与 REST 的按路径添加一致
func (s *Server) readTorrentFile(path string) ([]byte, error) {
	target, err := s.plat.FileAccess().AllowRead(path)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(target)
}

// ---- start / stop / remove ----

type idsIn struct {
	IDs []int64 `json:"ids" jsonschema:"种子 ID 列表（来自 list_torrents）"`
}

func (s *Server) startTorrents(ctx context.Context, _ *mcp.CallToolRequest, in idsIn) (*mcp.CallToolResult, any, error) {
	if len(in.IDs) == 0 {
		return nil, nil, errors.New("缺少 ids")
	}
	if err := s.manager.Client().StartTorrents(ctx, in.IDs); err != nil {
		return nil, nil, errors.New(rpc.SanitizeClientMsg(err.Error()))
	}
	s.bump()
	return nil, map[string]any{"ids": in.IDs, "action": "started"}, nil
}

func (s *Server) stopTorrents(ctx context.Context, _ *mcp.CallToolRequest, in idsIn) (*mcp.CallToolResult, any, error) {
	if len(in.IDs) == 0 {
		return nil, nil, errors.New("缺少 ids")
	}
	if err := s.manager.Client().StopTorrents(ctx, in.IDs); err != nil {
		return nil, nil, errors.New(rpc.SanitizeClientMsg(err.Error()))
	}
	s.bump()
	return nil, map[string]any{"ids": in.IDs, "action": "stopped"}, nil
}

type removeTorrentsIn struct {
	IDs        []int64 `json:"ids" jsonschema:"种子 ID 列表"`
	DeleteData bool    `json:"deleteData,omitempty" jsonschema:"true 时同时删除已下载的本地文件（不可恢复）"`
}

func (s *Server) removeTorrents(ctx context.Context, _ *mcp.CallToolRequest, in removeTorrentsIn) (*mcp.CallToolResult, any, error) {
	if !s.allowDelete.Load() {
		return nil, nil, errors.New("删除功能未开放：需在本产品的设置界面开启「允许通过 MCP 删除种子」")
	}
	if len(in.IDs) == 0 {
		return nil, nil, errors.New("缺少 ids")
	}
	if err := s.manager.Client().RemoveTorrents(ctx, in.IDs, in.DeleteData); err != nil {
		return nil, nil, errors.New(rpc.SanitizeClientMsg(err.Error()))
	}
	s.bump()
	slog.Info("MCP 删除种子", "ids", in.IDs, "deleteData", in.DeleteData)
	return nil, map[string]any{"ids": in.IDs, "deleted": true, "deleteData": in.DeleteData}, nil
}
