// Repassa qualquer caminho ao Worker sem mudar nada: mesma URL (origem dos links novos), cabeçalhos, CF-Connecting-IP e WebSocket.
interface Env {
  WORKER: { fetch(req: Request): Promise<Response> }
}

export const onRequest = ({ request, env }: { request: Request; env: Env }): Promise<Response> => env.WORKER.fetch(request)
