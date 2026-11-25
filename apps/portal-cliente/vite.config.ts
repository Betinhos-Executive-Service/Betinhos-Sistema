import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [
    react(),
    // Versão em texto na página: o CI lê o que está no ar (scripts/versao-publicada.mjs) e confere o deploy.
    { name: 'portal-versao', transformIndexHtml: (html: string) => html.replace('</head>', `    <meta name="portal-versao" content="${packageJson.version}" />\n  </head>`) },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // O login agora tem duas etapas (e-mail + senha) antes da lista: 15 s ficou curto nesta máquina.
    testTimeout: 30_000,
    // @betinhos/ui é publicado como fonte TS (e importa CSS): o Vitest precisa transformá-lo.
    server: { deps: { inline: [/@betinhos(-executive-service)?\/(ui|tokens)/] } },
  },
})
