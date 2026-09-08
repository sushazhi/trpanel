package fnos

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strconv"
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
	ReqID   string          `json:"reqId"`
	Req     string          `json:"req"`
	AppName string          `json:"appName"`
	Data    trimConvertData `json:"data"`
}

type trimConvertData struct {
	Path     []string `json:"path"`
	Language string   `json:"language"`
}

type trimEnvelope struct {
	Code int             `json:"code"`
	Msg  string          `json:"msg"`
	Data json.RawMessage `json:"data"`
}

type trimConvertRes struct {
	Status int             `json:"status"`
	Result []trimConverted `json:"result"`
}

type trimConverted struct {
	Path         string `json:"path"`
	SemanticPath string `json:"semanticPath"`
}

// convertPath 的 data 字段存在两种格式（生产环境实测，参考 fnos-logmanager）：
// 1. 数组：[{path, semanticPath}, ...] —— 实际网关的返回；
// 2. 对象：{status, result: [...]} —— 文档描述格式，部分版本如此返回。
// 若只按其中一种解析，真机上可能解码失败并被误判为「开放 API 不可用」。
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

// Convert 批量把内部路径转成语义路径，返回 原始路径→语义路径 映射；宿主未返回的项不写入映射。
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
	for start := 0; start < len(uniq); start += trimBatchSize {
		end := min(start+trimBatchSize, len(uniq))
		m, err := t.convert(ctx, trimConvertData{Path: uniq[start:end], Language: language})
		if err != nil {
			return nil, err
		}
		for k, v := range m {
			out[k] = v
		}
	}
	return out, nil
}

func (t *trimPathClient) convert(ctx context.Context, data trimConvertData) (map[string]string, error) {
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
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+t.token())
	resp, err := t.do.Do(req)
	if err != nil {
		return nil, fmt.Errorf("trim api 请求失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		// 带上响应体片段（含 code/msg），否则仅有状态码无法定位宿主侧原因
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

// trimReqID 请求关联 ID。用纯十进制数字（与宿主自身 reqId 同形，
// 与生产验证过的 fnos-logmanager 实现一致），避免网关解析异常。
func trimReqID() string {
	return strconv.FormatInt(time.Now().UnixNano(), 10)
}
