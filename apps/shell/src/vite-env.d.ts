/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __BUILD_DATE__: string

interface ImportMetaEnv {
  /** URL do Power Automate HTTP que recebe o arquivo do currículo. Só no .env local; nunca versionar. */
  readonly VITE_CURRICULO_UPLOAD_URL?: string
}
