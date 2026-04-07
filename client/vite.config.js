import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // GramJS requires buffer, crypto, events, stream, path, string_decoder
      include: ['buffer', 'crypto', 'events', 'stream', 'path', 'string_decoder', 'util', 'net', 'os', 'http', 'https'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000', // Node.js server port
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      external: ['net', 'fs']
    }
  }
});
