import { useCallback, useEffect, useState } from "react";
import { usuarioAtual } from "../termos/minhasMultasOffline.ts";
import { carregarNotaInfleet, type NotaInfleet } from "./notaInfleet.ts";
import { lerNotaCache, salvarNotaCache } from "./notaCache.ts";

// Início e Minha nota montam juntos na navegação: uma consulta só por vez.
let emAndamento: Promise<NotaInfleet> | null = null;

function buscar(carregar: () => Promise<NotaInfleet>) {
  emAndamento ??= carregar()
    .then((nota) => { salvarNotaCache(usuarioAtual(), nota); return nota; })
    .finally(() => { emAndamento = null; });
  return emAndamento;
}

// Mostra o cache na hora e só consulta a Infleet sem cache ou com ele vencido (6 h).
export function useNotaInfleet(carregar: () => Promise<NotaInfleet> = carregarNotaInfleet) {
  const [cache] = useState(() => lerNotaCache(usuarioAtual()));
  const [nota, setNota] = useState<NotaInfleet | null>(cache?.nota ?? null);
  const [carregando, setCarregando] = useState(!cache);
  const [erro, setErro] = useState(false);

  const atualizar = useCallback(async (mostrarErro: boolean) => {
    setCarregando(true);
    setErro(false);
    try { setNota(await buscar(carregar)); } catch { if (mostrarErro) setErro(true); } finally { setCarregando(false); }
  }, [carregar]);

  useEffect(() => {
    if (!cache?.fresca) void atualizar(!cache);
  }, [atualizar, cache]);

  return { nota, carregando, erro, recarregar: () => atualizar(true) };
}
