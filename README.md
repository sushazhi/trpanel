# Transmission WebUI for fnOS

基于 **Go + React** 重构的 Transmission 现代化 Web 管理界面，**专为飞牛 OS（fnOS）开发**，前后端一体交付。

- **前后端一体**：后端作为 Transmission RPC 代理 + WebSocket 实时推送，前端内嵌打包为单个 Go 可执行文件，开箱即用
- **移动端优先**：自适应桌面/手机/平板
- **飞牛深度集成**：原生文件选择器/主题同步/语义路径；非飞牛环境可运行但自动降级，非主要适配目标

## 目录结构

```
transmission/
├── backend/     # Go 后端（单二进制）
│   ├── cmd/server/              # 入口（解析平台 + 组装服务）
│   ├── internal/
│   │   ├── api/                 # REST API + WebSocket Hub（宿主无关）
│   │   ├── config/              # 配置加载（环境变量/.env/config.yaml）
│   │   ├── middleware/          # CORS、安全头、鉴权（策略由平台提供）
│   │   ├── models/              # 数据结构
│   │   ├── platform/            # 宿主平台抽象
│   │   │   ├── generic.go       # 通用部署（默认，最小权限）
│   │   │   └── fnos/            # 飞牛 fnOS（网关集成 + fpk 更新）
│   │   └── rpc/                 # Transmission RPC 封装 + 热更新管理
│   ├── web/dist/                # 内嵌前端构建产物
│   └── transmission-manager.exe # 已编译产物
└── frontend/   # React + TypeScript 前端
    └── src/
        ├── platform/            # 宿主能力抽象（web / fnos）
        └── ...                  # 组件 / 状态 / 国际化
```

## 如何使用

> 本项目是一个**独立的 Transmission 管理面板**，需要你已有一台运行中的 Transmission（已开启 RPC）。它连接 Transmission 后通过浏览器提供增强界面；**并非 Transmission 本体，也不通过 `TRANSMISSION_WEB_HOME` 替换其自带 Web 界面**。

### 前置条件
- 一台运行中的 Transmission，且已开启 RPC（默认 `http://localhost:9091/transmission/rpc`）。
- 本项目与 Transmission 网络互通（同机，或同一局域网 / 容器网络）。

### 1. 获取程序
- 下载 Release 中的 `transmission-manager-*.zip`，解压到服务器目录即可使用；
- 或自行构建：`cd backend && go build -o transmission-manager ./cmd/server`。

### 2. 配置连接
任选其一（优先级：环境变量 > `.env.local` > `config.yaml` > 默认值）：
- 环境变量（启动前设置）：
  ```bash
  export TR_URL=http://<transmission-ip>:9091/transmission/rpc
  export TR_USER=admin
  export TR_PASS=password
  ```
- 配置文件：以 `backend/config.example.yaml` 为模板创建 `config.yaml` 填写。
- 界面设置：启动后访问面板，在「设置」中填写 RPC 地址 / 账号并保存（自动热更新，无需重启）。

### 3. 运行
```bash
./transmission-manager        # Linux / macOS
transmission-manager.exe      # Windows
```

### 4. 访问
浏览器打开 `http://<服务器IP>:8200`。连接成功后即可添加 / 管理种子，详见下方「使用指南」。

### （可选）从源码构建前端并嵌入
如需自行修改前端界面：
```bash
cd frontend && pnpm install && pnpm build
cd ../backend
Copy-Item ..\frontend\dist\* web\dist\ -Recurse -Force   # PowerShell 将前端产物复制到 web/dist
go build -o transmission-manager ./cmd/server
```

## 本地开发（一键启动）

项目根提供 `dev.ps1`（Windows PowerShell）与 `dev.sh`（Linux/macOS）一键拉起前后端：

```bash
.\dev.ps1          # Windows：前台运行，Ctrl+C 一并退出前后端
.\dev.ps1 -bg      # Windows：后台运行，日志写入 dev/logs/，不占用终端
./dev.sh           # Linux / macOS：前台运行
./dev.sh -bg       # Linux / macOS：后台运行
```

启动后：

- 前端：http://localhost:5173（Vite Dev Server，已代理 `/api`、`/ws` 到后端）
- 后端：http://localhost:8200

**热更新（默认开启，改完即见，无需手动刷新）**

- 前端：Vite HMR + React Fast Refresh，保存 `.tsx` / `.ts` / CSS 后浏览器自动局部更新并尽量保留组件状态。
- 后端：脚本检测到 `air` 时自动启用 Go 热重载，保存 `.go` 后自动重编译重启（前端 WebSocket 会自动重连）。
  安装一次即可：`go install github.com/air-verse/air@latest`（未安装时回退为 `go run`，改动需手动重启）。

特殊环境开关（环境变量）：

| 变量 | 作用 |
| --- | --- |
| `DEV_NO_HMR=1` | 关闭前端 HMR（内嵌 WebView 等环境会阻断 WebSocket） |
| `DEV_WATCH_POLL=1` | 文件监听改用轮询（网络盘 / 虚拟机共享目录 / WSL 挂载目录监听不到事件时） |

**所有开发运行时产物统一写入项目根 `dev/` 目录**，不再散落在代码目录：

```
dev/
├── data/        # 后端状态文件 tm-state.json、界面保存的连接配置 .env.local
└── logs/        # backend.log（后端）、frontend.log（前端）
```

> `dev/` 已在 `.gitignore` 中整体忽略，无需提交。
> 后端数据目录通过环境变量 `TM_DATA_DIR` 指向 `dev/data`；生产部署不设置该变量时仍使用默认 `~/.transmission-manager`，二者互不影响。

## 使用指南

部署启动后，按以下流程即可开始管理 Transmission 下载任务。

### 首次连接
1. 浏览器访问 `http://<服务器IP>:8200`（本机为 `http://localhost:8200`）。
2. 若 Transmission 不在本机或开启了认证，打开「设置」（桌面端：顶栏右侧头像菜单；移动端：侧滑抽屉底部），填写 RPC 地址、用户名、密码并保存；也可通过环境变量或 `config.yaml` 预先配置（详见下方「环境变量」与 `backend/config.example.yaml`）。保存后自动热更新，无需重启。
3. 连接成功后，主界面实时显示速度、进度与种子列表。

### 添加任务
- 点击顶栏「+」（移动端为底部悬浮条的「+」）或按 `N` 打开添加面板。
- 拖入 `.torrent` 文件或粘贴磁力链接：自动解析并预览文件列表与体积，可设置下载目录、标签、优先级后再添加。
- 支持多文件、批量磁力，以及解析后立即校验。

### 日常管理
- 选中：`Ctrl+A` 全选当前筛选结果，`Esc` 取消选择。
- 操作：`Space` 开始 / 暂停，`Delete` 删除（弹窗含名称列表）。
- 桌面端：拖拽行调整队列顺序；拖拽可伸缩侧边栏调宽（自动持久化）；表头右键管理列的显隐 / 顺序。
- 移动端：卡片左滑触发操作、长按弹出菜单、顶部悬浮速度胶囊。
- 右键菜单：强制开始、队列调整、优先级、Tracker 批量替换、打开所在文件夹（飞牛环境）等。

### 过滤与排序
顶部搜索框（`/` 聚焦）按名称检索；配合状态 / 标签 / 站点 / 下载目录多维组合筛选，并支持按状态优先级 + 二级字段（完成时间、上传 / 下载量等）多级排序。

### 会话与全局设置
「设置」面板内可切换多服务器、查看会话统计、配置备用带宽定时调度、全局限速、下载 / 做种队列、轮询间隔，以及清除目录历史。

### 主题与语言
右上角切换明 / 暗主题与中文 / 英文（偏好持久化）；在飞牛 OS 中自动跟随系统主题。

### 宿主平台（fnOS / 通用部署）

核心功能不绑定任何特定系统，飞牛相关特性全部收敛在「宿主平台」一层：

- 后端 `internal/platform/`：平台提供安全策略（是否允许 iframe 嵌入、是否信任转发头）、
  本地文件读取白名单，以及自身专属路由（如 fnOS 的应用更新接口）。
- 前端 `src/platform/`：平台声明自己具备哪些**能力**（文件选择器、打开目录、应用更新……），
  UI 只按能力显示入口，不支持时自动隐藏或降级为复制路径。

因此同一套代码可直接跑在 Docker / 物理机 / 任意 Linux：默认 `platform=generic`，
飞牛专属入口自动消失，其余功能完全可用。

部署到 fnOS 时（`platform=fnos`，或检测到宿主注入的环境变量自动切换）额外启用：
文件选择器选择下载目录、在系统文件管理器中定位目录、系统主题/语言同步，
以及「设置 → 关于」中的应用更新（下载 GitHub Release 的 fpk 包后到应用中心安装）。

新增一套宿主只需：后端实现 `platform.Platform` 接口并在 `init` 中 `Register`，
前端实现 `HostPlatform` 接口并声明能力——业务代码一行都不用改。

### 进阶
- **PWA 安装**：手机浏览器或桌面 Chrome/Edge 中选择「添加到主屏幕 / 安装应用」，可全屏使用并离线缓存，有新版本时会提示刷新。
- **Peer 地理位置**：将 `GeoLite2-City.mmdb` 放入 `backend/mmdb/` 后自动启用。
- **浏览器内做种**：工具集「创建种子」可在本地用 bencode 分片 SHA1 生成 `.torrent`，生成后可一键添加。
- **批量清理**：按分享率 / 做种时长过滤，批量清理已完成种子。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TR_URL` | `http://localhost:9091/transmission/rpc` | Transmission RPC 端点 |
| `TR_USER` | 空 | RPC 用户名 |
| `TR_PASS` | 空 | RPC 密码 |
| `SERVER_PORT` | `8200` | 本服务端口 |
| `POLL_INTERVAL` | `2s` | WebSocket 轮询间隔 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `SERVER_HOST` | `127.0.0.1` | 监听地址（非回环地址需配置 `API_TOKEN`） |
| `API_TOKEN` | 空 | 接口访问令牌，为空表示不启用鉴权 |
| `TM_PLATFORM` | 自动推断 | 宿主平台：`generic`（默认）/ `fnos` |
| `GATEWAY_PREFIX` | 空 | 宿主网关挂载的 URL 前缀（如 `/app/transmission`） |
| `TORRENT_PATH_ROOTS` | `/vol,/mnt,/media,/volume1` | 「按路径添加种子」允许读取的根目录（逗号分隔） |
| `SERVER_SOCKET` | 空 | Unix socket 监听路径（宿主网关接入用） |

配置优先级：**环境变量 > .env.local > .env > config.yaml > 默认值**。
在界面「设置」中保存连接会写入 `.env.local` 并热更新，无需重启。

## 功能

- 种子管理：添加（`.torrent` / 磁力 / 批量）、开始/暂停/删除、优先级、标签、队列调整，均支持批量
- 文件操作：文件树设优先级、重命名，自动重新校验
- 实时数据：速度、进度、Peers（可选地理位置）、Tracker 状态、块位图
- 筛选排序：状态 / 标签 / 站点 / 目录 / 搜索组合筛选，多级排序
- 桌面虚拟滚动表格 + 右键菜单；移动端卡片 + 左滑操作 + 长按菜单
- 会话设置：多服务器切换、全局限速、带宽定时调度、队列规则
- 工具：批量清理已完成种子、浏览器端创建 `.torrent`
- 速度历史图表与统计仪表盘
- PWA：可安装、离线缓存、更新提示
- 快捷键：`N` 添加 / `Space` 开始暂停 / `Delete` 删除 / `Ctrl+A` 全选 / `/` 搜索 / `Esc` 取消 / `Ctrl+=`、`Ctrl+-` 字号增减
- 明/暗主题，中/英文切换

## 测试验证

```bash
# 后端单元验证
cd backend
go vet ./...
go test ./...

# 前端类型检查
cd frontend
pnpm typecheck
```
