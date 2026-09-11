import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// flag-icons 的 1x1 变体（.fis）本项目用不到，但它的 CSS 为每个国家都引了一份，
// 会让构建产物凭空多出 271 个无用 SVG（约 1.9MB），文件数也会逼近一些批量删除保护阈值。
// 在 CSS 处理前剥掉这些规则，只保留 4x3（界面里旗帜按 20×15 展示）。
const flagIcons4x3Only = {
  name: 'flag-icons-4x3-only',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.includes('flag-icons') || !id.endsWith('.css')) return null
    return code.replace(/\.fi-[a-z-]+\.fis\{background-image:url\([^)]*\)\}/g, '')
  },
}

export default defineConfig({
  // 相对路径构建：资源可被部署在任意子路径（如 fnOS 网关 /app/transmission/）下
  base: './',
  plugins: [flagIcons4x3Only, react(), tailwindcss()],
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
    // flag-icons 的国家/地区旗帜是 271 个独立 SVG（其中 200 个小于默认 4KB 阈值）：
    // 一旦被内联进 CSS，样式表会膨胀到几百 KB，且未用到的旗帜也被塞进首屏。
    // 这里对 SVG 关闭内联，CSS 保持 ~27KB，浏览器只按需请求当前页实际出现的旗帜。
    assetsInlineLimit: (filePath: string) => (filePath.endsWith('.svg') ? false : undefined),
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
