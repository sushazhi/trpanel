package fnos

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
)

func newTestClient(srv *httptest.Server, token string) *trimPathClient {
	return &trimPathClient{base: srv.URL, do: srv.Client(), token: func() string { return token }}
}

func TestTrimPathConvertSuccess(t *testing.T) {
	var gotAuth, gotReq, gotLang, gotAppName string
	var gotPaths []string
	var gotReqID string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		var req trimConvertReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("decode request: %v", err)
			return
		}
		gotReq, gotLang, gotPaths, gotAppName, gotReqID = req.Req, req.Data.Language, req.Data.Path, req.AppName, req.ReqID
		_ = json.NewEncoder(w).Encode(map[string]any{
			"reqId": req.ReqID, "code": 0, "msg": "",
			"data": []map[string]string{
				{"path": "/vol1/1000/photo", "semanticPath": "存储空间1/admin 的文件/photo"},
				{"path": "/vol1/1000/missing", "semanticPath": ""},
			},
		})
	}))
	defer srv.Close()

	c := newTestClient(srv, "tok")
	m, err := c.Convert(context.Background(), []string{"/vol1/1000/photo", "/vol1/1000/missing", "/vol1/1000/photo"}, "zh-CN")
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}
	if gotAuth != "Bearer tok" {
		t.Errorf("Authorization = %q", gotAuth)
	}
	if gotReq != trimConvertEndpoint || gotAppName != "transmission" {
		t.Errorf("req = %q, appName = %q", gotReq, trimAppName)
	}
	if gotLang != "zh-CN" {
		t.Errorf("language = %q", gotLang)
	}
	// reqId 必须是纯十进制数字（与宿主/生产客户端一致，避免网关解析异常）
	if _, err := strconv.ParseInt(gotReqID, 10, 64); err != nil {
		t.Errorf("reqId 应为十进制数字，实际 %q", gotReqID)
	}
	if len(gotPaths) != 2 {
		t.Errorf("去重后应剩 2 个路径，实际 %d: %v", len(gotPaths), gotPaths)
	}
	if m["/vol1/1000/photo"] != "存储空间1/admin 的文件/photo" {
		t.Errorf("semantic map = %v", m)
	}
	if _, ok := m["/vol1/1000/missing"]; ok {
		t.Error("宿主未返回 semanticPath 的项不应写入映射")
	}
}

// 数组格式 data：真实网关的返回格式，必须能正确解析
func TestTrimPathConvertArrayData(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"code": 0, "msg": "",
			"data": []map[string]string{
				{"path": "/vol1/1000/photo", "semanticPath": "存储空间1/admin 的文件/photo"},
				{"path": "/vol1/1000/missing", "semanticPath": ""},
			},
		})
	}))
	defer srv.Close()

	m, err := newTestClient(srv, "tok").Convert(context.Background(), []string{"/vol1/1000/photo"}, "zh-CN")
	if err != nil {
		t.Fatalf("数组格式 data 应解析成功: %v", err)
	}
	if m["/vol1/1000/photo"] != "存储空间1/admin 的文件/photo" {
		t.Errorf("semantic map = %v", m)
	}
	if _, ok := m["/vol1/1000/missing"]; ok {
		t.Error("宿主未返回 semanticPath 的项不应写入映射")
	}
}

func TestTrimPathConvertErrors(t *testing.T) {
	cases := []struct {
		name    string
		status  int
		body    string
		wantErr string
	}{
		{"非200带响应体", http.StatusInternalServerError, `{"code":200006,"msg":"Internal Error","data":null}`, `状态码 500: {"code":200006`},
		{"网关拦截非JSON", http.StatusOK, "invalid token", "响应解析失败"},
		{"code非0", http.StatusOK, `{"code":401,"msg":"token invalid"}`, "token invalid"},
		{"status非0", http.StatusOK, `{"code":0,"data":{"status":2,"result":[]}}`, "转换状态 2"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer srv.Close()
			_, err := newTestClient(srv, "tok").Convert(context.Background(), []string{"/vol1/a"}, "zh-CN")
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("期望错误含 %q，实际 %v", tc.wantErr, err)
			}
		})
	}
}

func TestTrimPathConvertNoToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("无 token 时不应发起请求")
	}))
	defer srv.Close()
	_, err := newTestClient(srv, "").Convert(context.Background(), []string{"/vol1/a"}, "zh-CN")
	if !errors.Is(err, ErrTrimUnavailable) {
		t.Fatalf("期望 ErrTrimUnavailable，实际 %v", err)
	}
}

func TestTrimPathConvertEmpty(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("空入参不应发起请求")
	}))
	defer srv.Close()
	m, err := newTestClient(srv, "tok").Convert(context.Background(), nil, "zh-CN")
	if err != nil || len(m) != 0 {
		t.Fatalf("空入参应返回空映射，实际 %v, %v", m, err)
	}
}

func TestTrimPathConvertBatching(t *testing.T) {
	var calls atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var req trimConvertReq
		_ = json.NewDecoder(r.Body).Decode(&req)
		if len(req.Data.Path) > trimBatchSize {
			t.Errorf("单批 %d 超过上限 %d", len(req.Data.Path), trimBatchSize)
		}
		result := make([]map[string]string, 0, len(req.Data.Path))
		for _, p := range req.Data.Path {
			result = append(result, map[string]string{"path": p, "semanticPath": "语义/" + p})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"code": 0, "data": map[string]any{"status": 0, "result": result},
		})
	}))
	defer srv.Close()

	paths := make([]string, 0, trimBatchSize*2+2)
	for i := 0; i < trimBatchSize*2+2; i++ {
		paths = append(paths, "/vol1/1000/dir"+string(rune('a'+i%26))+string(rune('a'+i/26)))
	}
	m, err := newTestClient(srv, "tok").Convert(context.Background(), paths, "zh-CN")
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}
	if got := calls.Load(); got != 3 {
		t.Errorf("130 个路径应分 3 批，实际 %d", got)
	}
	if len(m) != len(paths) {
		t.Errorf("映射应覆盖 %d 项，实际 %d", len(paths), len(m))
	}
}

func TestNormalizeLanguage(t *testing.T) {
	cases := map[string]string{
		"zh": "zh-CN", "": "zh-CN", "ZH-cn": "zh-CN", "未知": "zh-CN",
		"en": "en-US", "en-US": "en-US",
	}
	for in, want := range cases {
		if got := normalizeLanguage(in); got != want {
			t.Errorf("normalizeLanguage(%q) = %q, 期望 %q", in, got, want)
		}
	}
}

func TestTrimPathConvertOverUnixSocket(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("unix socket 不适用于 Windows 开发机")
	}
	dir, err := os.MkdirTemp("", "trimsock")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	sock := filepath.Join(dir, "t.sock")
	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatal(err)
	}
	srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"code": 0, "data": map[string]any{"status": 0, "result": []map[string]string{
				{"path": "/vol1/1000/photo", "semanticPath": "存储空间1/photo"},
			}},
		})
	})}
	go func() { _ = srv.Serve(ln) }()
	t.Cleanup(func() { _ = srv.Close(); _ = ln.Close() })

	c := &trimPathClient{
		base:   trimAPIURL,
		socket: sock,
		do: &http.Client{Transport: &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(ctx, "unix", sock)
		}}},
		token: func() string { return "tok" },
	}
	m, err := c.Convert(context.Background(), []string{"/vol1/1000/photo"}, "zh-CN")
	if err != nil || m["/vol1/1000/photo"] != "存储空间1/photo" {
		t.Fatalf("unix socket 转换失败: %v, %v", m, err)
	}
}
