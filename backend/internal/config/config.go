package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config 服务配置
type Config struct {
	TransmissionURL string        // Transmission RPC 端点
	User            string        // RPC 用户名
	Password        string        // RPC 密码
	Port            string        // 本服务监听端口
	PollInterval    time.Duration // WebSocket 轮询间隔
	LogLevel        string        // 日志级别 debug/info/warn/error
	DataDir         string        // 数据目录（状态文件存放位置）
}

// Load 加载配置，优先级：环境变量 > .env.local > .env > config.yaml > 默认值
func Load() (*Config, error) {
	v := viper.New()
	v.SetConfigName("config")
	v.SetConfigType("yaml")
	v.AddConfigPath(".")
	v.AddConfigPath("$HOME/.transmission-manager")

	// 默认值
	v.SetDefault("tr_url", "http://localhost:9091/transmission/rpc")
	v.SetDefault("tr_user", "")
	v.SetDefault("tr_pass", "")
	v.SetDefault("server_port", 8080)
	v.SetDefault("poll_interval", "2s")
	v.SetDefault("log_level", "info")
	v.SetDefault("data_dir", defaultDataDir())

	// 配置文件（可选）
	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("读取配置文件失败: %w", err)
		}
	}

	// 数据目录（TM_DATA_DIR > config.yaml > 默认家目录），用于定位 .env/.env.local
	dataDir := expandPath(v.GetString("data_dir"))
	if envDir := os.Getenv("TM_DATA_DIR"); envDir != "" {
		dataDir = expandPath(envDir)
	}

	// .env / .env.local 文件（可选，后者优先级更高，界面保存的连接配置写入数据目录；
	// 兼容旧版本：当前工作目录的同名文件也读取，后加载的覆盖先加载的）
	envCandidates := []string{".env", ".env.local",
		filepath.Join(dataDir, ".env"), filepath.Join(dataDir, ".env.local")}
	for _, envName := range envCandidates {
		if _, err := os.Stat(envName); err == nil {
			envFile := viper.New()
			envFile.SetConfigFile(envName)
			envFile.SetConfigType("env")
			if err := envFile.ReadInConfig(); err == nil {
				for _, k := range envFile.AllKeys() {
					v.Set(k, envFile.Get(k))
				}
			}
		}
	}

	// 环境变量覆盖（最高优先级）
	envKeys := map[string]string{
		"tr_url":        "TR_URL",
		"tr_user":       "TR_USER",
		"tr_pass":       "TR_PASS",
		"server_port":   "SERVER_PORT",
		"poll_interval": "POLL_INTERVAL",
		"log_level":     "LOG_LEVEL",
		"data_dir":      "TM_DATA_DIR",
	}
	for key, env := range envKeys {
		if val, ok := os.LookupEnv(env); ok {
			v.Set(key, val)
		}
	}

	dur, err := time.ParseDuration(v.GetString("poll_interval"))
	if err != nil {
		return nil, fmt.Errorf("poll_interval 格式无效: %w", err)
	}

	return &Config{
		TransmissionURL: v.GetString("tr_url"),
		User:            v.GetString("tr_user"),
		Password:        v.GetString("tr_pass"),
		Port:            fmt.Sprintf("%d", v.GetInt("server_port")),
		PollInterval:    dur,
		LogLevel:        v.GetString("log_level"),
		DataDir:         dataDir,
	}, nil
}

// defaultDataDir 默认数据目录为 ~/.transmission-manager（与 config.yaml 搜索路径一致），
// 避免运行时生成的状态/配置文件落在代码或部署目录
func defaultDataDir() string {
	if home, err := os.UserHomeDir(); err == nil {
		return filepath.Join(home, ".transmission-manager")
	}
	return "."
}

// expandPath 展开路径中的 ~ 与 $HOME 等环境变量
func expandPath(p string) string {
	if p == "" {
		return p
	}
	if strings.HasPrefix(p, "~") {
		if home, err := os.UserHomeDir(); err == nil {
			p = filepath.Join(home, strings.TrimPrefix(p, "~"))
		}
	}
	return os.ExpandEnv(p)
}
