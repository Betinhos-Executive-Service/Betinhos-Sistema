// Tour guiado por capítulos: cada tela do App tem um capítulo com passos ancorados em elementos reais.
// Lógica pura, sem DOM, para ser testável com node --test. A busca de elementos fica em tourDom.ts.

export type TourStep = {
  id: string;
  title: string;
  /** Um parágrafo por item; cada um vira uma linha curta no cartão. */
  text: readonly string[];
  /** Seletor CSS do elemento destacado. Sem seletor, o passo é um cartão centralizado (introdução, resumo). */
  target?: string;
  /** Regex (sem flags, aplicada sem diferenciar maiúsculas) que o texto do elemento precisa casar. */
  match?: string;
  /** Amplia o destaque: "parent" usa o pai do elemento; qualquer outro valor é um seletor para closest(). */
  within?: string;
  /** Passo que só existe em certas situações (sem dado, outro tipo de serviço). Ausente: pulado sem erro. */
  optional?: boolean;
};

export type TourChapter = {
  id: string;
  title: string;
  /** Seletor que precisa existir para o capítulo valer (distingue lista de detalhe dentro da mesma tela). */
  probe?: string;
  /** false: só abre pelo botão "?" (ex.: câmera, onde um aviso automático atrapalharia). Padrão: true. */
  auto?: boolean;
  steps: readonly TourStep[];
};

export type TourCloseReason = "concluido" | "pulado" | "indisponivel";

const TOUR_STORAGE_PREFIX = "app-motoristas-tour-v2";
/** Capítulo coringa: marcado como visto, dispensa o guia inteiro (usado também pelos roteiros de QA). */
export const TOUR_ALL_CHAPTERS = "*";

// Preferência local por motorista e por capítulo: trocar de aparelho ou limpar o navegador faz o tour voltar.
export function tourStorageKey(driverId: string, chapterId: string) {
  return `${TOUR_STORAGE_PREFIX}:${driverId}:${chapterId}`;
}

export function hasSeenChapter(storage: Pick<Storage, "getItem">, driverId: string, chapterId: string): boolean {
  try {
    return storage.getItem(tourStorageKey(driverId, chapterId)) === "visto" || storage.getItem(tourStorageKey(driverId, TOUR_ALL_CHAPTERS)) === "visto";
  } catch {
    // Sem storage (modo privado restrito): tratar como visto para não insistir a cada abertura.
    return true;
  }
}

export function markChapterSeen(storage: Pick<Storage, "setItem">, driverId: string, chapterId: string): void {
  try {
    storage.setItem(tourStorageKey(driverId, chapterId), "visto");
  } catch {
    // Sem storage não há o que persistir; o tour não pode bloquear o uso.
  }
}

/** "Ver tour de novo": apaga a marcação de todos os capítulos do motorista para o guia completo voltar. */
export function clearAllChaptersSeen(storage: Pick<Storage, "length" | "key" | "removeItem">, driverId: string): void {
  try {
    const prefix = `${TOUR_STORAGE_PREFIX}:${driverId}:`;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  } catch {
    // idem
  }
}

/** Mantém só os passos cujo elemento existe na tela atual; passo sem seletor sempre fica. */
export function resolveTourSteps(steps: readonly TourStep[], hasTarget: (step: TourStep) => boolean): TourStep[] {
  return steps.filter((step) => {
    if (!step.target) return true;
    try {
      return hasTarget(step);
    } catch {
      return false;
    }
  });
}

/** Primeiro capítulo candidato cujo `probe` existe; sem probe, o capítulo vale sempre. */
export function pickChapter(candidates: readonly TourChapter[], hasProbe: (probe: string) => boolean): TourChapter | null {
  for (const chapter of candidates) {
    if (!chapter.probe) return chapter;
    try {
      if (hasProbe(chapter.probe)) return chapter;
    } catch {
      // seletor inválido: tenta o próximo
    }
  }
  return null;
}

export type TourBox = { top: number; left: number; width: number; height: number };

/** Recorte do spotlight com folga ao redor do elemento, sem sair da viewport. */
export function spotlightBox(rect: TourBox, viewport: { width: number; height: number }, padding = 6): TourBox {
  const top = Math.max(0, rect.top - padding);
  const left = Math.max(0, rect.left - padding);
  const bottom = Math.min(viewport.height, rect.top + rect.height + padding);
  const right = Math.min(viewport.width, rect.left + rect.width + padding);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export type TourCardPlacement = { side: "below" | "above" | "bottom" | "center"; top: number };

/**
 * Posição vertical do cartão: abaixo do destaque quando cabe, senão acima; se não couber em nenhum
 * lado, encosta no rodapé da viewport. Sem destaque (passo de introdução), centraliza. O cartão nunca
 * fica fora da tela, então o botão de avançar está sempre visível.
 */
export function placeTourCard(
  spotlight: TourBox | null,
  cardHeight: number,
  viewportHeight: number,
  gap = 12,
  margin = 12
): TourCardPlacement {
  const bottomTop = Math.max(margin, viewportHeight - margin - cardHeight);
  if (!spotlight) return { side: "center", top: Math.max(margin, Math.round((viewportHeight - cardHeight) / 2)) };

  const belowTop = spotlight.top + spotlight.height + gap;
  if (belowTop + cardHeight + margin <= viewportHeight) return { side: "below", top: belowTop };

  const aboveTop = spotlight.top - gap - cardHeight;
  if (aboveTop >= margin) return { side: "above", top: aboveTop };

  return { side: "bottom", top: bottomTop };
}

export function tourProgressLabel(index: number, total: number) {
  return `Passo ${index + 1} de ${total}`;
}
