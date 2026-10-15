import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 200_000,
    rollupOptions: {
      output: {
        // Cada chunk vira um WebResource (`cr40f_SistemaBetinhos/assets/<arquivo>`): o Dataverse só aceita
        // letras, números, pontos e barras no nome, então nada de hífen/sublinhado; o hash muda só
        // quando o conteúdo muda, e a publicação seguinte reaproveita o cache dos chunks iguais.
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
        hashCharacters: 'base36',
        // Sem isso o Rollup gera um chunk por ícone/componente compartilhado (dezenas de requisições de 200 B no 4G).
        experimentalMinChunkSize: 20_000,
        manualChunks: (id) => {
          // React (e helpers CommonJS) num chunk estável da carga inicial; sem isso o Rollup o puxa para dentro de `charts`.
          if (/\/node_modules\/(react|react-dom|scheduler|use-sync-external-store|react-is)\//.test(id) || id === '\0commonjsHelpers.js') return 'react'
          // Ícones compartilhados por várias telas num chunk só, pré-carregado com a entrada.
          if (id.includes('/node_modules/lucide-react/')) return 'icons'
          // Recharts e dependências (só o Dashboard usa): mudança no código do Dashboard não invalida ~400 kB de biblioteca no cache.
          if (/\/node_modules\/(recharts|victory-vendor|d3-[^/]+|@reduxjs|redux|react-redux|immer|reselect|decimal\.js-light|es-toolkit|eventemitter3)\//.test(id)) return 'charts'
          return undefined
        },
        sanitizeFileName: (name) => name.replace(/[^A-Za-z0-9./]/g, ''),
      },
    },
  },
  // Imports dinâmicos e preloads resolvem a partir da URL do próprio chunk (e não da página),
  // então funcionam tanto no `vite preview` (/assets) quanto no Dataverse (/WebResources/...).
  experimental: { renderBuiltUrl: (_filename, { hostType }) => (hostType === 'js' ? { relative: true } : undefined) },
  test: { setupFiles: ['./src/test-setup.ts'], testTimeout: 15_000 },
})
