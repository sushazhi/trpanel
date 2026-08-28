package config

import (
	"fmt"
	"os"
	"path/filepath"
)

// localConfigName 界面保存的连接配置文件名（优先级高于 .env 与 config.yaml）
const localConfigName = ".env.local"

// SaveConnection 将界面配置的连接保存到数据目录（默认 ~/.transmission-manager）
func SaveConnection(dataDir, transmissionURL, user, pass, pollInterval string) error {
	content := fmt.Sprintf("TR_URL=%s\nTR_USER=%s\nTR_PASS=%s\n", transmissionURL, user, pass)
	if pollInterval != "" {
		content += fmt.Sprintf("POLL_INTERVAL=%s\n", pollInterval)
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return fmt.Errorf("创建数据目录失败: %w", err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, localConfigName), []byte(content), 0o600); err != nil {
		return fmt.Errorf("保存配置失败: %w", err)
	}
	return nil
}
