import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
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
    // 内嵌 WebView（IDE 预览）环境会阻断 WebSocket，启用 HMR 会持续报
    // "[vite] failed to connect to websocket"。这里关闭 HMR 以避免报错；
    // 开发需要热更新时改回：hmr: { host: 'localhost', protocol: 'ws', clientPort: 5173 }
    hmr: false,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'axios', 'zustand'],
        },
      },
    },
  },
})
