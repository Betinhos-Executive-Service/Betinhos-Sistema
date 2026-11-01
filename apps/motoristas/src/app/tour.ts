// Tour de primeiro acesso: passos ancorados em elementos reais da tela Início (atributo data-tour).
// Lógica pura, sem DOM, para ser testável com node --test.

export type TourStep = {
  id: string;
  /** Valor do atributo data-tour do elemento destacado. */
  anchor: string;
  title: string;
  text: string;
};

export type TourCloseReason = "concluido" | "pulado" | "indisponivel";

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "servicos",
    anchor: "servicos",
    title: "Serviços do dia",
    text: "Aqui ficam os serviços de hoje e de amanhã, com horário, passageiro e trajeto. Toque em um serviço para abrir o detalhe."
  },
  {
    id: "etapas",
    anchor: "servicos",
    title: "Etapas e voucher",
    text: "Dentro do serviço você registra cada etapa: Receber o passageiro, Finalizar e emitir o Voucher, que o passageiro assina na sua tela."
  },
  {
    id: "troca-checklist",
    anchor: "checklists",
    title: "Troca de carro e checklist",
    text: "A troca de carro entra na sua agenda como um serviço. Ao assumir um veículo, faça aqui a vistoria com fotos antes de sair."
  },
  {
    id: "gastos",
    anchor: "expenses",
    title: "Gastos",
    text: "Pedágio, combustível, estacionamento: fotografe o comprovante e registre o gasto por aqui, de preferência no mesmo dia."
  },
  {
    id: "comunicados",
    anchor: "comunicados",
    title: "Comunicados",
    text: "Avisos da operação chegam aqui. Alguns pedem ciência com assinatura, e o Início mostra quantos ainda estão pendentes."
  },
  {
    id: "multas",
    anchor: "multas",
    title: "Multas",
    text: "Termos de multa para assinar aparecem aqui, com o prazo. A assinatura é feita no próprio celular."
  },
  {
    id: "manutencao",
    anchor: "maintenancePhoto",
    title: "Manutenção",
    text: "Notou algo no carro? Solicite o reparo com foto e descrição. A equipe acompanha a partir daqui."
  }
];

const TOUR_STORAGE_PREFIX = "app-motoristas-tour-v1";

// Preferência local por motorista: trocar de aparelho ou limpar o navegador faz o tour voltar.
export function tourStorageKey(driverId: string) {
  return `${TOUR_STORAGE_PREFIX}:${driverId}`;
}

export function hasSeenTour(storage: Pick<Storage, "getItem">, driverId: string): boolean {
  try {
    return storage.getItem(tourStorageKey(driverId)) === "visto";
  } catch {
    // Sem storage (modo privado restrito): tratar como visto para não insistir a cada abertura.
    return true;
  }
}

export function markTourSeen(storage: Pick<Storage, "setItem">, driverId: string): void {
  try {
    storage.setItem(tourStorageKey(driverId), "visto");
  } catch {
    // Sem storage não há o que persistir; o tour não pode bloquear o uso.
  }
}

export function clearTourSeen(storage: Pick<Storage, "removeItem">, driverId: string): void {
  try {
    storage.removeItem(tourStorageKey(driverId));
  } catch {
    // idem
  }
}

/** Mantém só os passos cujo elemento existe na tela atual; passo sem âncora é pulado sem erro. */
export function resolveTourSteps(steps: readonly TourStep[], hasAnchor: (anchor: string) => boolean): TourStep[] {
  return steps.filter((step) => {
    try {
      return hasAnchor(step.anchor);
    } catch {
      return false;
    }
  });
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

export type TourCardPlacement = { side: "below" | "above" | "bottom"; top: number };

/**
 * Posição vertical do cartão: abaixo do destaque quando cabe, senão acima; se não couber em nenhum
 * lado, encosta no rodapé da viewport. O cartão nunca fica fora da tela, então o botão de avançar
 * está sempre visível.
 */
export function placeTourCard(
  spotlight: TourBox | null,
  cardHeight: number,
  viewportHeight: number,
  gap = 12,
  margin = 12
): TourCardPlacement {
  const bottomTop = Math.max(margin, viewportHeight - margin - cardHeight);
  if (!spotlight) return { side: "bottom", top: bottomTop };

  const belowTop = spotlight.top + spotlight.height + gap;
  if (belowTop + cardHeight + margin <= viewportHeight) return { side: "below", top: belowTop };

  const aboveTop = spotlight.top - gap - cardHeight;
  if (aboveTop >= margin) return { side: "above", top: aboveTop };

  return { side: "bottom", top: bottomTop };
}

export function tourProgressLabel(index: number, total: number) {
  return `Passo ${index + 1} de ${total}`;
}
