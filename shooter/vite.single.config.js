import { defineConfig } from 'vite';
// Сборка в один файл: формат IIFE (обычный скрипт), чтобы работало по двойному клику (file://)
export default defineConfig({
  base: './',
  build: { outDir: 'dist-single', chunkSizeWarningLimit: 3000, rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } } },
});
