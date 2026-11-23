/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __BUILD_DATE__: string

interface ImportMetaEnv {
  /** URL do App Motoristas rodando local (com `?preview=1`), usada pelo preview da tela `#/app-motoristas` no `pnpm dev`. */
  readonly VITE_APP_MOTORISTAS_PREVIEW_URL?: string
}
