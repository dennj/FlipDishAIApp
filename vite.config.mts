import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],
    base: 'http://localhost:4444/',
    build: {
        outDir: 'assets',
        rollupOptions: {
            input: {
                'menu-carousel': path.resolve(__dirname, 'src/widgets/menu-carousel/index.html'),
                'login': path.resolve(__dirname, 'src/widgets/login/index.html'),
                'basket': path.resolve(__dirname, 'src/widgets/basket/index.html'),
            },
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: 'chunks/[name].js',
                assetFileNames: '[name].[ext]',
            },
        },
    },
});
