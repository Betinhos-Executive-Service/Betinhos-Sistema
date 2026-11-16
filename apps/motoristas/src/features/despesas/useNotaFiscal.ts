import { useRef, useState } from "react";
import type { ToastTone } from "../../shared/ui/LocalToast";
import { reportAppError } from "../../shared/appErrorLogger";
import type { Screen } from "../../types";
import { ehPdf } from "../fotos/mediaDrafts";
import { conferirChaveNotaRemote, type ExtrasDaNota } from "../fotos/provaRemota";
import { chaveDoCodigo, chaveDoPdf, conferirChaveDaDespesa, validarChave, type NotaDoComprovante, type OrigemChave } from "./chaveNotaFiscal";
import type { ExpenseDraft, ExpensePhoto } from "./expenses.types";
import type { CodigoLido } from "./leitorCodigo";
import type { ChaveSugerida } from "./NotaFiscalSheet";
import type { QuickReadFilledFields } from "./receiptQuickRead";

export const DICA_CODIGO = "Aponte para o QR do cupom ou para o código de barras do DANFE.";
const DICA_NAO_E_NOTA = "Este código não é a chave de uma nota fiscal. Aponte para o QR do cupom ou para o código de barras do DANFE.";
const DICA_FOTO_SEM_CODIGO = "Não li o código nesta foto. Aproxime o celular, evite reflexo e tente de novo.";

export type NotaSheetState = { photoId: string; sugerida?: ChaveSugerida | null; erro?: string };

type Options = {
  setExpensePhotos: React.Dispatch<React.SetStateAction<ExpensePhoto[]>>;
  expenseDraftRef: React.MutableRefObject<ExpenseDraft>;
  /** Gasto do cartão em preenchimento: a despesa já existe e os anexos dela não contam como repetida. */
  despesaExistenteId: () => string | null;
  setScreen: (screen: Screen) => void;
  setToast: (message: string, tone?: ToastTone) => void;
};

function bytesDoDataUrl(dataUrl: string) {
  const binario = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/**
 * Valor alterado: o motorista mudou o valor ou a data que a leitura rápida preencheu. Compara com o que a leitura pôs no
 * rascunho (o destaque some quando o campo muda).
 */
export function valorAlteradoDaLeitura(draft: ExpenseDraft, filled: QuickReadFilledFields) {
  return (filled.valor !== undefined && draft.valor !== filled.valor) || (filled.dataGasto !== undefined && draft.dataGasto !== filled.dataGasto);
}

// Chave da nota fiscal de cada comprovante da despesa: folha com os quatro caminhos, leitura do código na câmera comum,
// chave achada no PDF e a sugerida pela leitura rápida. O plugin do anexo é o bloqueio que vale; aqui é o aviso antecipado.
export function useNotaFiscal({ setExpensePhotos, expenseDraftRef, despesaExistenteId, setScreen, setToast }: Options) {
  const [notaSheet, setNotaSheet] = useState<NotaSheetState | null>(null);
  const [codigoDica, setCodigoDica] = useState(DICA_CODIGO);
  const codigoPhotoIdRef = useRef("");

  const aplicarNota = (photoId: string, nota: NotaDoComprovante | undefined) =>
    setExpensePhotos((atual) => atual.map((photo) => (photo.id === photoId ? { ...photo, nota } : photo)));

  /** Confere e grava a chave no comprovante. Devolve a recusa (DV, mês, repetida) ou null. */
  const confirmarChave = async (photoId: string, chave: string, origem: OrigemChave): Promise<string | null> => {
    const data = expenseDraftRef.current.dataGasto;
    const local = data ? conferirChaveDaDespesa(chave, data) : validarChave(chave);
    if (!local.ok) return local.erro;
    try {
      const remota = await conferirChaveNotaRemote({ chave: local.nota.chave, dataDespesa: data || null, despesaId: despesaExistenteId() });
      if (remota.resultado !== "livre") return remota.erro ?? "Esta chave não foi aceita.";
    } catch (error) {
      // Sem resposta, segue: o plugin do anexo confere de novo ao gravar.
      reportAppError(error, { severity: "warning", source: "app", action: "conferirChaveNota", notifyUser: false });
    }
    aplicarNota(photoId, { situacao: "verificada", chave: local.nota.chave, origem });
    setNotaSheet(null);
    setToast("Chave da nota conferida.");
    return null;
  };

  const semChave = (photoId: string, situacao: "nao-verificada" | "sem-nota") => {
    aplicarNota(photoId, { situacao });
    setNotaSheet(null);
  };

  const abrirNota = (photoId: string) => setNotaSheet({ photoId });

  const lerCodigoDaNota = (photoId: string) => {
    codigoPhotoIdRef.current = photoId;
    setCodigoDica(DICA_CODIGO);
    setNotaSheet(null);
    setScreen("codigoGasto");
  };

  /** Código lido na câmera: true quando é chave de nota (a câmera para de ler e volta ao formulário). */
  const aoLerCodigo = async ({ texto, formato }: CodigoLido) => {
    const chave = chaveDoCodigo(texto);
    if (!chave) {
      setCodigoDica(DICA_NAO_E_NOTA);
      return false;
    }
    const photoId = codigoPhotoIdRef.current;
    setScreen("gastos");
    const erro = await confirmarChave(photoId, chave, formato);
    if (erro) setNotaSheet({ photoId, sugerida: { chave, origem: formato }, erro });
    return true;
  };

  const aoFotografarCodigo = async (lido: CodigoLido | null) => {
    if (!lido) { setCodigoDica(DICA_FOTO_SEM_CODIGO); return; }
    await aoLerCodigo(lido);
  };

  /** Comprovante novo: PDF procura a chave sozinho; senão (ou sem chave no PDF), abre a folha. */
  const aoAdicionarComprovante = async (photoId: string, dataUrl: string, outrosTemNota: boolean) => {
    if (outrosTemNota) return;
    if (!ehPdf(dataUrl)) { setNotaSheet({ photoId }); return; }
    const chave = await chaveDoPdf(bytesDoDataUrl(dataUrl)).catch(() => null);
    if (!chave) { setNotaSheet({ photoId }); return; }
    const erro = await confirmarChave(photoId, chave, "pdf");
    if (erro) setNotaSheet({ photoId, sugerida: { chave, origem: "pdf" }, erro });
  };

  /** Leitura rápida achou uma chave válida: mostra para o motorista confirmar (não grava sozinha). */
  const aoLerChaveNaFoto = (photoId: string, chaveLida: string | null | undefined, jaTemNota: boolean) => {
    const r = chaveLida ? validarChave(chaveLida) : null;
    if (!r?.ok || jaTemNota) return;
    setNotaSheet((atual) => (atual && atual.photoId !== photoId ? atual : { photoId, sugerida: { chave: r.nota.chave, origem: "leitura-rapida" } }));
  };

  const aoRemoverComprovante = (photoId: string) => setNotaSheet((atual) => (atual?.photoId === photoId ? null : atual));

  return {
    notaSheet, setNotaSheet, codigoDica, codigoPhotoIdRef,
    confirmarChave, semChave, abrirNota, lerCodigoDaNota, aoLerCodigo, aoFotografarCodigo,
    aoAdicionarComprovante, aoLerChaveNaFoto, aoRemoverComprovante, aplicarNota
  };
}

/** Extras da prova de cada comprovante: o caminho da nota e, no da leitura rápida, o valor e a data lidos. */
export function extrasDaProva(photo: Pick<ExpensePhoto, "id" | "nota">, leitura: { photoId: string; valor: number | null; data: string | null; alterado: boolean } | null): ExtrasDaNota | undefined {
  const extras: ExtrasDaNota = {};
  if (photo.nota) extras.notaFiscal = photo.nota.situacao;
  if (leitura && leitura.photoId === photo.id && (leitura.valor !== null || leitura.data !== null)) {
    extras.leitura = { valor: leitura.valor, data: leitura.data };
    extras.valorAlterado = leitura.alterado;
  }
  return Object.keys(extras).length ? extras : undefined;
}
