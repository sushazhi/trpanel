package main

import (
	"context"
	"net/http/httptest"
	"net/url"
	"testing"

	trpc "github.com/hekmon/transmissionrpc/v3"
)

// TestLibCompat 用后端同款 hekmon/transmissionrpc 客户端直连 mock，
// 端到端验证 wire 形状与库的解析完全兼容：409 会话握手、tag 回显、
// 尺寸/日期/时长单位、字段过滤、详情子结构、变更操作往返。
func TestLibCompat(t *testing.T) {
	srv := NewServer(NewStore(8), "", "", true)
	httpSrv := httptest.NewServer(srv)
	defer httpSrv.Close()

	u, err := url.Parse(httpSrv.URL + "/transmission/rpc")
	if err != nil {
		t.Fatalf("解析 URL 失败: %v", err)
	}
	client, err := trpc.New(u, nil)
	if err != nil {
		t.Fatalf("创建客户端失败: %v", err)
	}
	ctx := context.Background()

	// session-get（含 409 握手与 version 解析）
	sess0, err := client.SessionArgumentsGetAll(ctx)
	if err != nil {
		t.Fatalf("SessionArgumentsGetAll 失败: %v", err)
	}
	if sess0.Version == nil || *sess0.Version == "" {
		t.Fatal("session-get 未返回版本")
	}
	if sess0.RPCVersion == nil || *sess0.RPCVersion <= 0 {
		t.Fatalf("session-get rpc-version 异常: %v", sess0.RPCVersion)
	}

	// 列表字段（与后端 listTorrentFields 等价的代表性子集）
	fields := []string{
		"id", "name", "hashString", "totalSize", "sizeWhenDone", "percentDone",
		"status", "rateDownload", "rateUpload", "eta", "uploadedEver", "downloadedEver",
		"uploadRatio", "secondsSeeding", "error", "errorString", "labels", "queuePosition",
		"peersConnected", "peersSendingToUs", "peersGettingFromUs", "downloadDir",
		"addedDate", "doneDate", "activityDate", "isFinished", "isStalled",
		"isPrivate", "magnetLink", "file-count", "haveValid", "haveUnchecked",
		"leftUntilDone", "comment", "peer-limit", "seedIdleLimit", "seedIdleMode",
		"seedRatioLimit", "seedRatioMode", "bandwidthPriority", "downloadLimited",
		"downloadLimit", "uploadLimited", "uploadLimit", "honorsSessionLimits",
		"trackerStats",
	}
	torrents, err := client.TorrentGet(ctx, fields, nil)
	if err != nil {
		t.Fatalf("TorrentGet 失败: %v", err)
	}
	if len(torrents) != 8 {
		t.Fatalf("期望 8 个种子，得到 %d", len(torrents))
	}
	first := torrents[0]
	if first.ID == nil || first.Name == nil {
		t.Fatal("列表缺少 id/name")
	}
	// cunits 往返：库按 bit 存，mock 发字节，总尺寸应远大于 1MB
	if first.TotalSize == nil || int64(*first.TotalSize) < 1024*1024 {
		t.Fatalf("totalSize 单位往返异常: %v", first.TotalSize)
	}
	if first.TimeSeeding != nil && *first.TimeSeeding < 0 {
		t.Fatalf("secondsSeeding 解析异常: %v", *first.TimeSeeding)
	}
	if len(first.TrackerStats) == 0 {
		t.Fatal("列表缺少 trackerStats")
	}
	if first.TrackerStats[0].LastAnnounceTime.IsZero() {
		t.Fatal("trackerStat 时间解析异常")
	}

	// 详情（全字段请求，含 files/peers/trackers/pieces）
	detail, err := client.TorrentGetAllFor(ctx, []int64{*first.ID})
	if err != nil {
		t.Fatalf("TorrentGetAllFor 失败: %v", err)
	}
	if len(detail) != 1 {
		t.Fatalf("按 id 查详情应返回 1 条，得到 %d", len(detail))
	}
	d := detail[0]
	if len(d.Files) == 0 || len(d.FileStats) == 0 {
		t.Fatal("详情缺少 files/fileStats")
	}
	if len(d.Trackers) == 0 || len(d.Peers) == 0 {
		t.Fatal("详情缺少 trackers/peers")
	}
	if d.Pieces == nil || len(*d.Pieces) == 0 {
		t.Fatal("详情缺少 pieces 位图")
	}

	// session-stats
	stats, err := client.SessionStats(ctx)
	if err != nil {
		t.Fatalf("SessionStats 失败: %v", err)
	}
	if stats.TorrentCount != 8 {
		t.Fatalf("统计 torrentCount 应为 8，得到 %d", stats.TorrentCount)
	}

	// free-space（库按 bit 返回，断言正数且不超过总量）
	free, total, err := client.FreeSpace(ctx, "/downloads")
	if err != nil {
		t.Fatalf("FreeSpace 失败: %v", err)
	}
	if free <= 0 || total < free {
		t.Fatalf("free-space 数值异常: free=%v total=%v", free, total)
	}

	// port-test
	open, err := client.PortTest(ctx)
	if err != nil || !open {
		t.Fatalf("PortTest 异常: open=%v err=%v", open, err)
	}

	// torrent-add（URL）→ 返回 id/name
	link := "https://example.com/added-via-lib.torrent"
	added, err := client.TorrentAdd(ctx, trpc.TorrentAddPayload{Filename: &link})
	if err != nil {
		t.Fatalf("TorrentAdd 失败: %v", err)
	}
	if added.ID == nil {
		t.Fatal("TorrentAdd 未返回 ID")
	}
	if added.Name == nil || *added.Name != "added-via-lib.torrent" {
		t.Fatalf("新增种子名称异常: %v", added.Name)
	}

	// torrent-stop → 状态确实变为停止
	if err := client.TorrentStopIDs(ctx, []int64{*added.ID}); err != nil {
		t.Fatalf("TorrentStopIDs 失败: %v", err)
	}
	after, err := client.TorrentGet(ctx, []string{"id", "status"}, []int64{*added.ID})
	if err != nil || len(after) != 1 {
		t.Fatalf("stop 后查询失败: n=%d err=%v", len(after), err)
	}
	if *after[0].Status != trpc.TorrentStatusStopped {
		t.Fatalf("stop 后状态应为 %d，得到 %d", trpc.TorrentStatusStopped, *after[0].Status)
	}
	// session-set 往返：download-dir 生效；default-trackers 以换行拼接字符串
	// 往返，库读取时拆回切片，条目数应保持不变
	newDir := "/downloads/new"
	trackers := []string{"https://tracker.example.org/announce", "udp://backup.example.org:6969/announce"}
	if err := client.SessionArgumentsSet(ctx, trpc.SessionArguments{
		DownloadDir:     &newDir,
		DefaultTrackers: trackers,
	}); err != nil {
		t.Fatalf("SessionArgumentsSet 失败: %v", err)
	}
	sess, err := client.SessionArgumentsGetAll(ctx)
	if err != nil {
		t.Fatalf("SessionArgumentsGetAll 失败: %v", err)
	}
	if sess.DownloadDir == nil || *sess.DownloadDir != newDir {
		t.Fatalf("download-dir 未生效: %v", sess.DownloadDir)
	}
	if len(sess.DefaultTrackers) != len(trackers) {
		t.Fatalf("default-trackers 往返异常: %v", sess.DefaultTrackers)
	}
}
