/**
 * Latência simulada das fontes de exemplo (modo mock do `pnpm dev`): dá tempo de ver carregamento, progresso e
 * "gravando…" como no Dataverse. Nos testes (MODE "test") vira 0 ms: a resposta continua assíncrona (próxima volta
 * do event loop, e com timers falsos ainda depende de avançar o relógio), mas os testes deixam de ficar parados
 * esperando a "rede". Teste que precisa ver um estado intermediário deve segurar a promessa ele mesmo, não depender
 * do relógio.
 */
export const latenciaMock = (ms: number) => (import.meta.env.MODE === 'test' ? 0 : ms)
