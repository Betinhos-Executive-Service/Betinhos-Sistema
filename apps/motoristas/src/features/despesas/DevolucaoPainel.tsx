import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { readFileAsDataUrl } from "../../shared/camera/photoOrientation";
import { reportAppError } from "../../shared/appErrorLogger";
import {
  MIN_EXPLICACAO, MOTIVO_PADRAO, dependenciasRemotas, enviarDevolucao, guardarRascunho, lerRascunho, motivoParaMotorista, validarEnvio,
  type FotoNova, type ProgressoEnvio
} from "./devolucao";
import type { DespesaRelatorio } from "./gastosRelatorio";

/** O que o painel de detalhe precisa saber para fechar com segurança: há algo digitado/escolhido e se está enviando. */
export type GuardaDevolucao = { sujo: boolean; enviando: boolean; descartar: () => void };

const SAIDA_MS = 120;
/** Estado do guarda quando não há painel de devolução ativo. */
export const GUARDA_VAZIA: GuardaDevolucao = { sujo: false, enviando: false, descartar: () => {} };

/** Motivo da devolução em destaque, no topo do detalhe. Passou de 3 linhas: recolhe e oferece "Ver mais". */
export function MotivoDevolucao({ despesa }: { despesa: Pick<DespesaRelatorio, "motivoDevolucao" | "iaMotivos"> }) {
  const texto = motivoParaMotorista(despesa) || MOTIVO_PADRAO;
  const ref = useRef<HTMLParagraphElement>(null);
  const [aberto, setAberto] = useState(false);
  const [longo, setLongo] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || aberto) return;
    const medir = () => setLongo(el.scrollHeight > el.clientHeight + 1);
    medir();
    const obs = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
    obs?.observe(el);
    return () => obs?.disconnect();
  }, [texto, aberto]);
  return (
    <section className="dv-motivo" role="note" aria-labelledby="dv-motivo-titulo">
      <h3 id="dv-motivo-titulo">Por que voltou</h3>
      <p id="dv-motivo-texto" ref={ref} data-recolhido={!aberto}>{texto}</p>
      {longo || aberto ? (
        <button type="button" className="dv-motivo-mais" aria-expanded={aberto} aria-controls="dv-motivo-texto" onClick={() => setAberto((v) => !v)}>
          {aberto ? "Ver menos" : "Ver mais"}
        </button>
      ) : null}
    </section>
  );
}

type PainelProps = {
  despesa: DespesaRelatorio;
  nome: string;
  /** Posição do comprovante novo: depois dos que já existem. */
  ordem: number;
  motoristaId: string;
  guardaRef: MutableRefObject<GuardaDevolucao>;
  /** Anexos já lidos: a ordem e o nome da pasta do comprovante novo dependem deles. */
  anexosProntos: boolean;
  onEnviada: (explicacao: string) => void;
};

/** Duas ações de mesmo peso (Nova foto e Explicar, juntas ou separadas) e um envio único. O valor fica travado. */
export function DevolucaoPainel({ despesa, nome, ordem, motoristaId, guardaRef, anexosProntos, onEnviada }: PainelProps) {
  const [rascunhoInicial] = useState(() => lerRascunho(despesa.id));
  const [explicacao, setExplicacao] = useState(rascunhoInicial);
  const [explicarAberto, setExplicarAberto] = useState(Boolean(rascunhoInicial));
  const [saindo, setSaindo] = useState(false);
  const [foto, setFoto] = useState<FotoNova | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [erroFoto, setErroFoto] = useState("");
  /** Erro de tamanho só aparece depois de tentar enviar; antes, contador neutro. */
  const [tentou, setTentou] = useState(false);
  const textoRef = useRef<HTMLTextAreaElement>(null);
  const progresso = useRef<ProgressoEnvio>({ anexado: false });
  /** Foto já enviada e depois trocada/removida: a próxima sobe numa ordem nova, sem repetir a do comprovante descartado. */
  const deslocamento = useRef(0);
  const reiniciarProgresso = () => {
    if (progresso.current.anexado) deslocamento.current += 1;
    progresso.current = { anexado: false };
  };
  const arquivoRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef(0);

  const validacao = validarEnvio({ explicacao, temFoto: Boolean(foto) });
  // Foto nova só sobe depois de saber quantos comprovantes já existem (senão repete a ordem 1 e a pasta errada).
  const aguardandoAnexos = Boolean(foto) && !anexosProntos;
  const semAcao = !foto && !explicacao.trim();
  const mostraErro = tentou && Boolean(validacao.erro);
  const caracteres = explicacao.trim().length;
  const sujo = Boolean(foto) || (explicacao.trim() !== "" && explicacao !== rascunhoInicial);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  useEffect(() => {
    guardaRef.current = {
      sujo,
      enviando,
      // Volta ao que havia ao abrir: o rascunho guardado antes (não alterado) não se perde.
      descartar: () => { setFoto(null); setExplicacao(rascunhoInicial); guardarRascunho(despesa.id, rascunhoInicial); }
    };
    // Painel saiu (enviado): nada mais a proteger ao fechar o detalhe.
    return () => { guardaRef.current = GUARDA_VAZIA; };
  }, [sujo, enviando, despesa.id, guardaRef, rascunhoInicial]);

  const alternarExplicar = () => {
    window.clearTimeout(timerRef.current);
    if (!explicarAberto) { setSaindo(false); setExplicarAberto(true); return; }
    setSaindo(true);
    timerRef.current = window.setTimeout(() => { setExplicarAberto(false); setSaindo(false); }, SAIDA_MS);
  };

  const mudarTexto = (valor: string) => {
    setExplicacao(valor);
    guardarRascunho(despesa.id, valor);
    setFalhou(false);
  };

  const escolherFoto = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setErroFoto("");
    try {
      setFoto({ dataUrl: await readFileAsDataUrl(arquivo), fileName: arquivo.name });
      reiniciarProgresso();
      setFalhou(false);
    } catch {
      setErroFoto("Não deu para abrir essa foto. Tente de novo ou escolha outra.");
    }
  };

  const enviar = async () => {
    if (enviando || aguardandoAnexos) return;
    if (!validacao.pode) { setTentou(true); textoRef.current?.focus(); return; }
    setEnviando(true);
    setFalhou(false);
    try {
      await enviarDevolucao({ explicacao, foto, progresso: progresso.current }, dependenciasRemotas({ despesaId: despesa.id, nome, motoristaId, ordem: ordem + deslocamento.current }));
      guardarRascunho(despesa.id, "");
      onEnviada(explicacao.trim());
    } catch (erro) {
      // Texto e foto ficam na tela (e o texto no aparelho) para tentar de novo sem perder nada.
      setFalhou(true);
      reportAppError(erro, { severity: "warning", source: "app", action: "enviarDevolucaoDespesa", notifyUser: false });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="dv-painel" aria-labelledby="dv-resolver">
      <h3 className="gr-subtitulo" id="dv-resolver">Como resolver</h3>
      <div className="dv-acoes">
        <button type="button" className="dv-acao" aria-pressed={Boolean(foto)} disabled={enviando} onClick={() => arquivoRef.current?.click()}>
          Nova foto
        </button>
        <button type="button" className="dv-acao" aria-expanded={explicarAberto && !saindo} aria-controls="dv-explicar" disabled={enviando} onClick={alternarExplicar}>
          Explicar
        </button>
      </div>
      <input ref={arquivoRef} type="file" accept="image/*" hidden onChange={(event) => { void escolherFoto(event.target.files?.[0]); event.target.value = ""; }} />

      {foto ? (
        <div className="dv-foto">
          <img src={foto.dataUrl} alt="Novo comprovante escolhido" />
          <span>Novo comprovante pronto para enviar.</span>
          <button type="button" className="termo-text-button" disabled={enviando} onClick={() => { setFoto(null); reiniciarProgresso(); }}>Remover</button>
        </div>
      ) : null}
      {erroFoto ? <p className="dv-aviso" role="alert">{erroFoto}</p> : null}

      {explicarAberto ? (
        <div id="dv-explicar" className="dv-explicar" data-estado={saindo ? "saindo" : "entrando"}>
          <textarea
            ref={textoRef}
            id="dv-explicar-texto"
            aria-label="Sua explicação"
            rows={3}
            value={explicacao}
            disabled={enviando}
            placeholder="O que aconteceu? Ex.: o posto emitiu o cupom com o valor errado."
            aria-describedby="dv-explicar-ajuda"
            aria-invalid={mostraErro}
            onChange={(event) => mudarTexto(event.target.value)}
          />
          <small id="dv-explicar-ajuda" data-erro={mostraErro} aria-live="polite">
            {mostraErro ? validacao.erro : caracteres > 0 && caracteres < MIN_EXPLICACAO ? `${caracteres}/${MIN_EXPLICACAO} caracteres` : ""}
          </small>
        </div>
      ) : null}

      {falhou ? (
        <p className="dv-aviso" role="alert">Não deu para enviar agora. {explicacao.trim() ? "Seu texto está guardado. " : ""}Tente de novo quando o sinal melhorar.</p>
      ) : null}
      {/* Envio só aparece quando há o que enviar: nada de botão cinza desabilitado antes da escolha. */}
      {semAcao ? null : (
        <button type="button" className="dv-enviar" disabled={enviando || aguardandoAnexos} aria-busy={enviando} onClick={() => { void enviar(); }}>
          {enviando ? "Enviando…" : aguardandoAnexos ? "Carregando comprovantes…" : falhou ? "Tentar de novo" : "Enviar para nova conferência"}
        </button>
      )}
    </section>
  );
}
