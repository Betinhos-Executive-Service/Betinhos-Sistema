// Repassa qualquer caminho ao Worker sem mudar nada: mesma URL (origem dos links novos), cabeçalhos, CF-Connecting-IP e WebSocket.
// Só o domínio do PROD vai ao Worker do PROD; o resto (domínio do DEV, pages.dev, previews) vai ao DEV.
interface Worker {
  fetch(req: Request): Promise<Response>
}
interface Env {
  PROD?: Worker
  DEV: Worker
}

const DOMINIO_PROD = 'acompanhe.betinhos.com.br'

export const onRequest = ({ request, env }: { request: Request; env: Env }): Promise<Response> =>
  (new URL(request.url).hostname === DOMINIO_PROD && env.PROD ? env.PROD : env.DEV).fetch(request)
