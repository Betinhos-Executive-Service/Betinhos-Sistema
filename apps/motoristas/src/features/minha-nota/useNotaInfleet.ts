import { useCallback, useEffect, useState } from "react";
import { usuarioAtual } from "../termos/minhasMultasOffline.ts";
import { carregarNotaInfleet, faixaDaNota, notaFmt, type NotaInfleet } from "./notaInfleet.ts";
import { lerNotaCache, salvarNotaCache } from "./notaCache.ts";

const ESPERA_APOS_FALHA_MS = 5 * 60 * 1000;

// Início e Minha nota montam juntos na navegação: uma consulta só por vez.
let emAndamento: Promise<NotaInfleet> | null = null;
// Sem rede, a Início não repete a consulta de ~3 s a cada volta.
let ultimaFalhaEm = 0;

function buscar(carregar: () => Promise<NotaInfleet>) {
  emAndamento ??= carregar()
    .then((nota) => { salvarNotaCache(usuarioAtual(), nota); return nota; })
    .catch((erro: unknown) => { ultimaFalhaEm = Date.now(); throw erro; })
    .finally(() => { emAndamento = null; });
  return emAndamento;
}

// Mostra o cache na hora e só consulta a Infleet sem cache ou com ele vencido (6 h).
export function useNotaInfleet() {
  const [cache] = useState(() => lerNotaCache(usuarioAtual()));
  const [nota, setNota] = useState<NotaInfleet | null>(cache?.nota ?? null);
  const [carregando, setCarregando] = useState(!cache);
  const [erro, setErro] = useState(false);

  const atualizar = useCallback(async (mostrarErro: boolean) => {
    setCarregando(true);
    setErro(false);
    try { setNota(await buscar(carregarNotaInfleet)); } catch { if (mostrarErro) setErro(true); } finally { setCarregando(false); }
  }, []);

  useEffect(() => {
    if (!cache?.fresca) void atualizar(!cache);
  }, [atualizar, cache]);

  const recarregar = useCallback(() => atualizar(true), [atualizar]);
  return { nota, carregando, erro, recarregar };
}

// Item da grade do Início: a nota na cor da faixa, ou null para ficar o ícone.
export function useNotaNaGrade() {
  const [cache] = useState(() => lerNotaCache(usuarioAtual()));
  const [nota, setNota] = useState(cache?.nota ?? null);

  useEffect(() => {
    if (cache?.fresca || Date.now() - ultimaFalhaEm < ESPERA_APOS_FALHA_MS) return;
    buscar(carregarNotaInfleet).then(setNota, () => undefined);
  }, [cache]);

  return nota?.situacao === "ok" ? { valor: notaFmt(nota.nota), ...faixaDaNota(nota.nota) } : null;
}
