import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 4173,
    host: '127.0.0.1',
    proxy: {
      '/sessions': {
        target: 'http://127.0.0.1:3015',
        changeOrigin: true
      },
      '/metrics': {
        target: 'http://127.0.0.1:3015',
        changeOrigin: true
      },
      '/health': {
        target: 'http://127.0.0.1:3015',
        changeOrigin: true
      }
    }
  }
})
