import { useSyncExternalStore } from "react";
import { configuracaoEfetiva, entradaDoCatalogo, hojeSaoPaulo, type ConfigEfetiva } from "@betinhos/app-config";
import { executeCustomApi } from "../data/dataverse/customApi.ts";
import { isMockRuntime, isPreviewMode, isPreviewOriginAllowed } from "../shared/modoPreview.ts";
import type { Screen } from "../types.ts";

// Configuração do App por perfil (spec 2026-11-23-config-app-motoristas-design.md, seção 6).
// O App pergunta ao Dataverse (Custom API cr40f_AppConfigEfetiva) o que o motorista pode usar, guarda a última resposta
// no aparelho e usa o padrão do catálogo quando não há leitura. Chave ausente = ligada. Config nova só vale no Início.

export const CONFIG_STORAGE_KEY = "app-motoristas-config-v1";
export const INTERVALO_RELEITURA_MS = 5 * 60 * 1000;
export const AVISO_MODULO_DESLIGADO = "Este módulo não está disponível para você";

export type FonteConfig = "padrao" | "guardada" | "servidor" | "preview";

type Armazenamento = Pick<Storage, "getItem" | "setItem">;

export type ConfigGuardada = { config: ConfigEfetiva; lidoEm: number };

type Estado = { config: ConfigEfetiva; fonte: FonteConfig; lidoEm: number | null };

export type Dependencias = {
  armazenamento: () => Armazenamento | null;
  ler: () => Promise<ConfigEfetiva>;
  agora: () => number;
  hoje: () => string;
  preview: boolean;
  /** Dev em localhost (fora do preview): chaves que o mock já mostrava e ficam ligadas na reserva do padrão. */
  reservaLocal?: Readonly<Record<string, boolean>>;
};

/** Tela do App → chave do catálogo que a governa. Telas fora do mapa (início, serviços, comunicados…) nunca são desligadas. */
const CHAVE_DA_TELA: Partial<Record<Screen, string>> = {
  historico: "history",
  detalhesHistorico: "history",
  checklists: "checklists",
  multas: "multas",
  treinamentos: "treinamentos",
  postosProximos: "postosProximos",
  solicitarManutencao: "maintenancePhoto",
  fotoSolicitacaoManutencao: "maintenancePhoto",
  previewFotoSolicitacaoManutencao: "maintenancePhoto",
  gastos: "expenses",
  fotoGasto: "expenses",
  previewFotoGasto: "expenses",
  gastosCartao: "expenses",
  gastosRelatorio: "expenses",
  colisoesInicio: "collisions",
  colisoes: "collisions",
  fotoColisao: "collisions",
  previewFotoColisao: "collisions",
  minhaNota: "minhaNota",
  boasIdeias: "ideas",
  cobrancaQr: "services.qrCharge",
  reciboPersonalizado: "services.personalReceipt"
};

export function chaveDaTela(tela: Screen): string | null {
  return CHAVE_DA_TELA[tela] ?? null;
}

/** Chave ausente = ligada; função só vale com o módulo pai ligado; chaves fixas (services, comunicados) nunca desligam. */
export function ligadoEm(config: ConfigEfetiva, chave: string): boolean {
  const entrada = entradaDoCatalogo(chave);
  if (entrada?.fixa) return true;
  if (config.chaves[chave] === false) return false;
  if (entrada?.pai && !ligadoEm(config, entrada.pai)) return false;
  return true;
}

/** Sem leitura nem versão guardada: o padrão do catálogo pelo vínculo do motorista (sem matriz). */
export function reservaDoPadrao(vinculo: number | null | undefined, hoje: string): ConfigEfetiva {
  return configuracaoEfetiva({ matriz: null, pessoa: { vinculo }, hoje, versao: null });
}

export function precisaReler(agora: number, lidoEm: number | null, intervalo = INTERVALO_RELEITURA_MS): boolean {
  return lidoEm === null || agora - lidoEm >= intervalo;
}

/** Resposta da Custom API (`Resultado` em JSON) → configuração; nada fora do formato entra. */
export function lerResultado(resposta: Record<string, unknown> | null | undefined): ConfigEfetiva {
  const bruto = resposta?.Resultado;
  const dados = typeof bruto === "string" ? JSON.parse(bruto) : bruto;
  const config = validarConfig(dados);
  if (!config) throw new Error("Resposta da configuração do App fora do formato esperado.");
  return config;
}

export function validarConfig(dados: unknown): ConfigEfetiva | null {
  const registro = dados as Partial<ConfigEfetiva> | null | undefined;
  if (!registro || typeof registro !== "object") return null;
  if (!registro.chaves || typeof registro.chaves !== "object" || Array.isArray(registro.chaves)) return null;
  const chaves: Record<string, boolean> = {};
  for (const [chave, valor] of Object.entries(registro.chaves)) {
    if (typeof valor === "boolean") chaves[chave] = valor;
  }
  return {
    versao: typeof registro.versao === "number" ? registro.versao : null,
    perfil: registro.perfil === "terceiro" ? "terceiro" : "proprio",
    piloto: registro.piloto === true,
    semVinculo: registro.semVinculo === true,
    chaves,
    origens: registro.origens && typeof registro.origens === "object" ? registro.origens : {}
  };
}

export function lerGuardada(armazenamento: Armazenamento | null): ConfigGuardada | null {
  try {
    const texto = armazenamento?.getItem(CONFIG_STORAGE_KEY);
    if (!texto) return null;
    const dados = JSON.parse(texto) as { config?: unknown; lidoEm?: unknown };
    const config = validarConfig(dados.config);
    if (!config || typeof dados.lidoEm !== "number") return null;
    return { config, lidoEm: dados.lidoEm };
  } catch {
    return null;
  }
}

function guardar(armazenamento: Armazenamento | null, entrada: ConfigGuardada) {
  try { armazenamento?.setItem(CONFIG_STORAGE_KEY, JSON.stringify(entrada)); } catch { /* sem armazenamento: vale só nesta sessão */ }
}

export function criarConfigApp(deps: Dependencias) {
  const reserva = (v: number | null | undefined): ConfigEfetiva => {
    const base = reservaDoPadrao(v, deps.hoje());
    return deps.reservaLocal ? { ...base, chaves: { ...base.chaves, ...deps.reservaLocal } } : base;
  };
  const inicial = deps.preview ? null : lerGuardada(deps.armazenamento());
  let vinculo: number | null | undefined;
  let estado: Estado = inicial
    ? { config: inicial.config, fonte: "guardada", lidoEm: inicial.lidoEm }
    : { config: reserva(undefined), fonte: deps.preview ? "preview" : "padrao", lidoEm: null };
  // Leitura recebida com o motorista fora do Início: só entra em `estado` quando ele volta.
  let pendente: Estado | null = null;
  let noInicio = true;
  let lendo: Promise<void> | null = null;
  let nomePreview = "";
  const ouvintes = new Set<() => void>();

  const avisar = () => ouvintes.forEach((ouvinte) => ouvinte());
  const aplicar = (novo: Estado) => { estado = novo; pendente = null; avisar(); };
  const receber = (novo: Estado) => {
    if (noInicio) aplicar(novo);
    else pendente = novo;
  };

  async function reler(opcoes: { forcar?: boolean } = {}) {
    // O preview nunca fala com o Dataverse: a config chega pelo pai (postMessage).
    if (deps.preview) return;
    if (!opcoes.forcar && !precisaReler(deps.agora(), estado.lidoEm)) return;
    if (lendo) return lendo;
    lendo = (async () => {
      try {
        const config = await deps.ler();
        const lidoEm = deps.agora();
        guardar(deps.armazenamento(), { config, lidoEm });
        receber({ config, fonte: "servidor", lidoEm });
      } catch {
        // Falha (inclusive MOTORISTA_INVALIDO): fica a última guardada ou o padrão do catálogo.
      } finally {
        lendo = null;
      }
    })();
    return lendo;
  }

  return {
    ligado: (chave: string) => ligadoEm(estado.config, chave),
    telaLigada: (tela: Screen) => {
      const chave = chaveDaTela(tela);
      return chave === null || ligadoEm(estado.config, chave);
    },
    config: () => estado.config,
    fonte: () => estado.fonte,
    nomePreview: () => nomePreview,
    subscribe: (ouvinte: () => void) => { ouvintes.add(ouvinte); return () => { ouvintes.delete(ouvinte); }; },
    reler,
    /** Vínculo do motorista (cr40f_tipodevinculo): só refina a reserva do padrão; não mexe em config lida. */
    definirVinculo(novo: number | null | undefined) {
      if (vinculo === novo) return;
      vinculo = novo;
      if (estado.fonte === "padrao") aplicar({ ...estado, config: reserva(vinculo) });
    },
    /** Avisa se o motorista está no Início; ao voltar para lá, a config recebida enquanto estava fora passa a valer. */
    definirNoInicio(valor: boolean) {
      noInicio = valor;
      if (valor && pendente) aplicar(pendente);
    },
    /** Preview: aplica a config enviada pela tela de Configuração, na hora. */
    aplicarPreview(config: ConfigEfetiva, nome = "") {
      nomePreview = nome;
      aplicar({ config, fonte: "preview", lidoEm: deps.agora() });
    },
    snapshot: () => estado
  };
}

function armazenamentoDoNavegador(): Armazenamento | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

async function lerDoDataverse(): Promise<ConfigEfetiva> {
  // Sem Funcionario: a Custom API resolve o motorista logado pelo e-mail.
  return lerResultado(await executeCustomApi("cr40f_AppConfigEfetiva", {}));
}

export const configApp = criarConfigApp({
  armazenamento: armazenamentoDoNavegador,
  ler: lerDoDataverse,
  agora: () => Date.now(),
  hoje: () => hojeSaoPaulo(new Date()),
  preview: isPreviewMode(),
  // Em localhost o mock sempre mostrou recibo personalizado e cobrança por QR: mantém, para o dev e os testes de tela.
  reservaLocal: isMockRuntime() && !isPreviewMode() ? { "services.qrCharge": true, "services.personalReceipt": true } : undefined
});

export const ligado = (chave: string) => configApp.ligado(chave);

/** Re-renderiza o componente quando a config aplicada muda. */
export function useConfigApp() {
  useSyncExternalStore(configApp.subscribe, configApp.snapshot);
  return { ligado: configApp.ligado, telaLigada: configApp.telaLigada, config: configApp.config() };
}

export const MENSAGEM_PREVIEW_PRONTO = "app-motoristas-preview:pronto";
export const MENSAGEM_PREVIEW_CONFIG = "app-motoristas-preview:config";

/** Preview: avisa o pai que está pronto e aplica a config que ele mandar (só de origem permitida). Devolve a função que desliga. */
export function iniciarPreview(
  alvo: Window = window,
  controlador: Pick<ReturnType<typeof criarConfigApp>, "aplicarPreview"> = configApp,
  aoAplicar?: () => void
): () => void {
  const aoReceber = (evento: MessageEvent) => {
    if (!isPreviewOriginAllowed(evento.origin, alvo.location.origin)) return;
    const dados = evento.data as { tipo?: unknown; config?: unknown; motorista?: { nome?: unknown } } | null;
    if (dados?.tipo !== MENSAGEM_PREVIEW_CONFIG) return;
    const config = validarConfig(dados.config);
    if (!config) return;
    controlador.aplicarPreview(config, typeof dados.motorista?.nome === "string" ? dados.motorista.nome : "");
    aoAplicar?.();
  };
  alvo.addEventListener("message", aoReceber);
  if (alvo.parent && alvo.parent !== alvo) alvo.parent.postMessage({ tipo: MENSAGEM_PREVIEW_PRONTO }, "*");
  return () => alvo.removeEventListener("message", aoReceber);
}
