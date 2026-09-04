package rpc

import (
	"testing"

	"github.com/hekmon/cunits/v2"
	trpc "github.com/hekmon/transmissionrpc/v3"
)

func i64(v int64) *int64                              { return &v }
func str(v string) *string                            { return &v }
func f64(v float64) *float64                          { return &v }
func bits(v float64) *cunits.Bits                     { b := cunits.ImportInByte(v); return &b }
func status(v trpc.TorrentStatus) *trpc.TorrentStatus { return &v }

func TestMapTorrent(t *testing.T) {
	tr := trpc.Torrent{
		ID:             i64(1),
		Name:           str("test-torrent"),
		HashString:     str("abc123"),
		TotalSize:      bits(1024),
		PercentDone:    f64(0.5),
		Status:         status(trpc.TorrentStatusDownload),
		RateDownload:   i64(1024),
		RateUpload:     i64(512),
		Labels:         []string{"test", "linux"},
		Error:          i64(0),
		ErrorString:    str(""),
		PeersConnected: i64(10),
		Files: []trpc.TorrentFile{
			{Name: "a.bin", Length: 1024, BytesCompleted: 512},
		},
	}

	out := mapTorrent(tr, true)
	if out.ID != 1 || out.Name != "test-torrent" || out.HashString != "abc123" {
		t.Fatalf("基础字段映射错误: %+v", out)
	}
	if out.TotalSize != 1024 {
		t.Errorf("TotalSize 应为 1024，得到 %d", out.TotalSize)
	}
	if out.PercentDone != 0.5 {
		t.Errorf("PercentDone 应为 0.5，得到 %v", out.PercentDone)
	}
	if out.Status != 4 {
		t.Errorf("Status 应为 4(下载中)，得到 %d", out.Status)
	}
	if out.RateDownload != 1024 || out.RateUpload != 512 {
		t.Errorf("速度映射错误: %d/%d", out.RateDownload, out.RateUpload)
	}
	if len(out.Labels) != 2 || out.Labels[0] != "test" {
		t.Errorf("标签映射错误: %v", out.Labels)
	}
	if len(out.Files) != 1 || out.Files[0].Name != "a.bin" {
		t.Errorf("文件映射错误: %+v", out.Files)
	}
}

func TestMapTorrentNilFields(t *testing.T) {
	// 全空字段不应 panic，应输出零值
	out := mapTorrent(trpc.Torrent{}, false)
	if out.ID != 0 || out.Name != "" || out.TotalSize != 0 {
		t.Fatalf("空字段映射错误: %+v", out)
	}
	if out.Files != nil {
		t.Errorf("列表模式不应包含文件详情")
	}
}

func TestMapSession(t *testing.T) {
	enc := trpc.EncryptionPreferred
	s := trpc.SessionArguments{
		Version:             str("4.0.5"),
		RPCVersion:          i64(17),
		DownloadDir:         str("/downloads"),
		SpeedLimitDown:      i64(1000),
		SpeedLimitUpEnabled: boolPtr(false),
		Encryption:          &enc,
		StartAddedTorrents:  boolPtr(true),
	}
	out := mapSession(s)
	if out.Version != "4.0.5" || out.RPCVersion != 17 || out.DownloadDir != "/downloads" {
		t.Fatalf("会话映射错误: %+v", out)
	}
	if out.Encryption != "prefered" {
		t.Errorf("加密模式映射错误: %s", out.Encryption)
	}
	if !out.StartAdded {
		t.Errorf("StartAdded 应为 true")
	}
	if out.SpeedLimitUpOn {
		t.Errorf("SpeedLimitUpOn 应为 false")
	}
}

func boolPtr(v bool) *bool { return &v }
