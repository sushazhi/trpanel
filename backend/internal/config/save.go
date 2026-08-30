package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// localConfigName 界面保存的连接配置文件名（优先级高于 .env 与 config.yaml）
const localConfigName = ".env.local"

// ValidateEnvValue 校验会写入 .env.local 的字段值。
// dotenv 按行解析，而 .env.local 的优先级高于 config.yaml 与进程环境，
// 值里带换行就会被解析成一个新键 —— 例如密码填 "x\nAPI_TOKEN=y" 可直接注入鉴权令牌、
// SERVER_HOST（改成全网卡监听）或 TORRENT_PATH_ROOTS（放开文件读取白名单）。
func ValidateEnvValue(name, value string) error {
	if strings.ContainsAny(value, "\r\n\x00") {
		return fmt.Errorf("%s 不能包含换行或空字符", name)
	}
	return nil
}

// SaveConnection 将界面配置的连接保存到数据目录（默认 ~/.transmission-manager）
func SaveConnection(dataDir, transmissionURL, user, pass, pollInterval string) error {
	for _, f := range []struct{ name, value string }{
		{"TR_URL", transmissionURL},
		{"TR_USER", user},
		{"TR_PASS", pass},
		{"POLL_INTERVAL", pollInterval},
	} {
		if err := ValidateEnvValue(f.name, f.value); err != nil {
			return err
		}
	}
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
