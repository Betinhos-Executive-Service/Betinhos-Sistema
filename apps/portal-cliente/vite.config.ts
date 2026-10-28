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
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // O login agora tem duas etapas (e-mail + autenticador) antes da lista: 15 s ficou curto nesta máquina.
    testTimeout: 30_000,
    // @betinhos/ui é publicado como fonte TS (e importa CSS): o Vitest precisa transformá-lo.
    server: { deps: { inline: [/@betinhos(-executive-service)?\/(ui|tokens)/] } },
  },
})
