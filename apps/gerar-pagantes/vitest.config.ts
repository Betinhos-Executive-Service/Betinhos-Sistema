import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Uma única cópia do React nos testes, como no build (vite.config.ts).
  resolve: { dedupe: ['react', 'react-dom'] },
  // O 1º teste de App.test.tsx paga o carregamento a frio do jsdom e passa de 5 s no CI (como shell e portal-cliente).
  test: { environment: 'jsdom', globals: true, testTimeout: 15_000 }
})
