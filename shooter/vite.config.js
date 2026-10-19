import { defineConfig } from 'vite';
// base './' — чтобы собранную игру можно было открыть из любой папки
export default defineConfig({ base: './', define: { __FORCE_TOUCH__: 'false' }, build: { chunkSizeWarningLimit: 1200 } });
