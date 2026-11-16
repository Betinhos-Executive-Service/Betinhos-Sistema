/** Uuid (ou um id aleatório onde o navegador não tem randomUUID). */
export function novoIdProva() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// Id da sessão da câmera de um registro novo (despesa, solicitação de manutenção, colisão), estável enquanto o rascunho
// existe: reabrir a câmera no mesmo rascunho reusa o id, então escolher de novo o mesmo arquivo não vira "repetida". No
// registrar ele vai como sessaoId, ao lado do id real; o fluxo encerra a sessão quando conclui ou descarta o rascunho.
const sessoes = new Map<string, string>();

export function sessaoDoRascunho(rascunho: string) {
  let id = sessoes.get(rascunho);
  if (!id) {
    id = `novo-${novoIdProva()}`;
    sessoes.set(rascunho, id);
  }
  return id;
}

export function encerrarSessaoDoRascunho(rascunho: string) {
  sessoes.delete(rascunho);
}
