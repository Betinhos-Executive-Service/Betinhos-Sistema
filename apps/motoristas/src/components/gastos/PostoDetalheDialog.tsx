import { MapPin, ThumbsDown, ThumbsUp } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DitadoField } from "../common/DitadoButton";
import { TextAreaField } from "../common/FormFields";
import { SystemIcon } from "../icons/SystemIcon";
import { useDetalheDialog } from "./useDetalheDialog";
import { reportAppError } from "../../lib/appErrorLogger";
import { MAX_COMENTARIO, MOTIVOS, enviarAvaliacao, motivoPositivo, rotuloMotivo, rotuloRecomendacoes, type MinhaAvaliacao, type ResumoAvaliacoes } from "../../lib/avaliacaoPostos";
import { customApiErrorMessage } from "../../lib/customApi";
import { formatDiaMes } from "../../lib/gastosCartao";
import { formatBRL } from "../../lib/gastosRelatorio";
import { RECOMENDACAO, rotuloDistancia, urlMaps, type PostoProximo } from "../../lib/rankingPostos";
import { appendDitado } from "../../lib/useDitado";

type Rascunho = { recomenda: boolean | null; motivos: string[]; comentario: string };

const RASCUNHO_VAZIO: Rascunho = { recomenda: null, motivos: [], comentario: "" };

/** Ficha do posto. Fecha no X, no Esc e tocando fora; com avaliação não enviada, pergunta antes de descartar. */
export function PostoDetalheDialog({ posto, dias, onAvaliado, onClose }: { posto: PostoProximo; dias: number; onAvaliado: (postoId: string, avaliacoes: ResumoAvaliacoes) => void; onClose: () => void }) {
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [descartar, setDescartar] = useState<"ficha" | "fechar" | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviada, setEnviada] = useState(false);
  const recomendacao = RECOMENDACAO[posto.cor];
  const { recomenda, motivos, comentario } = posto.avaliacoes.minha ?? RASCUNHO_VAZIO;
  const original: Rascunho = { recomenda, motivos, comentario };
  const sujo = rascunho !== null && JSON.stringify(rascunho) !== JSON.stringify(original);

  // Em ref para o Esc não recriar o efeito do diálogo, que devolveria o foco ao X a cada toque.
  const estado = useRef({ sujo, salvando });
  estado.current = { sujo, salvando };
  const pedirFechar = useCallback(() => {
    if (estado.current.salvando) return;
    if (estado.current.sujo) setDescartar("fechar");
    else onClose();
  }, [onClose]);
  const fecharRef = useDetalheDialog(pedirFechar);

  const abrirFormulario = () => { setEnviada(false); setErro(""); setRascunho(original); };
  const cancelar = () => { if (sujo) setDescartar("ficha"); else setRascunho(null); };
  const confirmarDescarte = () => {
    if (descartar === "fechar") { onClose(); return; }
    setDescartar(null);
    setRascunho(null);
  };

  const enviar = async () => {
    if (!rascunho || rascunho.recomenda === null) return;
    const minha: MinhaAvaliacao = { recomenda: rascunho.recomenda, motivos: rascunho.motivos, comentario: rascunho.comentario.trim() };
    setSalvando(true);
    setErro("");
    try {
      onAvaliado(posto.postoId, await enviarAvaliacao(posto.postoId, posto.avaliacoes, minha));
      setRascunho(null);
      setEnviada(true);
    } catch (error) {
      reportAppError(error, { severity: "warning", source: "app", action: "enviarAvaliacaoPosto", screen: "RankingPostos", notifyUser: false });
      setErro(customApiErrorMessage(error, "Não foi possível enviar a avaliação. Tente de novo."));
    } finally {
      setSalvando(false);
    }
  };

  return createPortal(
    <div className="gr-detalhe-overlay" role="dialog" aria-modal="true" aria-labelledby="rp-detalhe-titulo" onClick={pedirFechar}>
      <div className="gr-detalhe" onClick={(event) => event.stopPropagation()}>
        <header className="gr-detalhe-topo">
          <div className="gr-detalhe-titulos">
            <h2 id="rp-detalhe-titulo">{posto.nome}</h2>
            <strong className="gr-detalhe-valor">{formatBRL(posto.precoLitro)}/L</strong>
          </div>
          <span className="termo-badge" data-tone={recomendacao.tom}>{recomendacao.rotulo}</span>
          <button ref={fecharRef} type="button" className="gr-detalhe-fechar" aria-label="Fechar" disabled={salvando} onClick={pedirFechar}><SystemIcon name="dismiss" /></button>
        </header>
        <div className="gr-detalhe-corpo">
          {rascunho ? (
            <FormularioAvaliacao
              rascunho={rascunho}
              erro={erro}
              salvando={salvando}
              podeEnviar={sujo && rascunho.recomenda !== null}
              descartando={descartar !== null}
              onChange={setRascunho}
              onEnviar={enviar}
              onCancelar={cancelar}
              onContinuar={() => setDescartar(null)}
              onDescartar={confirmarDescarte}
            />
          ) : (
            <>
              <dl className="gr-detalhe-campos">
                {posto.endereco ? <div><dt>Endereço</dt><dd>{posto.endereco}</dd></div> : null}
                <div><dt>Distância</dt><dd>{rotuloDistancia(posto)}</dd></div>
                <div><dt>Média</dt><dd>{posto.abastecimentos === 1 ? "Baseada em 1 abastecimento" : `${posto.abastecimentos} abastecimentos em ${dias} dias`}</dd></div>
              </dl>
              <a className="rp-maps" href={urlMaps(posto)} target="_blank" rel="noreferrer"><MapPin aria-hidden="true" />Abrir no Maps</a>
              {posto.postoId ? <Avaliacoes resumo={posto.avaliacoes} enviada={enviada} onAvaliar={abrirFormulario} /> : null}
              {posto.historico.length ? (
                <section aria-labelledby="rp-historico">
                  <h3 className="termo-section-title" id="rp-historico">Últimos abastecimentos</h3>
                  <ul className="rp-historico">
                    {posto.historico.map((item, indice) => (
                      <li key={`${item.data}-${indice}`}><span>{formatDiaMes(item.data)}</span><strong>{formatBRL(item.precoLitro)}/L</strong></li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Avaliacoes({ resumo, enviada, onAvaliar }: { resumo: ResumoAvaliacoes; enviada: boolean; onAvaliar: () => void }) {
  return (
    <section aria-labelledby="rp-avaliacoes">
      <h3 className="termo-section-title" id="rp-avaliacoes">Avaliações dos motoristas</h3>
      {resumo.total ? (
        <>
          <p className="rp-avaliacao-resumo">{rotuloRecomendacoes(resumo)}</p>
          {resumo.motivos.length ? (
            <ul className="rp-motivos">
              {resumo.motivos.map((id) => <li key={id} data-positivo={motivoPositivo(id)}>{rotuloMotivo(id)}</li>)}
            </ul>
          ) : null}
          {resumo.comentarios.length ? (
            <ul className="rp-comentarios">
              {resumo.comentarios.map((comentario, indice) => (
                <li key={`${comentario.autor}-${indice}`}>
                  <p>{comentario.texto}</p>
                  <span>{comentario.recomenda ? <ThumbsUp aria-hidden="true" /> : <ThumbsDown aria-hidden="true" />}{comentario.autor} · {formatDiaMes(comentario.data)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : <p className="rp-avaliacao-vazia">Ainda sem avaliações. Conte como foi para ajudar os colegas.</p>}
      {enviada ? <p className="rp-avaliacao-enviada" role="status">Avaliação enviada. Obrigado!</p> : null}
      <button type="button" className="rp-avaliar" onClick={onAvaliar}>{resumo.minha ? "Editar minha avaliação" : "Avaliar este posto"}</button>
    </section>
  );
}

function FormularioAvaliacao({ rascunho, erro, salvando, podeEnviar, descartando, onChange, onEnviar, onCancelar, onContinuar, onDescartar }: {
  rascunho: Rascunho;
  erro: string;
  salvando: boolean;
  podeEnviar: boolean;
  descartando: boolean;
  onChange: (rascunho: Rascunho) => void;
  onEnviar: () => void;
  onCancelar: () => void;
  onContinuar: () => void;
  onDescartar: () => void;
}) {
  const motivos = rascunho.recomenda === null ? [] : rascunho.recomenda ? MOTIVOS.recomenda : MOTIVOS.naoRecomenda;
  const escolher = (recomenda: boolean) => { if (recomenda !== rascunho.recomenda) onChange({ ...rascunho, recomenda, motivos: [] }); };
  const alternar = (id: string) => onChange({ ...rascunho, motivos: rascunho.motivos.includes(id) ? rascunho.motivos.filter((item) => item !== id) : [...rascunho.motivos, id] });
  const escrever = (comentario: string) => onChange({ ...rascunho, comentario: comentario.slice(0, MAX_COMENTARIO) });

  return (
    <section className="rp-form" aria-labelledby="rp-form-titulo">
      <h3 className="termo-section-title" id="rp-form-titulo">Como foi neste posto?</h3>
      <fieldset className="rp-form-campos" disabled={salvando}>
      <div className="rp-escolha">
        <button type="button" aria-pressed={rascunho.recomenda === true} data-tom="positivo" onClick={() => escolher(true)}><ThumbsUp aria-hidden="true" />Recomendo</button>
        <button type="button" aria-pressed={rascunho.recomenda === false} data-tom="negativo" onClick={() => escolher(false)}><ThumbsDown aria-hidden="true" />Não recomendo</button>
      </div>
      {motivos.length ? (
        <div className="rp-form-motivos" role="group" aria-label="Motivos">
          {motivos.map((motivo) => <button key={motivo.id} type="button" className="gr-chip" aria-pressed={rascunho.motivos.includes(motivo.id)} onClick={() => alternar(motivo.id)}>{motivo.rotulo}</button>)}
        </div>
      ) : null}
      {rascunho.recomenda !== null ? (
        <>
          <DitadoField stopWhen={salvando} onFinal={(fala) => escrever(appendDitado(rascunho.comentario, fala))}>
            <TextAreaField label="Comentário (opcional)" placeholder="Ex.: preço bom, mas a fila costuma demorar." rows={3} maxLength={MAX_COMENTARIO} value={rascunho.comentario} onChange={(event) => escrever(event.target.value)} />
          </DitadoField>
          <p className="rp-form-dica">{rascunho.comentario.length}/{MAX_COMENTARIO} · Seu nome aparece para os outros motoristas.</p>
        </>
      ) : null}
      </fieldset>
      {erro ? <div className="termo-alert" data-tone="erro" role="alert"><p>{erro}</p></div> : null}
      {descartando ? (
        <div className="termo-alert" data-tone="atencao" role="alert">
          <p>Descartar alterações?</p>
          <div className="rp-form-acoes">
            <button type="button" className="duvida-voltar" onClick={onContinuar}>Continuar editando</button>
            <button type="button" className="duvida-enviar" onClick={onDescartar}>Descartar</button>
          </div>
        </div>
      ) : (
        <div className="rp-form-acoes">
          <button type="button" className="duvida-voltar" disabled={salvando} onClick={onCancelar}>Cancelar</button>
          <button type="button" className="duvida-enviar" disabled={salvando || !podeEnviar} onClick={onEnviar}>{salvando ? "Enviando…" : "Enviar avaliação"}</button>
        </div>
      )}
    </section>
  );
}
