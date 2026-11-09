import { Check, ChevronDown, MapPin, Pencil, ThumbsDown, ThumbsUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DitadoField } from "../../shared/ui/DitadoButton";
import { TextAreaField } from "../../shared/ui/FormFields";
import { SystemIcon } from "../../shared/ui/icons/SystemIcon";
import { useDetalheDialog } from "./useDetalheDialog";
import { reportAppError } from "../../shared/appErrorLogger";
import { MAX_COMENTARIO, MOTIVOS, enviarAvaliacao, motivoPositivo, nomeCurto, percentualRecomenda, rotuloMotivo, type MinhaAvaliacao, type ResumoAvaliacoes } from "./avaliacaoPostos";
import { customApiErrorMessage } from "../../data/dataverse/customApi";
import { formatDiaMes } from "./gastosCartao";
import { formatBRL } from "./gastosRelatorio";
import { RECOMENDACAO, ROTULO_META, enderecoLegivel, rotuloDistancia, urlMaps, type PostoProximo } from "./rankingPostos";
import { appendDitado } from "../../shared/useDitado";

const mesmoRascunho = (a: MinhaAvaliacao, b: MinhaAvaliacao) => JSON.stringify([a.recomenda, a.motivos, a.comentario]) === JSON.stringify([b.recomenda, b.motivos, b.comentario]);

/** Ficha do posto. O joinha já salva a avaliação; motivos e comentário vêm depois, num painel opcional. */
export function PostoDetalheDialog({ posto, dias, onAvaliado, onClose }: { posto: PostoProximo; dias: number; onAvaliado: (postoId: string, avaliacoes: ResumoAvaliacoes) => void; onClose: () => void }) {
  const [rascunho, setRascunho] = useState<MinhaAvaliacao | null>(null);
  const [inicial, setInicial] = useState<MinhaAvaliacao | null>(null);
  const [recemSalva, setRecemSalva] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviada, setEnviada] = useState(false);
  const sujo = rascunho !== null && inicial !== null && !mesmoRascunho(rascunho, inicial);

  const fecharPainel = useCallback(() => { setDescartando(false); setRascunho(null); setRecemSalva(false); }, []);

  // Em ref para o Esc não recriar o efeito do diálogo, que devolveria o foco ao X a cada toque.
  const estado = useRef({ aberto: false, sujo, salvando });
  estado.current = { aberto: rascunho !== null, sujo, salvando };
  const pedirFechar = useCallback(() => {
    const { aberto, sujo: alterado, salvando: ocupado } = estado.current;
    if (ocupado) return;
    if (!aberto) onClose();
    else if (alterado) setDescartando(true);
    else fecharPainel();
  }, [onClose, fecharPainel]);
  const fecharRef = useDetalheDialog(pedirFechar);

  const abrirPainel = (avaliacao: MinhaAvaliacao, salva: boolean) => {
    setErro("");
    setRecemSalva(salva);
    setInicial(avaliacao);
    setRascunho(avaliacao);
  };

  const salvar = async (minha: MinhaAvaliacao) => {
    setSalvando(true);
    setErro("");
    try {
      onAvaliado(posto.postoId, await enviarAvaliacao(posto.postoId, posto.avaliacoes, minha));
      setEnviada(true);
      return true;
    } catch (error) {
      reportAppError(error, { severity: "warning", source: "app", action: "enviarAvaliacaoPosto", screen: "RankingPostos", notifyUser: false });
      setErro(customApiErrorMessage(error, "Não foi possível enviar a avaliação. Tente de novo."));
      return false;
    } finally {
      setSalvando(false);
    }
  };

  const avaliarNoToque = async (recomenda: boolean) => {
    const minha = { recomenda, motivos: [], comentario: "" };
    if (await salvar(minha)) abrirPainel(minha, true);
  };

  const concluir = async () => {
    if (!rascunho) return;
    if (!sujo || await salvar({ ...rascunho, comentario: rascunho.comentario.trim() })) fecharPainel();
  };

  return createPortal(
    <div className="gr-detalhe-overlay" role="dialog" aria-modal="true" aria-labelledby="rp-detalhe-titulo" onClick={pedirFechar}>
      <div className="gr-detalhe rp-ficha" onClick={(event) => event.stopPropagation()}>
        <header className="gr-detalhe-topo">
          <div className="gr-detalhe-titulos"><h2 id="rp-detalhe-titulo">{posto.nome}</h2></div>
          <button ref={fecharRef} type="button" className="gr-detalhe-fechar" aria-label="Fechar" disabled={salvando} onClick={pedirFechar}><SystemIcon name="dismiss" /></button>
        </header>
        <div className="gr-detalhe-corpo">
          <section className="rp-bloco" aria-labelledby="rp-custa">
            <h3 id="rp-custa">Quanto custa</h3>
            <div className="rp-bloco-linha">
              <strong className="rp-bloco-valor">{formatBRL(posto.precoLitro)}<small>/L</small></strong>
              <span className="termo-badge" data-tone={RECOMENDACAO[posto.cor].tom}>{ROTULO_META[posto.cor]}</span>
            </div>
            <p className="rp-bloco-texto">{posto.abastecimentos === 1 ? "Preço de 1 abastecimento" : `Média de ${posto.abastecimentos} abastecimentos em ${dias} dias`}. Última vez em {formatDiaMes(posto.ultimoAbastecimento)}.</p>
            {posto.historico.length ? (
              <details className="rp-detalhes">
                <summary>Ver últimos abastecimentos<ChevronDown aria-hidden="true" /></summary>
                <ul className="rp-historico">
                  {posto.historico.map((item, indice) => (
                    <li key={`${item.data}-${indice}`}><span>{formatDiaMes(item.data)}</span><strong>{formatBRL(item.precoLitro)}/L</strong></li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
          <section className="rp-bloco" aria-labelledby="rp-onde">
            <h3 id="rp-onde">Onde fica · {rotuloDistancia(posto)} de você</h3>
            {posto.endereco ? <p className="rp-bloco-endereco">{enderecoLegivel(posto.endereco)}</p> : null}
            <a className="rp-ir" href={urlMaps(posto)} target="_blank" rel="noreferrer"><MapPin aria-hidden="true" />Ir para o posto</a>
          </section>
          {posto.postoId ? (
            <Avaliacoes
              resumo={posto.avaliacoes}
              enviada={enviada}
              salvando={salvando}
              erro={rascunho ? "" : erro}
              onAvaliar={avaliarNoToque}
              onEditar={(minha) => { setEnviada(false); abrirPainel({ recomenda: minha.recomenda, motivos: minha.motivos, comentario: minha.comentario }, false); }}
            />
          ) : null}
        </div>
        {rascunho ? (
          <>
            <div className="rp-folha-fundo" onClick={pedirFechar} />
            <PainelAvaliacao
              rascunho={rascunho}
              recemSalva={recemSalva}
              erro={erro}
              salvando={salvando}
              descartando={descartando}
              onChange={setRascunho}
              onConcluir={concluir}
              onCancelar={pedirFechar}
              onContinuar={() => setDescartando(false)}
              onDescartar={fecharPainel}
            />
          </>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

function Avaliacoes({ resumo, enviada, salvando, erro, onAvaliar, onEditar }: { resumo: ResumoAvaliacoes; enviada: boolean; salvando: boolean; erro: string; onAvaliar: (recomenda: boolean) => void; onEditar: (minha: MinhaAvaliacao) => void }) {
  const percentual = percentualRecomenda(resumo);
  return (
    <section className="rp-bloco" aria-labelledby="rp-avaliacoes">
      <h3 id="rp-avaliacoes">O que dizem</h3>
      {resumo.total ? (
        <>
          <p className="rp-placar" data-bom={percentual >= 50}><strong>{percentual}%</strong><span>recomendam · {resumo.total === 1 ? "1 avaliação" : `${resumo.total} avaliações`}</span></p>
          {resumo.motivos.length ? (
            <ul className="rp-motivos">
              {resumo.motivos.map((id) => <li key={id} data-positivo={motivoPositivo(id)}>{rotuloMotivo(id)}{resumo.contagemMotivos[id] ? <b>{resumo.contagemMotivos[id]}</b> : null}</li>)}
            </ul>
          ) : null}
        </>
      ) : <p className="rp-avaliacao-vazia">Ainda sem avaliações. Sua opinião ajuda os colegas.</p>}
      {resumo.minha ? (
        <div className="rp-minha">
          <span className="rp-minha-texto" data-positivo={resumo.minha.recomenda}>
            {enviada ? <Check aria-hidden="true" /> : resumo.minha.recomenda ? <ThumbsUp aria-hidden="true" /> : <ThumbsDown aria-hidden="true" />}
            <span role={enviada ? "status" : undefined}>{enviada ? "Avaliação enviada. Obrigado!" : resumo.minha.recomenda ? "Você recomendou este posto" : "Você não recomendou este posto"}</span>
          </span>
          <button type="button" className="rp-minha-editar" onClick={() => resumo.minha && onEditar(resumo.minha)}><Pencil aria-hidden="true" />Editar</button>
        </div>
      ) : (
        <div className="rp-avaliar-card">
          <strong id="rp-avaliar-pergunta">Como foi neste posto?</strong>
          <div className="rp-escolha" role="group" aria-labelledby="rp-avaliar-pergunta">
            <button type="button" data-tom="positivo" disabled={salvando} onClick={() => onAvaliar(true)}><ThumbsUp aria-hidden="true" />Recomendo</button>
            <button type="button" data-tom="negativo" disabled={salvando} onClick={() => onAvaliar(false)}><ThumbsDown aria-hidden="true" />Não recomendo</button>
          </div>
          {erro ? <div className="termo-alert" data-tone="erro" role="alert"><p>{erro}</p></div> : null}
        </div>
      )}
      {resumo.comentarios.length ? (
        <ul className="rp-comentarios">
          {resumo.comentarios.map((comentario, indice) => (
            <li key={`${comentario.autor}-${indice}`}>
              <p>{comentario.texto}</p>
              <small data-positivo={comentario.recomenda}>{comentario.recomenda ? <ThumbsUp aria-label="Recomenda" /> : <ThumbsDown aria-label="Não recomenda" />}{nomeCurto(comentario.autor)} · {formatDiaMes(comentario.data)}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function PainelAvaliacao({ rascunho, recemSalva, erro, salvando, descartando, onChange, onConcluir, onCancelar, onContinuar, onDescartar }: {
  rascunho: MinhaAvaliacao;
  recemSalva: boolean;
  erro: string;
  salvando: boolean;
  descartando: boolean;
  onChange: (rascunho: MinhaAvaliacao) => void;
  onConcluir: () => void;
  onCancelar: () => void;
  onContinuar: () => void;
  onDescartar: () => void;
}) {
  const painelRef = useRef<HTMLElement>(null);
  useEffect(() => { painelRef.current?.focus({ preventScroll: true }); }, []);
  const motivos = rascunho.recomenda ? MOTIVOS.recomenda : MOTIVOS.naoRecomenda;
  const escolher = (recomenda: boolean) => { if (recomenda !== rascunho.recomenda) onChange({ ...rascunho, recomenda, motivos: [] }); };
  const alternar = (id: string) => onChange({ ...rascunho, motivos: rascunho.motivos.includes(id) ? rascunho.motivos.filter((item) => item !== id) : [...rascunho.motivos, id] });
  const escrever = (comentario: string) => onChange({ ...rascunho, comentario: comentario.slice(0, MAX_COMENTARIO) });

  return (
    <section ref={painelRef} className="rp-folha" tabIndex={-1} aria-labelledby="rp-folha-titulo">
      <span className="rp-folha-alca" aria-hidden="true" />
      {recemSalva ? <p className="rp-folha-salva" role="status"><Check aria-hidden="true" />Avaliação salva. Quer dizer por quê?</p> : null}
      <h3 id="rp-folha-titulo">Como foi neste posto?</h3>
      <fieldset className="rp-form-campos" disabled={salvando}>
        <div className="rp-escolha">
          <button type="button" aria-pressed={rascunho.recomenda} data-tom="positivo" onClick={() => escolher(true)}><ThumbsUp aria-hidden="true" />Recomendo</button>
          <button type="button" aria-pressed={!rascunho.recomenda} data-tom="negativo" onClick={() => escolher(false)}><ThumbsDown aria-hidden="true" />Não recomendo</button>
        </div>
        <h4 className="termo-section-title">{rascunho.recomenda ? "O que foi bom?" : "O que não foi bom?"}</h4>
        <div className="rp-form-motivos" role="group" aria-label="Motivos">
          {motivos.map((motivo) => <button key={motivo.id} type="button" className="rp-motivo" aria-pressed={rascunho.motivos.includes(motivo.id)} data-positivo={rascunho.recomenda} onClick={() => alternar(motivo.id)}>{motivo.rotulo}</button>)}
        </div>
        <DitadoField stopWhen={salvando} onFinal={(fala) => escrever(appendDitado(rascunho.comentario, fala))}>
          <TextAreaField label="Comentário (opcional)" placeholder="Quer contar mais?" rows={2} maxLength={MAX_COMENTARIO} value={rascunho.comentario} onChange={(event) => escrever(event.target.value)} />
        </DitadoField>
        <p className="rp-form-dica">{rascunho.comentario.length}/{MAX_COMENTARIO} · Seu nome aparece para os colegas.</p>
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
          <button type="button" className="duvida-voltar" disabled={salvando} onClick={onCancelar}>{recemSalva ? "Agora não" : "Cancelar"}</button>
          <button type="button" className="duvida-enviar" disabled={salvando} onClick={onConcluir}>{salvando ? "Salvando…" : "Concluir"}</button>
        </div>
      )}
    </section>
  );
}
