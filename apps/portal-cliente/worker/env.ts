// Bindings e secrets do Worker (wrangler.jsonc + `wrangler secret put`). Tipos mínimos à mão, sem @cloudflare/workers-types.

export interface KV {
  get(chave: string): Promise<string | null>
  put(chave: string, valor: string, opts?: { expirationTtl?: number }): Promise<void>
  delete(chave: string): Promise<void>
}

export interface Limitador {
  limit(opts: { key: string }): Promise<{ success: boolean }>
}

export interface Env {
  KV: KV
  /** Por IP, todas as rotas /api. Sem o binding (teste), não limita. */
  RL_IP?: Limitador
  /** Por e-mail, nas rotas de login. */
  RL_EMAIL?: Limitador
  ASSETS?: { fetch(req: Request): Promise<Response> }
  DV_TENANT: string
  DV_CLIENT_ID: string
  DV_CLIENT_SECRET: string
  /** Ex.: https://org23b93544.crm2.dynamics.com */
  DV_URL: string
  /** URL SAS do flow "Portal cliente – e-mails". */
  EMAIL_FLOW_URL: string
  /** 32 bytes em base64: cifra o segredo TOTP gravado no Dataverse. */
  CHAVE_TOTP: string
  /** 32 bytes em base64: cifra os cookies de sessão e da etapa do autenticador. */
  CHAVE_SESSAO: string
}
