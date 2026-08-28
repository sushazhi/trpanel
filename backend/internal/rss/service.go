package rss

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/transmission-manager/backend/internal/rpc"
	"github.com/transmission-manager/backend/internal/state"
)

// Item 解析出的 RSS 条目
type Item struct {
	Title   string
	Link    string
	GUID    string
	SizeB   int64 // enclosure 大小（字节），0 表示未知
}

// feedData RSS 2.0 / Atom 通用解析结构
type feedData struct {
	XMLName xml.Name  `xml:"rss"`
	Channel feedChan  `xml:"channel"`
	Entries []feedEnt `xml:"entry"` // Atom
}

type feedChan struct {
	Items []feedItem `xml:"item"`
}

type feedItem struct {
	Title     string   `xml:"title"`
	Link      string   `xml:"link"`
	GUID      string   `xml:"guid"`
	Enclosure *feedEnc `xml:"enclosure"`
	Content   string   `xml:"description"`
}

type feedEnc struct {
	URL  string `xml:"url,attr"`
	Size string `xml:"length,attr"`
}

type atomLink struct {
	Href string `xml:"href,attr"`
	Rel  string `xml:"rel,attr"`
	Text string `xml:",chardata"`
}

type feedEnt struct {
	Title   string     `xml:"title"`
	ID      string     `xml:"id"`
	Links   []atomLink `xml:"link"`
	Content string     `xml:"content"`
	Summary string     `xml:"summary"`
}

// pickAtomLink 选取 Atom 下载链接：优先 enclosure 附件，其次任一带 href 的链接，最后文本链接
func pickAtomLink(links []atomLink) string {
	var fallback string
	for _, l := range links {
		if l.Href != "" {
			if l.Rel == "enclosure" {
				return l.Href
			}
			if fallback == "" {
				fallback = l.Href
			}
		} else if txt := strings.TrimSpace(l.Text); txt != "" && fallback == "" {
			fallback = txt
		}
	}
	return fallback
}

// parseFeed 解析 RSS 2.0 / Atom XML
func parseFeed(data []byte) ([]Item, error) {
	var fd feedData
	if err := xml.Unmarshal(data, &fd); err != nil {
		return nil, err
	}
	var items []Item
	// Atom
	if len(fd.Entries) > 0 {
		for _, e := range fd.Entries {
			link := pickAtomLink(e.Links)
			guid := e.ID
			if guid == "" {
				guid = link
			}
			items = append(items, Item{Title: strings.TrimSpace(e.Title), Link: link, GUID: guid})
		}
		return items, nil
	}
	// RSS 2.0
	for _, it := range fd.Channel.Items {
		link := it.Link
		guid := it.GUID
		if guid == "" {
			guid = link
		}
		itm := Item{Title: strings.TrimSpace(it.Title), Link: link, GUID: guid}
		if it.Enclosure != nil {
			itm.SizeB = parseInt64(it.Enclosure.Size)
		}
		items = append(items, itm)
	}
	return items, nil
}

func parseInt64(s string) int64 {
	var n int64
	for _, c := range strings.TrimSpace(s) {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int64(c-'0')
	}
	return n
}

// Service RSS 订阅自动下载服务
type Service struct {
	manager *rpc.Manager
	store   *state.Store
	client  *http.Client
}

// New 创建 RSS 服务
func New(manager *rpc.Manager, store *state.Store) *Service {
	return &Service{
		manager: manager,
		store:   store,
		client:  &http.Client{Timeout: 30 * time.Second},
	}
}

// Run 后台循环，定期抓取启用的源
func (s *Service) Run(ctx context.Context) {
	slog.Info("RSS 订阅服务已启动")
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		s.checkDue(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *Service) checkDue(ctx context.Context) {
	st := s.store.Get()
	now := time.Now().Unix()
	for i := range st.RSSFeeds {
		f := &st.RSSFeeds[i]
		if !f.Enabled {
			continue
		}
		interval := int64(f.IntervalMin * 60)
		if interval <= 0 {
			interval = 30 * 60
		}
		if now-f.LastFetchAt < interval {
			continue
		}
		if err := s.Fetch(ctx, f.ID); err != nil {
			slog.Warn("RSS 抓取失败", "feed", f.Name, "err", err)
		}
	}
}

// Fetch 抓取并处理单个源（供定时与手动触发共用）
func (s *Service) Fetch(ctx context.Context, id string) error {
	st := s.store.Get()
	var feed *state.RSSFeed
	for i := range st.RSSFeeds {
		if st.RSSFeeds[i].ID == id {
			feed = &st.RSSFeeds[i]
			break
		}
	}
	if feed == nil {
		return fmt.Errorf("RSS 源不存在: %s", id)
	}
	items, err := s.download(ctx, feed.URL)
	if err != nil {
		_ = s.store.Update(func(st2 *state.State) {
			for i := range st2.RSSFeeds {
				if st2.RSSFeeds[i].ID == id {
					st2.RSSFeeds[i].LastFetchAt = state.NowUnix()
					st2.RSSFeeds[i].LastError = err.Error()
				}
			}
		})
		return err
	}
	added := 0
	for _, it := range items {
		if it.GUID == "" || it.Link == "" {
			continue
		}
		key := state.RSSKey(id, it.GUID)
		if _, done := st.ProcessedRSS[key]; done {
			continue
		}
		if !matchItem(feed, it) {
			continue
		}
		if err := s.addTorrent(ctx, feed, it); err != nil {
			slog.Warn("RSS 添加种子失败", "feed", feed.Name, "title", it.Title, "err", err)
			continue
		}
		added++
		_ = s.store.Update(func(st2 *state.State) {
			st2.ProcessedRSS[key] = strconv.FormatInt(state.NowUnix(), 10)
		})
	}
	_ = s.store.Update(func(st2 *state.State) {
		for i := range st2.RSSFeeds {
			if st2.RSSFeeds[i].ID == id {
				st2.RSSFeeds[i].LastFetchAt = state.NowUnix()
				st2.RSSFeeds[i].LastError = ""
				st2.RSSFeeds[i].Processed += int64(added)
			}
		}
	})
	slog.Info("RSS 抓取完成", "feed", feed.Name, "items", len(items), "added", added)
	return nil
}

func (s *Service) download(ctx context.Context, url string) ([]Item, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "TransmissionManager/1.0 (+RSS)") // 部分站点拒绝默认 UA
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	return parseFeed(body)
}

func (s *Service) addTorrent(ctx context.Context, feed *state.RSSFeed, it Item) error {
	_, err := s.manager.Client().AddTorrentByURL(ctx, it.Link, feed.DownloadDir, feed.Paused, feed.Labels, nil)
	return err
}

// matchItem 标题/大小匹配
func matchItem(feed *state.RSSFeed, it Item) bool {
	lower := strings.ToLower(it.Title)
	// 包含关键词（任一命中）
	if len(feed.Keywords) > 0 {
		ok := false
		for _, k := range feed.Keywords {
			if k = strings.TrimSpace(k); k != "" && strings.Contains(lower, strings.ToLower(k)) {
				ok = true
				break
			}
		}
		if !ok {
			return false
		}
	}
	// 排除关键词
	for _, w := range feed.ExcludeWords {
		if w = strings.TrimSpace(w); w != "" && strings.Contains(lower, strings.ToLower(w)) {
			return false
		}
	}
	// 包含正则
	if feed.IncludeRegex != "" {
		re, err := regexp.Compile("(?i)" + feed.IncludeRegex)
		if err == nil && !re.MatchString(it.Title) {
			return false
		}
	}
	// 排除正则
	if feed.ExcludeRegex != "" {
		re, err := regexp.Compile("(?i)" + feed.ExcludeRegex)
		if err == nil && re.MatchString(it.Title) {
			return false
		}
	}
	// 大小范围（仅当条目携带大小信息）
	if it.SizeB > 0 {
		mb := float64(it.SizeB) / 1024 / 1024
		if feed.MinSizeMB > 0 && mb < feed.MinSizeMB {
			return false
		}
		if feed.MaxSizeMB > 0 && mb > feed.MaxSizeMB {
			return false
		}
	}
	return true
}
