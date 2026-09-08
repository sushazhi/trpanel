package fnos

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

// trim.file.convertPath：把 Transmission 报上来的内部路径（/vol1/...）转成宿主语义路径。
// 官方规范：token 每次从进程环境读取，不持久化、不打印；错误信息不得包含 token。
const (
	trimConvertEndpoint = "trim.file.convertPath"
	trimAppName         = "transmission"
	trimAPIURL          = "http://localhost/api/v1/trimapp"
	trimSocketEnv       = "TRIM_API_SOCKET"
	defaultTrimSocket   = "/var/run/trim_open_gateway_apiscope.socket"
	trimBatchSize       = 64
	trimRequestTimeout  = 5 * time.Second
)

// ErrTrimUnavailable 表示开放 API 无法使用（无 token 等），调用方应按「不可用」处理而非故障
var ErrTrimUnavailable = errors.New("trim open api unavailable")

type trimPathClient struct {
	base   string
	socket string
	do     *http.Client
	token  func() string
}

func newTrimPathClient() *trimPathClient {
	socket := os.Getenv(trimSocketEnv)
	if socket == "" {
		socket = defaultTrimSocket
	}
	return &trimPathClient{
		base:   trimAPIURL,
		socket: socket,
		do: &http.Client{
			Timeout: trimRequestTimeout,
			Transport: &http.Transport{
				DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
					var d net.Dialer
					return d.DialContext(ctx, "unix", socket)
				},
			},
		},
		token: func() string { return os.Getenv("TRIM_API_TOKEN") },
	}
}

type trimConvertReq struct {
	ReqID   string `json:"reqId"`
	Req     string `json:"req"`
	AppName string `json:"appName"`
	// Data 按文档为数组形式 {path: [...]}；部分固件仅支持单条字符串形式
	// {path: "..."}，故声明为 any，由调用方选择形态。
	Data any `json:"data"`
}

type trimConvertData struct {
	Path     []string `json:"path"`
	Language string   `json:"language"`
}

// trimConvertDataOne 单条字符串形式的请求 data（部分固件对数组请求返回 500）
type trimConvertDataOne struct {
	Path     string `json:"path"`
	Language string `json:"language"`
}

type trimEnvelope struct {
	Code int             `json:"code"`
	Msg  string          `json:"msg"`
	Data json.RawMessage `json:"data"`
}

// convertPath 的 data 字段存在两种格式（生产环境实测）：
// 1. 数组：[{path, semanticPath}, ...] —— 实际网关的返回；
// 2. 对象：{status, result: [...]} —— 文档描述格式，部分版本如此返回。
// 若只按对象格式解析，真机上会解码失败并被误判为「开放 API 不可用」。
func parseConvertRes(data []byte) (items []trimConverted, status int, ok bool) {
	var arr []trimConverted
	if err := json.Unmarshal(data, &arr); err == nil {
		return arr, 0, true
	}
	var obj trimConvertRes
	if err := json.Unmarshal(data, &obj); err == nil {
		return obj.Result, obj.Status, true
	}
	return nil, 0, false
}

type trimConvertRes struct {
	Status int             `json:"status"`
	Result []trimConverted `json:"result"`
}

type trimConverted struct {
	Path         string `json:"path"`
	SemanticPath string `json:"semanticPath"`
}

// Convert 批量把内部路径转成语义路径，返回 原始路径→语义路径 映射；宿主未返回的项不写入映射。
//
// 兼容策略：文档描述的批量（数组 path）请求在部分固件上返回 500，
// 此时自动降级为逐条（字符串 path）请求；单条失败只跳过该条，
// 不拖垮整批。仅当所有请求都失败时才向上返回错误（让前端按「不可用」处理）。
func (t *trimPathClient) Convert(ctx context.Context, paths []string, language string) (map[string]string, error) {
	if t.token() == "" {
		return nil, ErrTrimUnavailable
	}
	seen := make(map[string]struct{}, len(paths))
	uniq := make([]string, 0, len(paths))
	for _, p := range paths {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if _, ok := seen[p]; !ok {
			seen[p] = struct{}{}
			uniq = append(uniq, p)
		}
	}
	out := make(map[string]string, len(uniq))
	var lastErr error
	for start := 0; start < len(uniq); start += trimBatchSize {
		end := min(start+trimBatchSize, len(uniq))
		batch := uniq[start:end]
		m, err := t.postConvert(ctx, trimConvertData{Path: batch, Language: language})
		if err == nil {
			for k, v := range m {
				out[k] = v
			}
			continue
		}
		lastErr = err
		slog.Warn("语义路径批量转换失败，降级为逐条转换", "err", err)
		for _, p := range batch {
			m1, err1 := t.postConvert(ctx, trimConvertDataOne{Path: p, Language: language})
			if err1 != nil {
				slog.Debug("语义路径单条转换失败", "path", p, "err", err1)
				continue
			}
			for k, v := range m1 {
				out[k] = v
			}
		}
	}
	if len(out) == 0 && len(uniq) > 0 && lastErr != nil {
		return nil, lastErr
	}
	return out, nil
}

func (t *trimPathClient) postConvert(ctx context.Context, data any) (map[string]string, error) {
	body, err := json.Marshal(trimConvertReq{
		ReqID:   trimReqID(),
		Req:     trimConvertEndpoint,
		AppName: trimAppName,
		Data:    data,
	})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, t.base, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+t.token())
	resp, err := t.do.Do(req)
	if err != nil {
		return nil, fmt.Errorf("trim api 请求失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		// 带上响应体片段（含 errno/errmsg），否则状态码无法定位具体原因
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
		return nil, fmt.Errorf("trim api 状态码 %d: %s", resp.StatusCode, strings.TrimSpace(string(snippet)))
	}
	// 网关拦截（如会话失效）会返回 200 + 非 JSON body，同样在此归并为错误
	var env trimEnvelope
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return nil, fmt.Errorf("trim api 响应解析失败: %w", err)
	}
	if env.Code != 0 {
		return nil, fmt.Errorf("trim api 错误: %s", env.Msg)
	}
	items, status, ok := parseConvertRes(env.Data)
	if !ok {
		return nil, fmt.Errorf("trim api 响应 data 格式无法解析")
	}
	if status != 0 {
		return nil, fmt.Errorf("trim api 转换状态 %d", status)
	}
	out := make(map[string]string, len(items))
	for _, r := range items {
		if r.Path != "" && r.SemanticPath != "" {
			out[r.Path] = r.SemanticPath
		}
	}
	return out, nil
}

func trimReqID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}
