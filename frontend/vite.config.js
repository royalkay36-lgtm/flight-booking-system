import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 127.0.0.1 thay vì localhost: Node trên Windows có thể phân giải localhost thành ::1 trong khi backend nghe IPv4
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
})
