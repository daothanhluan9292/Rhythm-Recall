import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

// vite.config.ts
export default defineConfig({
  base: '/TEN_REPO_CUA_BAN/', // Thêm dòng này
  plugins: [react(), tailwindcss()],
  // ... các cấu hình khác
})
