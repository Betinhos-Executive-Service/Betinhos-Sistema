import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearAllChaptersSeen, hasSeenChapter, markChapterSeen, missingRequiredSteps, pickChapter, type TourChapter, type TourCloseReason } from "./tour";
import { tourChaptersForScreen } from "./tourChapters";
import { findTourTarget, hasTourProbe } from "./tourDom";
import { hasDataverseRuntime, LOCAL_DRIVER_ID } from "../data/dataverse/cliente";
import type { LoadingOverlayState } from "../shared/ui/LoadingOverlay";
import type { ToastTone } from "../shared/ui/LocalToast";
import type { Screen } from "../types";

type Options = {
  // Escolha do carro, operação remota ou envio de gasto na tela: o tour não abre por cima.
  blocked: boolean;
  criticalError: string;
  dataLoading: LoadingOverlayState | null;
  driverContextId: string | undefined;
  screen: Screen;
  selectedChecklistId: string;
  selectedComunicadoId: string;
  selectedTreinamentoId: string;
  setToast: (message: string, tone?: ToastTone) => void;
};

// Tour guiado por capítulos: um por tela, aberto na primeira visita e pelo botão "?" do cabeçalho.
export function useTour({ blocked, criticalError, dataLoading, driverContextId, screen, selectedChecklistId, selectedComunicadoId, selectedTreinamentoId, setToast }: Options) {
  const [tourChapter, setTourChapter] = useState<TourChapter | null>(null);

  // Chave da preferência do tour: id real do motorista; em modo mock (sem Xrm) o contexto não é carregado,
  // então usa o mesmo id do fallback local de getDriverContext.
  const tourDriverId = driverContextId ?? (hasDataverseRuntime() ? "" : LOCAL_DRIVER_ID);

  // Tour por capítulos: cada tela tem o seu, aberto sozinho na primeira visita (por motorista, neste aparelho)
  // e sempre reabrível pelo botão "?" do cabeçalho. Capítulo que fecha por "indisponivel" (nenhum elemento na
  // tela) não grava "visto"; o conjunto evita reabrir em loop até a tela mudar.
  const tourCandidates = useMemo(() => tourChaptersForScreen(screen), [screen]);
  const tourUnavailableRef = useRef(new Set<string>());
  const tourBlocked = blocked;
  // Sub-estados dentro da mesma tela (ler comunicado, preencher checklist) também disparam o capítulo certo.
  const [tourTermoId, setTourTermoId] = useState("");
  const comunicadoOpen = Boolean(selectedComunicadoId);
  const checklistOpen = Boolean(selectedChecklistId);
  const termoOpen = Boolean(tourTermoId);
  const treinamentoOpen = Boolean(selectedTreinamentoId);

  // Mudou a tela ou o sub-estado (abrir um comunicado, um termo): o capítulo aberto e os descartes valem só para a visão anterior.
  useEffect(() => {
    tourUnavailableRef.current.clear();
    setTourChapter(null);
  }, [screen, comunicadoOpen, checklistOpen, termoOpen, treinamentoOpen]);

  useEffect(() => setTourTermoId(""), [screen]);

  useEffect(() => {
    if (tourChapter || tourBlocked || !tourDriverId || dataLoading || criticalError || !tourCandidates.length) return;
    // Listas e formulários carregam depois da tela: espera os elementos obrigatórios aparecerem (até ~6 s) em vez
    // de abrir um guia pela metade e marcá-lo como visto.
    let attempts = 0;
    let timer = 0;
    const tryOpen = () => {
      const chapter = pickChapter(tourCandidates, hasTourProbe);
      if (!chapter || chapter.auto === false) return;
      if (tourUnavailableRef.current.has(chapter.id) || hasSeenChapter(localStorage, tourDriverId, chapter.id)) return;
      if (missingRequiredSteps(chapter.steps, (step) => Boolean(findTourTarget(step))).length) {
        attempts += 1;
        if (attempts < 8) timer = window.setTimeout(tryOpen, 700);
        return;
      }
      setTourChapter(chapter);
    };
    timer = window.setTimeout(tryOpen, 700);
    return () => window.clearTimeout(timer);
    // screen/comunicadoOpen/checklistOpen/termoOpen/treinamentoOpen não são lidos aqui: reiniciam o atraso quando a visão muda.
  }, [screen, comunicadoOpen, checklistOpen, termoOpen, treinamentoOpen, tourChapter, tourBlocked, tourDriverId, dataLoading, criticalError, tourCandidates]);

  const closeTour = (reason: TourCloseReason) => {
    const closing = tourChapter;
    setTourChapter(null);
    if (!closing) return;
    if (reason === "indisponivel") {
      tourUnavailableRef.current.add(closing.id);
      setToast("Ainda não há o que explicar nesta tela. Tente de novo em instantes.");
    } else if (tourDriverId) markChapterSeen(localStorage, tourDriverId, closing.id);
  };

  const openTourHelp = useCallback(() => {
    const chapter = pickChapter(tourCandidates, hasTourProbe);
    if (chapter) setTourChapter(chapter);
  }, [tourCandidates]);

  // "Ver tour de novo": o guia completo volta, começando pelo Início, e os capítulos das telas voltam a abrir.
  const restartTour = () => {
    if (tourDriverId) clearAllChaptersSeen(localStorage, tourDriverId);
    tourUnavailableRef.current.clear();
    const inicio = tourChaptersForScreen("inicio")[0];
    if (inicio) setTourChapter(inicio);
  };

  return { closeTour, openTourHelp, restartTour, setTourTermoId, tourCandidates, tourChapter, tourDriverId };
}
