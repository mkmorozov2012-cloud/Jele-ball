import { defineConfig } from 'vite';
// base './' — чтобы собранную игру можно было открыть из любой папки
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 1200 } });
