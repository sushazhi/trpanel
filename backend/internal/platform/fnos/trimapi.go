package fnos

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
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
	Code int            `json:"code"`
	Msg  string         `json:"msg"`
	Data trimConvertRes `json:"data"`
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
		m, err := t.convertBatch(ctx, uniq[start:end], language)
		if err != nil {
			return nil, err
		}
		for k, v := range m {
			out[k] = v
		}
	}
	return out, nil
}

func (t *trimPathClient) convertBatch(ctx context.Context, batch []string, language string) (map[string]string, error) {
	body, err := json.Marshal(trimConvertReq{
		ReqID:   trimReqID(),
		Req:     trimConvertEndpoint,
		AppName: trimAppName,
		Data:    trimConvertData{Path: batch, Language: language},
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
		return nil, fmt.Errorf("trim api 状态码 %d", resp.StatusCode)
	}
	// 网关拦截（如会话失效）会返回 200 + 非 JSON body，同样在此归并为错误
	var env trimEnvelope
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return nil, fmt.Errorf("trim api 响应解析失败: %w", err)
	}
	if env.Code != 0 {
		return nil, fmt.Errorf("trim api 错误: %s", env.Msg)
	}
	if env.Data.Status != 0 {
		return nil, fmt.Errorf("trim api 转换状态 %d", env.Data.Status)
	}
	out := make(map[string]string, len(env.Data.Result))
	for _, r := range env.Data.Result {
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
