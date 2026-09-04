// Package torrentcreate 在后端创建 .torrent 文件。
//
// 相比浏览器端实现（单线程 WebCrypto），本包利用多协程并行计算各块的 SHA1，
// 对数十 GB 的目录也能在秒级完成。路径合法性（白名单、符号链接逃逸）
// 由调用方（api 层的宿主 FileAccess 策略）校验，本包只做纯构建。
package torrentcreate

import (
	"bytes"
	"crypto/sha1"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"sync"
	"sync/atomic"
)

// Options 创建种子的元信息选项
type Options struct {
	// Name 种子名；留空时从路径推导（目录取目录名，文件取文件名）
	Name string
	// Announce 主 tracker announce URL
	Announce string
	// AnnounceList 多 tracker 分层（外层为 tier，内层为该 tier 的 announce URL）
	AnnounceList [][]string
	// Comment 备注
	Comment string
	// Private 私有种子（禁 DHT/PEX/LPD）
	Private bool
	// CreatedBy 生成器标识
	CreatedBy string
	// WebSeeds HTTP/FTP 种子（url-list）
	WebSeeds []string
	// PieceLength 块大小（字节），取 16KB~16MB 之间的 2 的幂；0 = 按总体积自动推荐
	PieceLength int64
}

// sourceFile 参与建种的文件（abs 用于读取，rel 为种子内相对路径，/ 分隔）
type sourceFile struct {
	abs  string
	rel  string
	size int64
}

// pieceSegment 单个块在某个文件中的字节段
type pieceSegment struct {
	abs    string
	offset int64
	length int64
}

// Build 构建 .torrent，返回编码结果与种子名。
// progress 以已处理字节数回调（可nil）；构建取消时返回 ctx 错误。
func Build(root string, opts Options, progress func(processed, total int64), cancel <-chan struct{}) ([]byte, string, error) {
	fi, err := os.Stat(root)
	if err != nil {
		return nil, "", fmt.Errorf("源路径不可用: %w", err)
	}
	files, name, err := collectFiles(root, fi, opts.Name)
	if err != nil {
		return nil, "", err
	}
	if len(files) == 0 {
		return nil, "", fmt.Errorf("没有可用的文件")
	}

	var total int64
	for _, f := range files {
		total += f.size
	}
	pieceLength := normalizePieceLength(opts.PieceLength, total)
	segments := planPieces(files, total, pieceLength)
	nPieces := len(segments)

	// 并行哈希：每个块独立读盘（ReadAt，可并发），结果写入各自互不重叠的区间
	hashes := make([]byte, nPieces*20)
	var processed atomic.Int64
	workers := runtime.NumCPU()
	if workers > 16 {
		workers = 16
	}
	if workers < 1 {
		workers = 1
	}
	idxCh := make(chan int, nPieces)
	errCh := make(chan error, workers)
	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := hashWorker(idxCh, segments, pieceLength, hashes, &processed, cancel)
			if err != nil {
				errCh <- err
			}
		}()
	}
	for i := 0; i < nPieces; i++ {
		select {
		case <-cancel:
			close(idxCh)
			wg.Wait()
			return nil, "", fmt.Errorf("已取消")
		default:
		}
		idxCh <- i
	}
	close(idxCh)
	wg.Wait()
	if len(errCh) > 0 {
		return nil, "", <-errCh
	}
	if progress != nil {
		progress(total, total)
	}

	info := buildInfo(files, name, pieceLength, hashes, opts)
	rootDict := buildRootDict(info, opts)
	return bencodeEncode(rootDict), name, nil
}

// collectFiles 汇总参与建种的文件列表。
// 目录输入：种子名为目录名，文件相对路径含顶层目录（与前端行为一致）；
// 单文件输入：种子名为文件名。
func collectFiles(root string, fi os.FileInfo, nameOverride string) ([]sourceFile, string, error) {
	if !fi.IsDir() {
		name := filepath.Base(root)
		if nameOverride != "" {
			name = nameOverride
		}
		return []sourceFile{{abs: root, rel: name, size: fi.Size()}}, name, nil
	}
	dirName := filepath.Base(root)
	name := dirName
	if nameOverride != "" {
		name = nameOverride
	}
	var files []sourceFile
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if !d.Type().IsRegular() {
			return nil // 跳过软链/设备等非常规文件
		}
		rel, err := filepath.Rel(root, p)
		if err != nil {
			return err
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		files = append(files, sourceFile{
			abs:  p,
			rel:  dirName + "/" + filepath.ToSlash(rel),
			size: info.Size(),
		})
		return nil
	})
	if err != nil {
		return nil, "", fmt.Errorf("遍历目录失败: %w", err)
	}
	sort.Slice(files, func(i, j int) bool { return files[i].rel < files[j].rel })
	return files, name, nil
}

// planPieces 预先计算每个块的字节段（可能跨文件），
// 使哈希阶段可以乱序并行、无需在内存中拼接整个数据流。
func planPieces(files []sourceFile, total, pieceLength int64) [][]pieceSegment {
	if total == 0 {
		return nil
	}
	nPieces := (total + pieceLength - 1) / pieceLength
	// 文件起始偏移表（sizes 单调，可二分）
	starts := make([]int64, len(files))
	var acc int64
	for i, f := range files {
		starts[i] = acc
		acc += f.size
	}
	fileAt := func(global int64) int {
		lo, hi := 0, len(files)-1
		for lo < hi {
			mid := (lo + hi + 1) / 2
			if starts[mid] <= global {
				lo = mid
			} else {
				hi = mid - 1
			}
		}
		return lo
	}
	out := make([][]pieceSegment, nPieces)
	for i := int64(0); i < nPieces; i++ {
		begin := i * pieceLength
		end := begin + pieceLength
		if end > total {
			end = total
		}
		var segs []pieceSegment
		pos := begin
		for pos < end {
			fi := fileAt(pos)
			f := files[fi]
			fileEnd := starts[fi] + f.size
			segEnd := end
			if fileEnd < segEnd {
				segEnd = fileEnd
			}
			segs = append(segs, pieceSegment{
				abs:    f.abs,
				offset: pos - starts[fi],
				length: segEnd - pos,
			})
			pos = segEnd
		}
		out[i] = segs
	}
	return out
}

// hashWorker 消费块序号，读取字节段并计算 SHA1 写入共享结果区（互不重叠，无需加锁）
func hashWorker(idxCh <-chan int, segments [][]pieceSegment, pieceLength int64, hashes []byte, processed *atomic.Int64, cancel <-chan struct{}) error {
	// 每 worker 维护文件句柄缓存，避免小块高频开关文件
	openFiles := make(map[string]*os.File)
	defer func() {
		for _, f := range openFiles {
			_ = f.Close()
		}
	}()
	getFile := func(path string) (*os.File, error) {
		if f, ok := openFiles[path]; ok {
			return f, nil
		}
		f, err := os.Open(path)
		if err != nil {
			return nil, err
		}
		openFiles[path] = f
		return f, nil
	}
	buf := make([]byte, pieceLength)
	for idx := range idxCh {
		select {
		case <-cancel:
			return fmt.Errorf("已取消")
		default:
		}
		var n int64
		for _, seg := range segments[idx] {
			f, err := getFile(seg.abs)
			if err != nil {
				return fmt.Errorf("读取 %s 失败: %w", seg.abs, err)
			}
			read, err := f.ReadAt(buf[n:n+seg.length], seg.offset)
			n += int64(read)
			if err != nil {
				return fmt.Errorf("读取 %s 失败: %w", seg.abs, err)
			}
		}
		sum := sha1.Sum(buf[:n])
		copy(hashes[idx*20:], sum[:])
		processed.Add(int64(n))
	}
	return nil
}

// buildInfo 组装 info 字典（bencode 字典键需按字典序编码，由编码器保证）
func buildInfo(files []sourceFile, name string, pieceLength int64, hashes []byte, opts Options) map[string]any {
	info := map[string]any{
		"name":         name,
		"piece length": pieceLength,
		"pieces":       hashes,
	}
	if opts.Private {
		info["private"] = int64(1)
	}
	isMulti := len(files) > 1 || (len(files) == 1 && len(files[0].rel) > 0 && containsSlash(files[0].rel))
	if isMulti {
		fileList := make([]any, 0, len(files))
		for _, f := range files {
			parts := splitRel(f.rel)
			fileList = append(fileList, map[string]any{
				"length": f.size,
				"path":   parts,
			})
		}
		info["files"] = fileList
	} else if len(files) == 1 {
		info["length"] = files[0].size
	}
	return info
}

func buildRootDict(info map[string]any, opts Options) map[string]any {
	root := map[string]any{
		"info":          info,
		"creation date": int64(0), // 固定时间戳：同源数据可复现，且避免无谓的不确定输出
	}
	if opts.Announce != "" {
		root["announce"] = opts.Announce
	}
	if len(opts.AnnounceList) > 0 {
		tiers := make([]any, 0, len(opts.AnnounceList))
		for _, tier := range opts.AnnounceList {
			urls := make([]any, 0, len(tier))
			for _, u := range tier {
				urls = append(urls, u)
			}
			tiers = append(tiers, urls)
		}
		root["announce-list"] = tiers
	}
	if opts.Comment != "" {
		root["comment"] = opts.Comment
	}
	if opts.CreatedBy != "" {
		root["created by"] = opts.CreatedBy
	}
	if len(opts.WebSeeds) > 0 {
		urls := make([]any, 0, len(opts.WebSeeds))
		for _, u := range opts.WebSeeds {
			urls = append(urls, u)
		}
		root["url-list"] = urls
	}
	return root
}

// normalizePieceLength 校正块大小：16KB~16MB 之间的 2 的幂；0 = 自动推荐
func normalizePieceLength(requested, total int64) int64 {
	const (
		minPiece = 16 * 1024
		maxPiece = 16 * 1024 * 1024
	)
	if requested > 0 {
		// 归整到 2 的幂并夹取范围
		p := int64(minPiece)
		for p < requested && p < maxPiece {
			p *= 2
		}
		if p > maxPiece {
			p = maxPiece
		}
		return p
	}
	// 与前端 suggestPieceLength 保持一致
	switch {
	case total < 256<<20:
		return 256 * 1024
	case total < 1<<30:
		return 512 * 1024
	case total < 4<<30:
		return 1 << 20
	case total < 16<<30:
		return 4 << 20
	default:
		return 16 << 20
	}
}

func containsSlash(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] == '/' {
			return true
		}
	}
	return false
}

func splitRel(rel string) []any {
	parts := bytes.Split(bytes.TrimSpace([]byte(rel)), []byte("/"))
	out := make([]any, 0, len(parts))
	for _, p := range parts {
		if len(p) > 0 {
			out = append(out, string(p))
		}
	}
	return out
}
