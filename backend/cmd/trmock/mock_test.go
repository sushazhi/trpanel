package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// call 向 handler 发送一次 RPC（关闭 CSRF 便于直测），返回解析后的 arguments。
func call(t *testing.T, h http.Handler, method string, args map[string]any, tag int) map[string]any {
	t.Helper()
	body := map[string]any{"method": method, "tag": tag}
	if args != nil {
		body["arguments"] = args
	}
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/transmission/rpc", bytes.NewReader(raw))
	req.Header.Set(csrfHeader, "") // 由下面的 helper 决定是否注入
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("method %s: HTTP %d body=%s", method, w.Code, w.Body.String())
	}
	var resp struct {
		Result    string         `json:"result"`
		Arguments map[string]any `json:"arguments"`
		Tag       *int           `json:"tag"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("method %s: 解析响应失败 %v", method, err)
	}
	if resp.Result != "success" {
		t.Fatalf("method %s: result=%q", method, resp.Result)
	}
	if resp.Tag == nil || *resp.Tag != tag {
		t.Fatalf("method %s: tag 未回显，得到 %v 期望 %d", method, resp.Tag, tag)
	}
	return resp.Arguments
}

func newTestServer(t *testing.T) *Server {
	t.Helper()
	return NewServer(NewStore(6), "", "", false) // 关闭 CSRF 便于直测
}

func TestSessionGetHasVersion(t *testing.T) {
	s := newTestServer(t)
	args := call(t, s, "session-get", nil, 1)
	if v, ok := args["version"].(string); !ok || v == "" {
		t.Fatalf("session-get 缺少 version: %v", args["version"])
	}
	if _, ok := args["download-dir"]; !ok {
		t.Fatalf("session-get 缺少 download-dir")
	}
}

func TestTorrentGetListAndFields(t *testing.T) {
	s := newTestServer(t)
	args := call(t, s, "torrent-get", map[string]any{
		"fields": []any{"id", "name", "status", "percentDone", "labels"},
	}, 2)
	list, ok := args["torrents"].([]any)
	if !ok || len(list) == 0 {
		t.Fatalf("torrent-get 未返回 torrents")
	}
	first, ok := list[0].(map[string]any)
	if !ok {
		t.Fatalf("torrents[0] 不是对象")
	}
	for _, key := range []string{"id", "name", "status", "percentDone", "labels"} {
		if _, ok := first[key]; !ok {
			t.Fatalf("torrents[0] 缺少字段 %q", key)
		}
	}
	if _, hasPieces := first["pieces"]; hasPieces {
		t.Fatalf("字段过滤失效：列表请求不应返回 pieces")
	}
}

func TestStopTorrentReflects(t *testing.T) {
	s := newTestServer(t)
	// 取第一个种子 id
	args := call(t, s, "torrent-get", map[string]any{"fields": []any{"id", "status"}}, 3)
	list := args["torrents"].([]any)
	first := list[0].(map[string]any)
	id := int64(first["id"].(float64))

	call(t, s, "torrent-stop", map[string]any{"ids": []any{float64(id)}}, 4)

	after := call(t, s, "torrent-get", map[string]any{
		"fields": []any{"id", "status"}, "ids": []any{float64(id)},
	}, 5)
	got := after["torrents"].([]any)
	if len(got) != 1 {
		t.Fatalf("按 id 过滤应返回 1 条，得到 %d", len(got))
	}
	st := got[0].(map[string]any)["status"].(float64)
	if int(st) != stStopped {
		t.Fatalf("torrent-stop 后状态应为 %d，得到 %v", stStopped, st)
	}
}

func TestAddAndRemove(t *testing.T) {
	s := newTestServer(t)
	addArgs := call(t, s, "torrent-add", map[string]any{
		"filename": "https://example.com/some.torrent",
		"paused":   true,
	}, 6)
	added, ok := addArgs["torrent-added"].(map[string]any)
	if !ok {
		t.Fatalf("torrent-add 未返回 torrent-added")
	}
	id := int64(added["id"].(float64))
	if name, _ := added["name"].(string); !strings.Contains(name, "some.torrent") {
		t.Fatalf("新增种子名称异常: %q", name)
	}

	// 删除后应查不到
	call(t, s, "torrent-remove", map[string]any{"ids": []any{float64(id)}}, 7)
	after := call(t, s, "torrent-get", map[string]any{
		"fields": []any{"id"}, "ids": []any{float64(id)},
	}, 8)
	if n := len(after["torrents"].([]any)); n != 0 {
		t.Fatalf("删除后应查不到该种子，仍有 %d 条", n)
	}
}

func TestSessionStatsAndFreeSpace(t *testing.T) {
	s := newTestServer(t)
	stats := call(t, s, "session-stats", nil, 9)
	if _, ok := stats["torrentCount"]; !ok {
		t.Fatalf("session-stats 缺 torrentCount")
	}
	if _, ok := stats["current-stats"].(map[string]any); !ok {
		t.Fatalf("session-stats 缺 current-stats")
	}
	fs := call(t, s, "free-space", map[string]any{"path": "/downloads"}, 10)
	if fs["path"] != "/downloads" {
		t.Fatalf("free-space path 未回传")
	}
	if _, ok := fs["size-bytes"]; !ok {
		t.Fatalf("free-space 缺 size-bytes")
	}
}

func TestCSRFHandshake(t *testing.T) {
	s := NewServer(NewStore(2), "", "", true) // 开启 CSRF
	raw, _ := json.Marshal(map[string]any{"method": "session-get", "tag": 1})

	// 首次无 token -> 409 并下发 header
	req := httptest.NewRequest(http.MethodPost, "/transmission/rpc", bytes.NewReader(raw))
	w := httptest.NewRecorder()
	s.ServeHTTP(w, req)
	if w.Code != http.StatusConflict {
		t.Fatalf("首次请求应 409，得到 %d", w.Code)
	}
	token := w.Header().Get(csrfHeader)
	if token == "" {
		t.Fatalf("409 响应未携带 %s", csrfHeader)
	}

	// 携带 token -> 200 success
	req2 := httptest.NewRequest(http.MethodPost, "/transmission/rpc", bytes.NewReader(raw))
	req2.Header.Set(csrfHeader, token)
	w2 := httptest.NewRecorder()
	s.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("携带 token 应 200，得到 %d", w2.Code)
	}
}

func TestSimulationAdvances(t *testing.T) {
	store := NewStore(3)
	// 强制一个下载中种子并记录初始已下载量
	store.mu.Lock()
	var target *mockTorrent
	for _, tt := range store.torrents {
		tt.Status = stStopped
	}
	target = store.torrents[0]
	target.Status = stDownload
	target.PercentDone = 0.1
	target.HaveValid = target.TotalSize / 10
	target.baseDown = 5 * 1024 * 1024
	before := target.DownloadedEver
	store.mu.Unlock()

	store.Step(2 * time.Second)

	store.mu.Lock()
	after := target.DownloadedEver
	store.mu.Unlock()
	if after <= before {
		t.Fatalf("模拟未推进：downloadedEver before=%d after=%d", before, after)
	}
}

func TestSequentialDownloadRoundTrip(t *testing.T) {
	s := newTestServer(t)
	args := call(t, s, "torrent-get", map[string]any{"fields": []any{"id"}}, 1)
	id := int64(args["torrents"].([]any)[0].(map[string]any)["id"].(float64))

	call(t, s, "torrent-set", map[string]any{
		"ids": []any{float64(id)}, "sequentialDownload": true,
	}, 2)

	got := call(t, s, "torrent-get", map[string]any{
		"fields": []any{"id", "sequentialDownload"}, "ids": []any{float64(id)},
	}, 3)
	first := got["torrents"].([]any)[0].(map[string]any)
	if v, ok := first["sequentialDownload"].(bool); !ok || !v {
		t.Fatalf("sequentialDownload 未生效: %v", first["sequentialDownload"])
	}
}

func TestQueueMoveReorder(t *testing.T) {
	s := newTestServer(t)
	args := call(t, s, "torrent-get", map[string]any{"fields": []any{"id", "queuePosition"}}, 1)
	list := args["torrents"].([]any)
	if len(list) < 3 {
		t.Fatalf("至少需要 3 个种子，得到 %d", len(list))
	}
	// 取队首种子移到队底
	firstID := list[0].(map[string]any)["id"].(float64)
	call(t, s, "queue-move-bottom", map[string]any{"ids": []any{firstID}}, 2)

	got := call(t, s, "torrent-get", map[string]any{"fields": []any{"id", "queuePosition"}}, 3)
	after := got["torrents"].([]any)
	posByID := map[float64]float64{}
	for _, item := range after {
		m := item.(map[string]any)
		posByID[m["id"].(float64)] = m["queuePosition"].(float64)
	}
	if posByID[firstID] != float64(len(after)-1) {
		t.Fatalf("bottom 后队首种子应位于末尾 %d，得到 %v", len(after)-1, posByID[firstID])
	}
	// 位置应重新编号为 0..n-1 且不重复
	seen := map[float64]bool{}
	for _, p := range posByID {
		if seen[p] {
			t.Fatalf("队列位置重复: %v", p)
		}
		seen[p] = true
	}
}

func TestMetainfoNameExtraction(t *testing.T) {
	s := newTestServer(t)
	// 极简 bencode：d4:infod6:lengthi1000e4:name12:demo torrent ee
	metainfo := base64.StdEncoding.EncodeToString([]byte("d4:infod6:lengthi1000e4:name12:demo torrent ee"))
	added := call(t, s, "torrent-add", map[string]any{"metainfo": metainfo, "paused": true}, 1)
	wire, ok := added["torrent-added"].(map[string]any)
	if !ok {
		t.Fatalf("torrent-add 未返回 torrent-added")
	}
	if name, _ := wire["name"].(string); name != "demo torrent" {
		t.Fatalf("metainfo 名称提取异常: %q", name)
	}
}
