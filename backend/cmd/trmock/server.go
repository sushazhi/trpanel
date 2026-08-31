package main

import (
	"bytes"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"path"
	"strings"
	"time"
)

const csrfHeader = "X-Transmission-Session-Id"

// Server trmock 的 HTTP 层：鉴权、CSRF、tag 回显、方法分发。
type Server struct {
	store     *Store
	sessionID string
	user      string
	pass      string
	csrf      bool
}

// NewServer 构造 Server。user/pass 为空则不启用 Basic 鉴权；csrf 控制 409 握手。
func NewServer(store *Store, user, pass string, csrf bool) *Server {
	return &Server{store: store, sessionID: newToken(), user: user, pass: pass, csrf: csrf}
}

func newToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "trmock-session"
	}
	return hex.EncodeToString(b)
}

type rpcRequest struct {
	Method    string         `json:"method"`
	Arguments map[string]any `json:"arguments"`
	Tag       *int           `json:"tag"`
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// 可选 Basic 鉴权
	if s.user != "" {
		u, p, ok := r.BasicAuth()
		if !ok || subtle.ConstantTimeCompare([]byte(u), []byte(s.user)) != 1 ||
			subtle.ConstantTimeCompare([]byte(p), []byte(s.pass)) != 1 {
			w.Header().Set("WWW-Authenticate", `Basic realm="trmock"`)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
	}
	// CSRF 会话握手：缺失/不匹配即 409 并下发 token，客户端会自动重试
	if s.csrf {
		if r.Header.Get(csrfHeader) != s.sessionID {
			w.Header().Set(csrfHeader, s.sessionID)
			http.Error(w, "conflict: wrong session id", http.StatusConflict)
			return
		}
	}

	var req rpcRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeEnvelope(w, nil, "invalid request body", nil)
		return
	}

	args, errMsg := s.dispatch(req.Method, req.Arguments)
	writeEnvelope(w, args, errMsg, req.Tag)
}

// writeEnvelope 输出 {arguments, result, tag}；tag 仅在请求携带时回显，
// 以同时满足库调用（必校验）与 RawCall（不带 tag）。
func writeEnvelope(w http.ResponseWriter, args map[string]any, errMsg string, tag *int) {
	resp := map[string]any{}
	if args != nil {
		resp["arguments"] = args
	}
	if errMsg != "" {
		resp["result"] = errMsg
	} else {
		resp["result"] = "success"
	}
	if tag != nil {
		resp["tag"] = *tag
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// dispatch 把 RPC 方法映射到 Store 操作，返回 arguments 或错误文案。
func (s *Server) dispatch(method string, args map[string]any) (map[string]any, string) {
	switch method {
	case "session-get":
		return s.store.SessionWire(s.sessionID), ""
	case "session-set":
		s.store.SetSession(args)
		return map[string]any{}, ""
	case "session-stats":
		return s.store.statsWire(), ""
	case "session-close":
		return map[string]any{}, ""
	case "torrent-get":
		fields := parseFields(args["fields"])
		ids := parseIDs(args["ids"])
		return map[string]any{"torrents": s.store.TorrentsWire(ids, fields)}, ""
	case "torrent-add":
		return s.addTorrent(args)
	case "torrent-start", "torrent-start-now":
		s.store.Start(parseIDs(args["ids"]), method == "torrent-start-now")
		return map[string]any{}, ""
	case "torrent-stop":
		s.store.Stop(parseIDs(args["ids"]))
		return map[string]any{}, ""
	case "torrent-verify":
		s.store.Verify(parseIDs(args["ids"]))
		return map[string]any{}, ""
	case "torrent-reannounce":
		s.store.Reannounce(parseIDs(args["ids"]))
		return map[string]any{}, ""
	case "torrent-remove":
		s.store.Remove(parseIDs(args["ids"]))
		return map[string]any{}, ""
	case "torrent-set":
		ids := parseIDs(args["ids"])
		s.store.Set(ids, args)
		return map[string]any{}, ""
	case "torrent-set-location":
		loc, _ := args["location"].(string)
		s.store.SetLocation(parseIDs(args["ids"]), loc)
		return map[string]any{}, ""
	case "torrent-rename-path":
		p, _ := args["path"].(string)
		name, _ := args["name"].(string)
		s.store.RenamePath(parseIDs(args["ids"]), p, name)
		return map[string]any{}, ""
	case "queue-move-top", "queue-move-up", "queue-move-down", "queue-move-bottom":
		dir := strings.TrimPrefix(method, "queue-move-")
		s.store.QueueMove(parseIDs(args["ids"]), dir)
		return map[string]any{}, ""
	case "free-space":
		p, _ := args["path"].(string)
		return freeSpaceWire(p), ""
	case "port-test":
		return map[string]any{"port-is-open": true}, ""
	case "blocklist-update":
		return map[string]any{"blocklist-size": s.store.BlocklistUpdate()}, ""
	default:
		return nil, fmt.Sprintf("method %q not recognized", method)
	}
}

// addTorrent 处理 torrent-add：优先从 filename 派生名称，metainfo（base64 的
// .torrent 内容）则做一次轻量 bencode 扫描提取 info.name，让新增行显示真实名称。
func (s *Server) addTorrent(args map[string]any) (map[string]any, string) {
	name := ""
	if fn, ok := args["filename"].(string); ok && fn != "" {
		name = cleanName(fn)
	}
	if name == "" {
		if mi, ok := args["metainfo"].(string); ok {
			name = nameFromMetaInfo(mi)
		}
	}
	if name == "" {
		name = fmt.Sprintf("Added-%d", timeNowUnix())
	}
	dir, _ := args["download-dir"].(string)
	paused, _ := args["paused"].(bool)
	labels := []string{}
	if raw, ok := args["labels"].([]any); ok {
		labels = toStringSlice(raw)
	}
	wire := s.store.AddWire(name, dir, paused, labels)
	return map[string]any{"torrent-added": wire}, ""
}

func cleanName(fn string) string {
	if i := strings.Index(fn, "?"); i >= 0 {
		fn = fn[:i]
	}
	if strings.HasPrefix(fn, "magnet:") {
		return "Magnet-" + shortHash(fn)
	}
	base := path.Base(fn)
	if base == "." || base == "/" || base == "" {
		return ""
	}
	return base
}

func shortHash(s string) string {
	h := make([]byte, 0, 8)
	for i := 0; i < len(s) && len(h) < 8; i++ {
		c := s[i]
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') {
			h = append(h, c)
		}
	}
	if len(h) == 0 {
		return "torrent"
	}
	return string(h)
}

// nameFromMetaInfo 对 base64 编码的 .torrent 做轻量 bencode 扫描，
// 取 info 字典里 "4:name" 键对应的字符串；任何异常都返回空串走兜底命名。
func nameFromMetaInfo(b64 string) string {
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return ""
	}
	idx := bytes.Index(raw, []byte("4:name"))
	if idx < 0 {
		return ""
	}
	rest := raw[idx+len("4:name"):]
	colon := bytes.IndexByte(rest, ':')
	if colon <= 0 || colon > 10 {
		return ""
	}
	n := 0
	for _, c := range rest[:colon] {
		if c < '0' || c > '9' {
			return ""
		}
		n = n*10 + int(c-'0')
	}
	if n <= 0 || n > 512 || colon+1+n > len(rest) {
		return ""
	}
	return string(rest[colon+1 : colon+1+n])
}

// parseFields 把 []any 形式的字段列表转成 []string。
func parseFields(v any) []string {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, x := range arr {
		if str, ok := x.(string); ok {
			out = append(out, str)
		}
	}
	return out
}

// parseIDs 把 ids（[]any 数字）转成 []int64；缺省返回 nil（= 全部）。
func parseIDs(v any) []int64 {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]int64, 0, len(arr))
	for _, x := range arr {
		switch n := x.(type) {
		case float64:
			out = append(out, int64(n))
		case int64:
			out = append(out, n)
		case int:
			out = append(out, int64(n))
		}
	}
	return out
}

func timeNowUnix() int64 {
	return time.Now().Unix()
}
