import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// Each entry is loaded by WordPress as a `type="module"` script; shared chunks
// (the Tailwind compiler) are imported relatively, so `base` must be relative.
export default defineConfig({
  plugins: [vue()],
  base: './',
  resolve: {
    // @iconify/tailwind4 imports these for its file loader, which the browser build never calls.
    alias: { 'node:fs': '/app/src/node-stub.ts', 'node:url': '/app/src/node-stub.ts' },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        admin: 'app/src/admin/main.ts',
        runtime: 'app/src/runtime.ts',
        gutenberg: 'app/src/gutenberg.ts',
        elementor: 'app/src/elementor.ts',
        'common-block': 'app/src/common-block.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  test: {
    include: ['app/src/**/*.test.ts'],
    css: true,
  },
})
