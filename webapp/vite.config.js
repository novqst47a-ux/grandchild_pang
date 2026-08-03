import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Capacitor가 지원하는 구형 Android WebView에서도 문법 오류 없이 실행되도록 변환한다.
    target: 'chrome60',
  },
});
