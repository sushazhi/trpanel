package api

import (
	"crypto/rand"
	"encoding/hex"
	"regexp"
	"time"
)

// userinfoRe 匹配带凭据的 URL userinfo（形如 http://user:pass@host）。
var userinfoRe = regexp.MustCompile(`(?i)(https?://)[^\s/"?#]*@`)

// sanitizeClientMsg 收敛回传给客户端的错误文本。
// RPC 客户端用 URL userinfo 承载认证，底层 *url.Error 会把完整 URL 打进错误字符串，
// 而各接口习惯把 err.Error() 原样回传——不抹掉就等于把 Transmission 密码发给调用方。
func sanitizeClientMsg(msg string) string {
	msg = userinfoRe.ReplaceAllString(msg, "$1***@")
	if r := []rune(msg); len(r) > 512 {
		msg = string(r[:512]) + "…"
	}
	return msg
}

// newID 生成带前缀的唯一 ID（时间戳 + 随机）
func newID(prefix string) string {
	buf := make([]byte, 4)
	_, _ = rand.Read(buf)
	return prefix + "-" + hex.EncodeToString(buf) + "-" + time.Now().Format("150405")
}
