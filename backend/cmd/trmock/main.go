package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	var (
		addr    = flag.String("addr", "127.0.0.1:9092", "监听地址")
		rpcPath = flag.String("rpc-path", "/transmission/rpc", "RPC 端点路径")
		user    = flag.String("user", "", "可选 HTTP Basic 用户名（为空则不鉴权）")
		pass    = flag.String("pass", "", "可选 HTTP Basic 密码")
		seed    = flag.Int("seed", 14, "初始种子数量")
		tick    = flag.Duration("tick", 1*time.Second, "模拟推进间隔")
		static  = flag.Bool("static", false, "关闭实时模拟（静态快照）")
		noCSRF  = flag.Bool("no-csrf", false, "关闭 409 会话握手")
	)
	flag.Parse()

	store := NewStore(*seed)
	srv := NewServer(store, *user, *pass, !*noCSRF)

	// 实时模拟
	if !*static {
		go func() {
			t := time.NewTicker(*tick)
			defer t.Stop()
			for range t.C {
				store.Step(*tick)
			}
		}()
	}

	mux := http.NewServeMux()
	mux.Handle(*rpcPath, srv)
	httpSrv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("trmock 已启动: http://%s%s （种子 %d 个，模拟 %v，鉴权 %v）",
			*addr, *rpcPath, *seed, onOff(!*static), onOff(*user != ""))
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP 服务启动失败: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Printf("正在关闭 trmock ...")
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = httpSrv.Shutdown(ctx)
}

func onOff(b bool) string {
	if b {
		return "开"
	}
	return "关"
}
