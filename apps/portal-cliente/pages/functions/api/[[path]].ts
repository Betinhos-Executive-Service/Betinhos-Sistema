// Repassa /api/* ao Worker do portal sem mudar nada: mesma URL (o Worker confere Origin contra ela), cookies e CF-Connecting-IP.
interface Env {
  API: { fetch(req: Request): Promise<Response> }
}

export const onRequest = ({ request, env }: { request: Request; env: Env }): Promise<Response> => env.API.fetch(request)
