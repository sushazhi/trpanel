# trpanel for fnOS

基于 **Go + React** 重构的 Transmission 现代化 Web 管理界面，**专为飞牛 OS（fnOS）开发**，前后端一体交付。

- **前后端一体**：后端作为 Transmission RPC 代理 + WebSocket 实时推送，前端内嵌打包为单个 Go 可执行文件，开箱即用
- **移动端优先**：自适应桌面/手机/平板
- **飞牛深度集成**：原生文件选择器/主题同步/语义路径；非飞牛环境可运行但自动降级，非主要适配目标

## 目录结构

```
trpanel/
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
│   └── trpanel.exe # 已编译产物
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
- 下载 Release 中的 `trpanel-*.tar.gz`，解压到服务器目录即可使用；
- 或自行构建：`cd backend && go build -o trpanel ./cmd/server`。

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
./trpanel        # Linux / macOS
trpanel.exe      # Windows
```

### 4. 访问
浏览器打开 `http://<服务器IP>:8200`。连接成功后即可添加 / 管理种子，详见下方「使用指南」。

### （可选）从源码构建前端并嵌入
如需自行修改前端界面：
```bash
cd frontend && pnpm install && pnpm build
cd ../backend
Copy-Item ..\frontend\dist\* web\dist\ -Recurse -Force   # PowerShell 将前端产物复制到 web/dist
go build -o trpanel ./cmd/server
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
> 后端数据目录通过环境变量 `TM_DATA_DIR` 指向 `dev/data`；生产部署不设置该变量时仍使用默认 `~/.trpanel`，二者互不影响。

### 没有可用的 Transmission？用内置 Mock

仓库自带一个说 Transmission RPC 协议的开发用 mock（`backend/cmd/trmock`），内置覆盖各状态的种子数据并实时推进进度/速度，无需真实 Transmission 即可联调前后端：

```bash
./dev.sh -mock       # Linux / macOS：一键起前后端 + mock（mock 监听 :9092）
.\dev.ps1 -mock      # Windows：同上
```

也可以单独运行：`cd backend && go run ./cmd/trmock`（默认 `127.0.0.1:9092`，`-h` 查看 `-seed`/`-tick`/`-static` 等选项）。

**在 mock 与真实远端之间切换**（后端支持运行时热切换，无需重启）：

- 界面切换：设置 → 连接地址，填 `http://localhost:9092/transmission/rpc`（mock）或真实远端（如 `http://<ip>:9091/transmission/rpc`），保存即生效。
- 启动时指定：`TR_URL=http://localhost:9092/transmission/rpc`（指向 mock）或真实地址。

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
- 选中：`Ctrl+A` 或顶栏动作条首颗「全选」按钮选中当前筛选结果，`Esc` 取消选择。
- 操作：`Space` 开始 / 暂停，`Delete` 删除（弹窗含名称列表）。
- 桌面端：拖拽行调整队列顺序；拖拽可伸缩侧边栏调宽（自动持久化）；表头右键管理列的显隐 / 顺序。
- 移动端：点卡片打开详情，长按卡片或点 ⋮ 弹出操作菜单，列表区左右滑动切换分类，勾选卡片复选框进入批量操作（顶栏动作条可横向滑动，首颗「全选」一次补齐当前分组），底部悬浮胶囊承载添加 / 全部启停 / 清理。
- 右键菜单：强制开始、队列调整、优先级、Tracker 批量替换、打开所在文件夹（飞牛环境）等。

### 过滤与排序
顶部搜索框（`/` 聚焦）按名称 / 哈希检索，**模糊匹配**：不区分大小写、忽略空格与标点（保留字母、数字与中日韩文字），如 `m team` 也能命中 `M-Team`。配合状态 / 标签 / 站点 / 下载目录多维组合筛选，并支持按状态优先级 + 二级字段（完成时间、上传 / 下载量等）多级排序。

### 会话与全局设置
「设置」面板内可切换多服务器、查看会话统计、配置备用带宽定时调度、全局限速、下载 / 做种队列、轮询间隔，以及清除目录历史。

### 主题、语言与外观
右上角切换明 / 暗主题与中文 / 英文（偏好持久化）；在飞牛 OS 中自动跟随系统主题。外观设置（「设置 → 外观」）中：

- **玻璃浓度**：调节玻璃材质的填充通透度。浓度越低，玻璃越通透，模糊与饱和折射同步增强，背后的内容更明显（通透靠「后面有什么」撑起观感）。
- **背景壁纸**：可选一张本地图片（自动压缩到长边 1920 的 JPEG，约 200–400KB，避免撑爆浏览器存储配额），铺满全屏作为玻璃的折射色源，形成随玻璃流动的色彩。可读性洗罩层保证文字仍可辨识。

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
以及「设置 → 关于」中的应用更新（下载 GitHub Release 的 fpk 包后到应用中心安装）、问题反馈入口
（界面 / 功能问题反馈到 UI 仓库 `trpanel`；fpk 安装、应用更新等问题反馈到飞牛应用仓库 `fnos-transmission`）。

新增一套宿主只需：后端实现 `platform.Platform` 接口并在 `init` 中 `Register`，
前端实现 `HostPlatform` 接口并声明能力——业务代码一行都不用改。

### 进阶
- **PWA 安装**：手机浏览器或桌面 Chrome/Edge 中选择「添加到主屏幕 / 安装应用」，可全屏使用并离线缓存，有新版本时会提示刷新。
- **Peer 地理位置**：将 `GeoLite2-City.mmdb` 放入 `backend/mmdb/` 后自动启用。
- **浏览器内做种**：工具集「创建种子」可在本地用 bencode 分片 SHA1 生成 `.torrent`，生成后可一键添加。
- **批量清理**：按分享率 / 做种时长过滤，批量清理已完成种子。
- **做种策略**：「设置 → 自动化 → 做种策略」按站点设置分享率 / 做种天数 / 上传量目标，达标后自动暂停种子、删除种子（保留文件）或删除种子及文件，解决不同站点的分享率要求差异。默认只生成待处理清单，需手动开启「自动执行」才会真正动作；下载未完成、本地报错、所有 tracker 都没 announce 成功的种子一律跳过（站点没记录到你的上传量，本地分享率不算数），另有全局最低做种时长与站点 / 标签排除名单。站点匹配口径与「自动文件管理」「侧边栏站点分组」一致——按站点名或简称（如 `m-team`）匹配，而非 tracker 主机名。

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
| `API_TOKEN` | 空 | 接口访问令牌，为空表示不启用鉴权；非空时浏览器首次访问会弹出令牌输入框，粘贴此值即可 |
| `TM_PLATFORM` | 自动推断 | 宿主平台：`generic`（默认）/ `fnos` |
| `GATEWAY_PREFIX` | 空 | 宿主网关挂载的 URL 前缀（如 `/app/transmission`） |
| `TORRENT_PATH_ROOTS` | `/vol,/mnt,/media,/volume1` | 「按路径添加种子」允许读取的根目录（逗号分隔；按解析符号链接后的真实路径判定，仅允许普通文件） |
| `SERVER_SOCKET` | 空 | Unix socket 监听路径（宿主网关接入用） |

配置优先级：**环境变量 > .env.local > .env > config.yaml > 默认值**。
在界面「设置」中保存连接会写入 `.env.local` 并热更新，无需重启。

## 功能

- 种子管理：添加（`.torrent` / 磁力 / 批量）、开始/暂停/删除、优先级、标签、队列调整，均支持批量
- 文件操作：文件树设优先级、重命名，自动重新校验
- 实时数据：速度、进度、Peers（可选地理位置）、Tracker 状态、块位图
- 筛选排序：状态 / 标签 / 站点 / 目录 / 模糊搜索（忽略大小写与空格标点）组合筛选，多级排序
- 桌面（鼠标）虚拟滚动表格 + 右键菜单 / 拖拽排序；触屏与平板为玻璃卡片列表，长按或 ⋮ 唤出菜单、左右滑动切分类、动作条「全选」一次补齐当前分组
- 会话设置：多服务器切换、全局限速、带宽定时调度、队列规则
- 工具：批量清理已完成种子、浏览器端创建 `.torrent`
- 自动化：已完成种子按站点归档、做种策略按站点分享率目标达标后暂停 / 删除 / 删除并清理文件
- 速度历史图表与统计仪表盘
- PWA：可安装、离线缓存、更新提示
- 快捷键：`N` 添加 / `Space` 开始暂停 / `Delete` 删除 / `Ctrl+A` 全选当前结果（同动作条「全选」按钮）/ `/` 搜索 / `Esc` 取消 / `Ctrl+=`、`Ctrl+-` 字号增减
- 明/暗主题，中/英文切换
- 外观：玻璃浓度可调（低浓度联动增强折射），支持背景壁纸（作为玻璃折射色源形成色彩流动）

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
