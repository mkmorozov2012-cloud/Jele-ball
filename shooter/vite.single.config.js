import { defineConfig } from 'vite';
// Сборка в один файл: формат IIFE (обычный скрипт), чтобы работало по двойному клику (file://).
// MOBILE=1 включает сенсорное управление всегда (отдельная версия для телефона).
const mobile = process.env.MOBILE === '1';
export default defineConfig({
  base: './',
  define: { __FORCE_TOUCH__: JSON.stringify(mobile) },
  build: { outDir: 'dist-single', chunkSizeWarningLimit: 3000, rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } } },
});
