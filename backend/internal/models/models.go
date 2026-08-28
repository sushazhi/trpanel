package models

// ApiResponse 统一响应格式
type ApiResponse struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// OK 构造成功响应
func OK(data interface{}) ApiResponse {
	return ApiResponse{Code: 0, Message: "success", Data: data}
}

// Error 构造失败响应
func Error(msg string) ApiResponse {
	return ApiResponse{Code: 1, Message: msg}
}

// Torrent 种子数据（与前端 TS 类型对齐）
type Torrent struct {
	ID                  int64    `json:"id"`
	Name                string   `json:"name"`
	HashString          string   `json:"hashString"`
	Creator             string   `json:"creator"`
	TotalSize           int64    `json:"totalSize"`
	SizeWhenDone        int64    `json:"sizeWhenDone"`
	PercentDone         float64  `json:"percentDone"`
	Status              int64    `json:"status"`
	RateDownload        int64    `json:"rateDownload"`
	RateUpload          int64    `json:"rateUpload"`
	ETA                 int64    `json:"eta"`
	UploadedEver        int64    `json:"uploadedEver"`
	DownloadedEver      int64    `json:"downloadedEver"`
	UploadRatio         float64  `json:"uploadRatio"`
	SecondsSeeding      int64    `json:"secondsSeeding"`
	Error               int64    `json:"error"`
	ErrorString         string   `json:"errorString"`
	Labels              []string `json:"labels"`
	QueuePosition       int64    `json:"queuePosition"`
	PeersConnected      int64    `json:"peersConnected"`
	PeersSendingToUs    int64    `json:"peersSendingToUs"`
	PeersGettingFromUs  int64    `json:"peersGettingFromUs"`
	DownloadDir         string   `json:"downloadDir"`
	AddedDate           int64    `json:"addedDate"`
	DoneDate            int64    `json:"doneDate"`
	ActivityDate        int64    `json:"activityDate"`
	IsFinished          bool     `json:"isFinished"`
	IsStalled           bool     `json:"isStalled"`
	IsPrivate           bool     `json:"isPrivate"`
	MagnetLink          string   `json:"magnetLink"`
	FileCount           int64    `json:"fileCount"`
	HaveValid           int64    `json:"haveValid"`
	HaveUnchecked       int64    `json:"haveUnchecked"`
	LeftUntilDone       int64    `json:"leftUntilDone"`
	Comment             string   `json:"comment"`
	PeerLimit           int64    `json:"peerLimit"`
	SeedIdleLimit       int64    `json:"seedIdleLimit"`
	SeedIdleMode        int64    `json:"seedIdleMode"`
	SeedRatioLimit      float64  `json:"seedRatioLimit"`
	SeedRatioMode       int64    `json:"seedRatioMode"`
	BandwidthPriority   int64    `json:"bandwidthPriority"`
	DownloadLimited     bool     `json:"downloadLimited"`
	DownloadLimit       int64    `json:"downloadLimit"`
	UploadLimited       bool     `json:"uploadLimited"`
	UploadLimit         int64    `json:"uploadLimit"`
	HonorsSessionLimits bool     `json:"honorsSessionLimits"`

	// TrackerStats 列表与详情均返回（列表列显示主 Tracker 主机名）
	TrackerStats []TrackerStat `json:"trackerStats,omitempty"`

	// 以下为详情字段，列表接口不返回
	Files              []FileInfo `json:"files,omitempty"`
	FileStats          []FileStat `json:"fileStats,omitempty"`
	Trackers           []Tracker  `json:"trackers,omitempty"`
	Peers              []Peer     `json:"peers,omitempty"`
	SequentialDownload bool       `json:"sequentialDownload,omitempty"`

	// 块位图（详情接口返回，base64 编码）
	Pieces     string `json:"pieces,omitempty"`
	PieceCount int64  `json:"pieceCount,omitempty"`
	PieceSize  int64  `json:"pieceSize,omitempty"`
}

// FileInfo 文件信息
type FileInfo struct {
	BytesCompleted int64  `json:"bytesCompleted"`
	Length         int64  `json:"length"`
	Name           string `json:"name"`
}

// FileStat 文件统计（是否选择下载、优先级）
type FileStat struct {
	BytesCompleted int64 `json:"bytesCompleted"`
	Wanted         bool  `json:"wanted"`
	Priority       int64 `json:"priority"`
}

// Tracker Tracker 基础信息
type Tracker struct {
	Announce string `json:"announce"`
	ID       int64  `json:"id"`
	Scrape   string `json:"scrape"`
	SiteName string `json:"sitename"`
	Tier     int64  `json:"tier"`
}

// TrackerStat Tracker 状态
type TrackerStat struct {
	ID                    int64  `json:"id"`
	Host                  string `json:"host"`
	Announce              string `json:"announce"`
	AnnounceState         int64  `json:"announceState"`
	Tier                  int64  `json:"tier"`
	IsBackup              bool   `json:"isBackup"`
	LastAnnounceResult    string `json:"lastAnnounceResult"`
	LastAnnounceSucceeded bool   `json:"lastAnnounceSucceeded"`
	LastAnnounceTimedOut  bool   `json:"lastAnnounceTimedOut"`
	LastAnnounceTime      int64  `json:"lastAnnounceTime"`
	LastAnnouncePeerCount int64  `json:"lastAnnouncePeerCount"`
	NextAnnounceTime      int64  `json:"nextAnnounceTime"`
	ScrapeState           int64  `json:"scrapeState"`
	LastScrapeResult      string `json:"lastScrapeResult"`
	LastScrapeSucceeded   bool   `json:"lastScrapeSucceeded"`
	LastScrapeTime        int64  `json:"lastScrapeTime"`
	NextScrapeTime        int64  `json:"nextScrapeTime"`
	SeederCount           int64  `json:"seederCount"`
	LeecherCount          int64  `json:"leecherCount"`
	DownloadCount         int64  `json:"downloadCount"`
}

// Peer Peer 信息
type Peer struct {
	Address           string  `json:"address"`
	ClientName        string  `json:"clientName"`
	FlagStr           string  `json:"flagStr"`
	Progress          float64 `json:"progress"`
	RateToClient      int64   `json:"rateToClient"`
	RateToPeer        int64   `json:"rateToPeer"`
	IsDownloadingFrom bool    `json:"isDownloadingFrom"`
	IsUploadingTo     bool    `json:"isUploadingTo"`
	IsEncrypted       bool    `json:"isEncrypted"`
	IsIncoming        bool    `json:"isIncoming"`
	IsUTP             bool    `json:"isUTP"`
	Port              int64   `json:"port"`
}

// Session 会话信息
type Session struct {
	Version                          string   `json:"version"`
	RPCVersion                       int64    `json:"rpcVersion"`
	DownloadDir                      string   `json:"downloadDir"`
	SpeedLimitDown                   int64    `json:"speedLimitDown"`
	SpeedLimitDownOn                 bool     `json:"speedLimitDownOn"`
	SpeedLimitUp                     int64    `json:"speedLimitUp"`
	SpeedLimitUpOn                   bool     `json:"speedLimitUpOn"`
	AltSpeedDown                     int64    `json:"altSpeedDown"`
	AltSpeedUp                       int64    `json:"altSpeedUp"`
	AltSpeedEnabled                  bool     `json:"altSpeedEnabled"`
	PeerLimitGlobal                  int64    `json:"peerLimitGlobal"`
	PeerPort                         int64    `json:"peerPort"`
	PeerPortRandomOnStart            bool     `json:"peerPortRandomOnStart"`
	PEXEnabled                       bool     `json:"pexEnabled"`
	DHTEnabled                       bool     `json:"dhtEnabled"`
	LPDEnabled                       bool     `json:"lpdEnabled"`
	UTPEnabled                       bool     `json:"utpEnabled"`
	Encryption                       string   `json:"encryption"`
	SeedRatioLimit                   float64  `json:"seedRatioLimit"`
	StartAdded                       bool     `json:"startAdded"`
	IncompleteDir                    string   `json:"incompleteDir"`
	DownloadQueueSize                int64    `json:"downloadQueueSize"`
	DownloadQueueEnabled             bool     `json:"downloadQueueEnabled"`
	SeedQueueSize                    int64    `json:"seedQueueSize"`
	SeedQueueEnabled                 bool     `json:"seedQueueEnabled"`
	QueueStalledEnabled              bool     `json:"queueStalledEnabled"`
	QueueStalledMinutes              int64    `json:"queueStalledMinutes"`
	BlocklistEnabled                 bool     `json:"blocklistEnabled"`
	BlocklistURL                     string   `json:"blocklistUrl"`
	BlocklistSize                    int64    `json:"blocklistSize"`
	PortForwardingEnabled            bool     `json:"portForwardingEnabled"`
	IncompleteDirEnabled             bool     `json:"incompleteDirEnabled"`
	CacheSizeMB                      int64    `json:"cacheSizeMB"`
	AltSpeedTimeEnabled              bool     `json:"altSpeedTimeEnabled"`
	AltSpeedTimeBegin                int64    `json:"altSpeedTimeBegin"`
	AltSpeedTimeEnd                  int64    `json:"altSpeedTimeEnd"`
	AltSpeedTimeDay                  int64    `json:"altSpeedTimeDay"`
	ScriptTorrentAddedEnabled        bool     `json:"scriptTorrentAddedEnabled"`
	ScriptTorrentAddedFilename       string   `json:"scriptTorrentAddedFilename"`
	ScriptTorrentDoneEnabled         bool     `json:"scriptTorrentDoneEnabled"`
	ScriptTorrentDoneFilename        string   `json:"scriptTorrentDoneFilename"`
	ScriptTorrentDoneSeedingEnabled  bool     `json:"scriptTorrentDoneSeedingEnabled"`
	ScriptTorrentDoneSeedingFilename string   `json:"scriptTorrentDoneSeedingFilename"`
	DefaultTrackers                  []string `json:"defaultTrackers"`
	RenamePartialFiles               bool     `json:"renamePartialFiles"`
	TrashOriginalTorrentFiles        bool     `json:"trashOriginalTorrentFiles"`
	IdleSeedingLimitEnabled          bool     `json:"idleSeedingLimitEnabled"`
	IdleSeedingLimit                 int64    `json:"idleSeedingLimit"`
}

// SessionStatus 连接状态
type SessionStatus struct {
	Connected bool   `json:"connected"`
	Version   string `json:"version"`
	Error     string `json:"error,omitempty"`
}
