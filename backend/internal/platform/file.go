package platform

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
)

// fileAccess 「按路径添加种子」的读取策略实现
type fileAccess struct {
	enabled  bool
	prefixes []string
}

// NewFileAccess 构造文件访问策略。
// enabled=false 时一律拒绝；prefixes 非空时仅允许这些前缀下的文件（含前缀自身）。
func NewFileAccess(enabled bool, prefixes []string) FileAccess {
	return &fileAccess{enabled: enabled, prefixes: prefixes}
}

func (f *fileAccess) Enabled() bool { return f.enabled }

func (f *fileAccess) AllowRead(path string) error {
	if !f.enabled {
		return errors.New("当前部署未启用「按路径添加种子」，请改用文件上传或链接")
	}
	if strings.TrimSpace(path) == "" {
		return errors.New("种子路径为空")
	}
	if strings.ContainsRune(path, 0) {
		return errors.New("种子路径含非法字符")
	}
	clean := filepath.Clean(path)
	// 路径穿越：Clean 之后仍以 .. 开头（如 ../../etc/passwd）
	if clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return errors.New("种子路径不允许越权访问上级目录")
	}
	if len(f.prefixes) == 0 {
		return nil
	}
	for _, prefix := range f.prefixes {
		p := filepath.Clean(prefix)
		if clean == p || strings.HasPrefix(clean, p+string(filepath.Separator)) {
			return nil
		}
	}
	return fmt.Errorf("种子路径不在允许范围内（仅允许：%s）", strings.Join(f.prefixes, "、"))
}
