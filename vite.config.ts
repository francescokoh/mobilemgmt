import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 상대 경로 base: GitHub Pages의 저장소 하위 경로(/<repo>/)에서도 동작한다.
export default defineConfig({
  base: './',
  plugins: [react()],
});
