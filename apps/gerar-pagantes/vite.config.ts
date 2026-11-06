import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import packageJson from './package.json'

export default defineConfig({
  base: './',
  plugins: [react()],
  // O design system usa o React da tela como peer: uma única cópia no bundle.
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: {
    entries: ['index.html']
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_BUILD_ISO__: JSON.stringify(new Date().toISOString()),
    __APP_DATE__: JSON.stringify(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date()))
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Só .js e .css são publicados como web resource: a fonte do design system vai embutida no CSS.
    assetsInlineLimit: 200_000,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/gerar-pagantes.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (asset) => asset.name?.endsWith('.css') ? 'assets/gerar-pagantes.css' : 'assets/[name][extname]'
      }
    }
  }
})
