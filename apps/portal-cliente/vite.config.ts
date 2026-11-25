import { defineConfig } from 'vitest/config'
import { loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { buscarEnderecos } from './worker/enderecos'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

/** Só no `pnpm dev`: a busca de endereço do mock usa a TomTom de verdade com TOMTOM_KEY do .env.local (fora do git); a chave fica no servidor. */
function enderecosDev(): Plugin {
  return {
    name: 'portal-enderecos-dev',
    apply: 'serve',
    configureServer(server) {
      const chave = loadEnv(server.config.mode, process.cwd(), '').TOMTOM_KEY
      server.middlewares.use('/__dev/enderecos', async (req, res) => {
        if (!chave) { res.statusCode = 204; res.end(); return }
        const q = new URL(req.url ?? '', 'http://dev').searchParams.get('q') ?? ''
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(await buscarEnderecos({ TOMTOM_KEY: chave }, q)))
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    enderecosDev(),
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
