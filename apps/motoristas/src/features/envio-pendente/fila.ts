// Fila de envios pendentes do aparelho: o que o motorista finalizou sem conexão fica aqui até o Dataverse confirmar.
// Não expira enquanto pendente. O backend é injetável (IndexedDB no app, memória nos testes).
import type { DetailData, MaintenancePhotoKind } from "../../types";
import type { ChecklistDraft, ChecklistItem } from "../checklist/checklists";
import type { DriverVehicleChoice, InfleetVehicleResolution } from "../../lib/serviceVehicleInfleet";

/** Checklist de vistoria guardado inteiro: itens, respostas e fotos; os links das fotos já subidas ficam em `draft.enviadas`. */
export type ChecklistGuardado = {
  checklistId: string;
  placa: string;
  solicitadoEm: string;
  itens: ChecklistItem[];
  draft: ChecklistDraft;
};

export type TipoEnvio = "voucher" | "servico" | "manutencao" | "troca" | "checklist";

export type EstadoEnvio = "pendente" | "enviando" | "precisa-acao" | "falhou";
export type MotivoAcao = "sessao" | "carro";

// O item leva cópia própria da assinatura e das fotos (IndexedDB da fila, sem expiração). O rascunho de mídia
// (mediaDraftStore, 7 dias) é só da tela: expirar ou limpar o rascunho não afeta o envio, que usa sempre esta cópia.
export type FilaItem = {
  id: string;
  detailId: string;
  detailType: DetailData["type"] | "CHECKLIST";
  dataverseId: string;
  /** Texto para exibir: "OS-1234". */
  titulo: string;
  tipo: TipoEnvio;
  /** Ausente só no checklist, que não é um detalhe da agenda. */
  detail?: DetailData;
  checklist?: ChecklistGuardado;
  fields: Record<string, string>;
  signatureDataUrl?: string;
  photos?: Partial<Record<MaintenancePhotoKind, string>>;
  /** Horário em que o motorista finalizou, capturado no aparelho (ISO). Vai ao Dataverse no lugar do horário do reenvio. */
  finalizadoEm: string;
  criadoEm: string;
  tentativas: number;
  ultimoErro?: string;
  proximaTentativaEm?: number;
  estado: EstadoEnvio;
  motivo?: MotivoAcao;
  vehicleResolution?: InfleetVehicleResolution;
  vehicleChoice?: DriverVehicleChoice | null;
  skipVehicle?: boolean;
  /** Voucher: `new_linkdovoucher` lido antes do primeiro POST ao Flow; gravado uma vez, nunca sobrescrito. */
  linkAnterior?: string;
};

export type FilaBackend = {
  getAll(): Promise<FilaItem[]>;
  put(item: FilaItem): Promise<void>;
  delete(id: string): Promise<void>;
};

export function createMemoryBackend(): FilaBackend {
  const itens = new Map<string, FilaItem>();
  return {
    getAll: async () => [...itens.values()].map((item) => structuredClone(item)),
    put: async (item) => { itens.set(item.id, structuredClone(item)); },
    delete: async (id) => { itens.delete(id); }
  };
}

const DB_NAME = "app-motoristas-envio-pendente";
const STORE_NAME = "itens";

export function createIndexedDbBackend(): FilaBackend {
  const abrir = () => new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Armazenamento local indisponível."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponível."));
  });
  const transacao = async <T,>(modo: IDBTransactionMode, operar: (store: IDBObjectStore) => IDBRequest<T>) => {
    const db = await abrir();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, modo);
        const request = operar(tx.objectStore(STORE_NAME));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    getAll: () => transacao("readonly", (store) => store.getAll() as IDBRequest<FilaItem[]>),
    put: async (item) => { await transacao("readwrite", (store) => store.put(item)); },
    delete: async (id) => { await transacao("readwrite", (store) => store.delete(id)); }
  };
}

export const chaveDoChecklist = (checklistId: string) => `CHECKLIST:${checklistId.replace(/[{}]/g, "").toLowerCase()}`;

export function chaveDoEnvio(detail: Pick<DetailData, "type" | "id" | "dataverse">) {
  return `${detail.type}:${detail.dataverse?.id ?? detail.id}`;
}

/** "OS-1234" a partir do número do serviço (cr40f_id); sem número, o id do detalhe. */
export function tituloDoEnvio(detail: Pick<DetailData, "id" | "dataverse">) {
  const numero = String(detail.dataverse?.record?.cr40f_id ?? "").trim();
  if (!numero) return detail.id;
  return /^\d+$/.test(numero) ? `OS-${numero}` : numero;
}

export type Fila = ReturnType<typeof createFila>;

export function createFila(backend: FilaBackend) {
  let itens: FilaItem[] = [];
  let carregada: Promise<void> | null = null;
  let escrita: Promise<void> = Promise.resolve();
  const adicionando = new Map<string, Promise<FilaItem>>();
  const ouvintes = new Set<() => void>();

  const avisar = () => ouvintes.forEach((ouvinte) => ouvinte());
  const gravar = (operacao: () => Promise<void>) => {
    const resultado = escrita.then(operacao);
    escrita = resultado.catch(() => undefined);
    return resultado;
  };

  // Item que ficou "enviando" (app fechado no meio) ou parado por sessão volta a pendente ao reabrir.
  const reabrir = (item: FilaItem): FilaItem =>
    item.estado === "enviando" || (item.estado === "precisa-acao" && item.motivo === "sessao")
      ? { ...item, estado: "pendente", motivo: undefined, proximaTentativaEm: undefined }
      : item;

  // Só vale dentro da trava do processador: nenhum outro envio roda, então "enviando" salvo é resto de app fechado.
  const reabrirEnviando = (item: FilaItem): FilaItem => (item.estado === "enviando" ? { ...item, estado: "pendente", proximaTentativaEm: undefined } : item);

  const ordenar = (lista: FilaItem[]) => [...lista].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id));

  return {
    carregar() {
      carregada ??= backend.getAll().then((salvos) => {
        // Itens já adicionados antes do fim da leitura (add concorrente) prevalecem.
        const novos = salvos.map(reabrir).filter((salvo) => !itens.some((item) => item.id === salvo.id));
        itens = ordenar([...itens, ...novos]);
        avisar();
      }).catch((error) => {
        carregada = null;
        throw error;
      });
      return carregada;
    },
    /** Relê o aparelho: outra aba pode ter enviado ou adicionado itens desde a última leitura. */
    async sincronizar() {
      await this.carregar();
      await escrita;
      itens = ordenar((await backend.getAll()).map(reabrirEnviando));
      avisar();
    },
    getSnapshot: () => itens,
    subscribe(ouvinte: () => void) {
      ouvintes.add(ouvinte);
      return () => { ouvintes.delete(ouvinte); };
    },
    /** Grava no aparelho antes de devolver; se já existe envio do mesmo serviço, devolve o existente (nunca duplica). */
    async adicionar(item: FilaItem): Promise<FilaItem> {
      await this.carregar();
      const existente = itens.find((atual) => atual.id === item.id);
      if (existente) return existente;
      // Clique duplo: a segunda chamada espera a primeira em vez de gravar e listar de novo.
      const emAndamento = adicionando.get(item.id);
      if (emAndamento) return emAndamento;
      const novo = (async () => {
        await gravar(() => backend.put(item));
        itens = ordenar([...itens.filter((atual) => atual.id !== item.id), item]);
        avisar();
        return item;
      })().finally(() => adicionando.delete(item.id));
      adicionando.set(item.id, novo);
      return novo;
    },
    async atualizar(id: string, mudanca: Partial<FilaItem>): Promise<FilaItem | null> {
      const atual = itens.find((item) => item.id === id);
      if (!atual) return null;
      const novo = { ...atual, ...mudanca };
      await gravar(() => backend.put(novo));
      itens = itens.map((item) => (item.id === id ? novo : item));
      avisar();
      return novo;
    },
    async remover(id: string) {
      if (!itens.some((item) => item.id === id)) return;
      await gravar(() => backend.delete(id));
      itens = itens.filter((item) => item.id !== id);
      avisar();
    }
  };
}

export const filaDeEnvio: Fila = createFila(createIndexedDbBackend());

/** Serviço com envio guardado no aparelho: continua na agenda, mas não pode ser finalizado de novo. */
export const temEnvioPendente = (detail: Pick<DetailData, "type" | "id" | "dataverse">) =>
  filaDeEnvio.getSnapshot().some((item) => item.id === chaveDoEnvio(detail));
