package rpc

import "regexp"

// userinfoRe 匹配带凭据的 URL userinfo（形如 http://user:pass@host）。
var userinfoRe = regexp.MustCompile(`(?i)(https?://)[^\s/"?#]*@`)

// SanitizeClientMsg 收敛回传给客户端的错误文本。
// RPC 客户端用 URL userinfo 承载认证，底层 *url.Error 会把完整 URL 打进错误字符串，
// 而 REST/MCP 各接口习惯把 err.Error() 原样回传——不抹掉就等于把 Transmission 密码发给调用方。
func SanitizeClientMsg(msg string) string {
	msg = userinfoRe.ReplaceAllString(msg, "$1***@")
	if r := []rune(msg); len(r) > 512 {
		msg = string(r[:512]) + "…"
	}
	return msg
}
