import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  // 开发时将 /api 代理到本地 Worker（wrangler dev 端口 8787）
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  // 构建输出到 Worker 的 public 目录，wrangler deploy 时一起打包
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
})
