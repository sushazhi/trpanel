package api

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

// newID 生成带前缀的唯一 ID（时间戳 + 随机）
func newID(prefix string) string {
	buf := make([]byte, 4)
	_, _ = rand.Read(buf)
	return prefix + "-" + hex.EncodeToString(buf) + "-" + time.Now().Format("150405")
}
