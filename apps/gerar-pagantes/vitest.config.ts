import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Uma única cópia do React nos testes, como no build (vite.config.ts).
  resolve: { dedupe: ['react', 'react-dom'] },
  test: { environment: 'jsdom', globals: true }
})
