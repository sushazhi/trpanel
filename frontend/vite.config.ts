import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // 相对路径构建：资源可被部署在任意子路径（如 fnOS 网关 /app/transmission/）下
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // 开启 HMR（React Fast Refresh + CSS 热替换）：保存源码后浏览器自动局部更新，无需手动刷新。
    // 特殊环境（如阻断 WebSocket 的内嵌 WebView）可用 `DEV_NO_HMR=1 pnpm dev` 关闭。
    hmr: process.env.DEV_NO_HMR === '1' ? false : { overlay: true },
    // 网络盘 / 虚拟机共享目录 / WSL 挂载目录下原生监听可能收不到事件，
    // 此时用 `DEV_WATCH_POLL=1 pnpm dev` 切换为轮询监听（默认不覆盖 Vite 自身的 watch 配置）
    ...(process.env.DEV_WATCH_POLL === '1'
      ? { watch: { usePolling: true, interval: 300 } }
      : {}),
    proxy: {
      '/api': { target: 'http://localhost:8200', changeOrigin: true },
      '/mcp': { target: 'http://localhost:8200', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8200', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Vite 8（rolldown）仅支持函数形式的 manualChunks
        manualChunks(id: string) {
          if (/node_modules[\\/](react|react-dom|axios|zustand)([\\/]|$)/.test(id)) {
            return 'vendor'
          }
          return undefined
        },
      },
    },
  },
})
