// Primeiro import de main.tsx: em ?preview=1 troca o armazenamento do navegador por cópias em memória,
// para o preview nunca ler nem gravar o que é do motorista real (rascunhos, fila, tour, cache da agenda).
import { isPreviewMode } from "./modoPreview";

function storageEmMemoria(): Storage {
  const dados = new Map<string, string>();
  return {
    get length() { return dados.size; },
    clear: () => dados.clear(),
    getItem: (chave) => (dados.has(chave) ? dados.get(chave)! : null),
    key: (indice) => Array.from(dados.keys())[indice] ?? null,
    removeItem: (chave) => { dados.delete(chave); },
    setItem: (chave, valor) => { dados.set(chave, String(valor)); }
  } as Storage;
}

export function isolarArmazenamentoDoPreview(alvo: Window = window) {
  const definir = (nome: "localStorage" | "sessionStorage" | "indexedDB", valor: unknown) => {
    try { Object.defineProperty(alvo, nome, { configurable: true, value: valor }); } catch { /* ignora: navegador sem permissão para redefinir */ }
  };
  definir("localStorage", storageEmMemoria());
  definir("sessionStorage", storageEmMemoria());
  definir("indexedDB", undefined);
}

if (typeof window !== "undefined" && isPreviewMode()) isolarArmazenamentoDoPreview();
