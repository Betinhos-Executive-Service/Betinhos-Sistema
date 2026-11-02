import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { reportAppError } from "../lib/appErrorLogger";
import { AppShell } from "../components/layout/AppShell";
import { ServicesMenu } from "../components/navigation/ServicesMenu";
import { SignatureDrawing, SignaturePad } from "../components/comunicados/SignaturePad";
import { parseStrokes, type SignatureStrokes } from "../lib/comunicados";
import { SuccessCheck } from "../components/termos/SuccessCheck";
import { formatDataHora, proximaAba, type AbaTermos } from "../lib/termosMulta";
import {
  abrirTreinamento,
  anexoUrl,
  assinarTreinamento,
  blocosDoConteudo,
  confirmarLeitura,
  formatData,
  formatTamanho,
  formatValidade,
  isAnexoImagem,
  isAnexoVideo,
  isMockTreinamentos,
  proximaEtapa,
  quizCompleto,
  resolverVideo,
  responderQuiz,
  separarTreinamentos,
  statusTreinamento,
  trechos,
  type Anexo,
  type Participacao,
  type ResultadoQuiz,
  type TreinamentoMotorista
} from "../lib/treinamentos";

export type TreinamentosLoadStatus = "loading" | "ready" | "error";

type Props = {
  items: TreinamentoMotorista[];
  loadStatus: TreinamentosLoadStatus;
  selectedId: string;
  onSelectedIdChange: (id: string) => void;
  onBack: () => void;
  onReload: () => Promise<void>;
  /** Participação gravada no Dataverse: o App atualiza a lista sem esperar a releitura. */
  onParticipacaoChange: (participacao: Participacao) => void;
  driverName: string;
};

// Reaproveita o visual das Multas (termos.css: abas, cartões, alertas, quadro de assinatura, rodapé) e os tokens do DS.

const STATUS = { novo: { label: "Novo", tone: "atencao" }, andamento: { label: "Em andamento", tone: "info" }, concluido: { label: "Concluído", tone: "sucesso" } } as const;

const Trechos = ({ texto }: { texto: string }) => <>{trechos(texto).map((t, i) => (t.negrito ? <strong key={i}>{t.texto}</strong> : <span key={i}>{t.texto}</span>))}</>;

const Conteudo = memo(function Conteudo({ texto }: { texto: string }) {
  const blocos = blocosDoConteudo(texto);
  if (!blocos.length) return null;
  return (
    <div className="trn-content">
      {blocos.map((b, i) => {
        if (b.tipo === "h") return <h3 key={i}><Trechos texto={b.texto} /></h3>;
        if (b.tipo === "ul") return <ul key={i}>{b.itens.map((item, j) => <li key={j}><Trechos texto={item} /></li>)}</ul>;
        return <p key={i}><Trechos texto={b.texto} /></p>;
      })}
    </div>
  );
});

const ArquivoVideo = memo(function ArquivoVideo({ src, titulo }: { src: string; titulo: string }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) return <a className="trn-link" href={src} target="_blank" rel="noopener noreferrer">O vídeo não carregou aqui. Toque para abrir.</a>;
  return <video src={src} title={titulo} controls playsInline preload="metadata" data-error-quiet="" onError={() => setFalhou(true)} />;
});

const Video = memo(function Video({ url }: { url: string }) {
  const video = resolverVideo(url);
  if (!video) return url.trim() ? <p className="termo-alert" data-tone="neutro">O link do vídeo deste treinamento é inválido. Avise o RH.</p> : null;
  if (video.kind === "arquivo") return <div className="trn-video"><ArquivoVideo src={video.src} titulo="Vídeo do treinamento" /></div>;
  if (video.kind === "link") return <a className="trn-link" href={video.href} target="_blank" rel="noopener noreferrer">Abrir vídeo do treinamento</a>;
  return (
    <div className="trn-video">
      <iframe src={video.src} title="Vídeo do treinamento" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      <a className="trn-link" href={video.href} target="_blank" rel="noopener noreferrer">Abrir o vídeo em outra janela</a>
    </div>
  );
});

const AnexoItem = memo(function AnexoItem({ anexo }: { anexo: Anexo }) {
  const [falhou, setFalhou] = useState(false);
  const href = anexoUrl(anexo);
  const tamanho = formatTamanho(anexo.tamanho);
  if (isAnexoVideo(anexo)) {
    return (
      <li className="trn-anexo trn-anexo--video">
        <div className="trn-video"><ArquivoVideo src={href} titulo={anexo.nome} /></div>
        <span>{anexo.nome}{tamanho ? ` · ${tamanho}` : ""}</span>
      </li>
    );
  }
  if (isAnexoImagem(anexo) && !falhou) {
    return (
      <li className="trn-anexo trn-anexo--foto">
        <a href={href} target="_blank" rel="noopener noreferrer"><img src={href} alt={anexo.nome} loading="lazy" decoding="async" data-error-quiet="" onError={() => setFalhou(true)} /></a>
        <span>{anexo.nome}{tamanho ? ` · ${tamanho}` : ""}</span>
      </li>
    );
  }
  return (
    <li className="trn-anexo">
      <a href={href} target="_blank" rel="noopener noreferrer">
        <strong>{anexo.nome}</strong>
        <small>{falhou ? "A imagem não carregou aqui. Toque para abrir no SharePoint." : `${isAnexoImagem(anexo) ? "Foto" : "Arquivo"}${tamanho ? ` · ${tamanho}` : ""} · abre no SharePoint`}</small>
      </a>
    </li>
  );
});

type DetalheProps = Pick<Props, "onParticipacaoChange" | "driverName"> & { item: TreinamentoMotorista; onClose: () => void };

function TreinamentoDetalhe({ item, driverName, onParticipacaoChange, onClose }: DetalheProps) {
  const { treinamento, participacao } = item;
  const etapa = proximaEtapa(treinamento, participacao);
  const assinatura = useMemo(() => parseStrokes(participacao.assinaturaJson), [participacao.assinaturaJson]);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [fimVisto, setFimVisto] = useState(false);
  const [strokes, setStrokes] = useState<SignatureStrokes>([]);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<ResultadoQuiz | null>(null);
  const [jaEstavaConcluido] = useState(() => Boolean(participacao.concluidoEm));
  const fimRef = useRef<HTMLDivElement | null>(null);
  const resultadoRef = useRef<HTMLElement | null>(null);
  // Última participação recebida: a resposta da abertura pode chegar depois de outra gravação e não pode apagá-la.
  const participacaoRef = useRef(participacao);
  participacaoRef.current = participacao;

  // Primeira abertura grava abertoem; reabrir não altera a participação.
  useEffect(() => {
    if (participacao.abertoEm) return;
    let ativo = true;
    abrirTreinamento(participacao)
      // Propaga mesmo se a tela fechou antes da resposta: o Dataverse já gravou e a lista precisa saber.
      .then((p) => onParticipacaoChange({ ...participacaoRef.current, abertoEm: p.abertoEm }))
      .catch((cause) => {
        reportAppError(cause, { source: "treinamentos", action: "abrirTreinamento", screen: "Treinamentos", detailId: treinamento.id, notifyUser: false });
        if (ativo) setErro("Não foi possível registrar a abertura. Verifique a internet e tente de novo.");
      });
    return () => { ativo = false; };
  }, [participacao.id, participacao.abertoEm]);

  // "Confirmar leitura" só depois de rolar até o fim do conteúdo (ou quando ele cabe inteiro na tela).
  useEffect(() => {
    if (etapa !== "leitura" || fimVisto) return;
    const alvo = fimRef.current;
    if (!alvo) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setFimVisto(true); }, { threshold: 0.1 });
    observer.observe(alvo);
    return () => observer.disconnect();
  }, [etapa, fimVisto]);

  useEffect(() => { if (resultado) resultadoRef.current?.focus(); }, [resultado]);

  const executar = async (acao: () => Promise<Participacao>, nome: string, fallback: string) => {
    setBusy(true);
    setErro("");
    try {
      const p = await acao();
      onParticipacaoChange(p);
    } catch (cause) {
      reportAppError(cause, { source: "treinamentos", action: nome, screen: "Treinamentos", detailId: treinamento.id, notifyUser: false });
      setErro(cause instanceof Error && cause.message ? cause.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const enviarQuiz = () => executar(async () => {
    const { participacao: p, resultado: r } = await responderQuiz(item, respostas);
    setResultado(r);
    return p;
  }, "responderQuiz", "Não foi possível enviar as respostas. Tente de novo.");

  const refazer = () => { setRespostas({}); setResultado(null); setErro(""); };
  const spinner = busy ? <span className="termo-spinner" aria-hidden="true" /> : null;
  const exigencias = [treinamento.exigeAssinatura ? "Assinatura obrigatória" : "", treinamento.exigeQuiz ? `Quiz · nota mínima ${treinamento.notaMinima}%` : ""].filter(Boolean);
  const validade = formatValidade(treinamento.validade);

  return (
    <section className="termo-screen trn-detail" aria-label="Treinamento">
      <article className="termo-card">
        <div className="trn-meta">
          {exigencias.length ? exigencias.map((texto) => <span key={texto} className="termo-badge" data-tone="atencao">{texto}</span>) : <span className="termo-badge" data-tone="neutro">Leitura</span>}
          {treinamento.publicadoEm ? <time dateTime={treinamento.publicadoEm}>{formatData(treinamento.publicadoEm)}</time> : null}
        </div>
        <h2 className="trn-title">{treinamento.titulo}</h2>
        {treinamento.descricao ? <p className="trn-descricao">{treinamento.descricao}</p> : null}
        {validade && etapa !== "concluido" ? <p className="termo-prazo">Conclua até <strong>{validade}</strong>.</p> : null}
        <Video url={treinamento.videoUrl} />
        <Conteudo texto={treinamento.conteudo} />
        {treinamento.anexos.length ? (
          <div className="trn-anexos">
            <h3 className="termo-section-title">Fotos e arquivos</h3>
            <ul>{treinamento.anexos.map((anexo) => <AnexoItem key={anexo.caminho} anexo={anexo} />)}</ul>
          </div>
        ) : null}
        <div ref={fimRef} className="trn-fim" aria-hidden="true" />
      </article>

      {erro ? <p className="termo-alert" data-tone="erro" role="alert">{erro}</p> : null}

      {etapa === "leitura" ? (
        <section className="trn-step" aria-label="Confirmar leitura">
          <p className="termo-help">{fimVisto ? "Leu tudo? Confirme a leitura para seguir." : "Role até o fim do conteúdo para confirmar a leitura."}</p>
          <button type="button" className="termo-primary" disabled={!fimVisto || busy} aria-busy={busy || undefined} onClick={() => void executar(() => confirmarLeitura(item), "confirmarLeitura", "Não foi possível confirmar a leitura. Tente de novo.")}>
            {spinner}{busy ? "Confirmando" : "Confirmar leitura"}
          </button>
        </section>
      ) : null}

      {etapa === "assinatura" ? (
        <section className="trn-step" aria-label="Assinatura">
          <h3 className="termo-section-title">Assinatura</h3>
          <p className="termo-help">A assinatura será registrada em seu nome: <strong>{driverName}</strong>.</p>
          <div className="termo-signature" data-empty={strokes.length === 0 || undefined}>
            <SignaturePad value={strokes} onChange={setStrokes} />
            <span className="termo-signature-hint" aria-hidden="true">Assine com o dedo aqui</span>
            <span className="termo-signature-line" aria-hidden="true" />
          </div>
          <button type="button" className="termo-primary" disabled={!strokes.length || busy} aria-busy={busy || undefined} onClick={() => void executar(() => assinarTreinamento(item, strokes, driverName), "assinarTreinamento", "Não foi possível salvar a assinatura. Tente de novo.")}>
            {spinner}{busy ? "Salvando assinatura" : "Assinar"}
          </button>
        </section>
      ) : null}

      {etapa === "quiz" ? (
        <section className="trn-step trn-quiz" aria-label="Quiz">
          <h3 className="termo-section-title">Quiz · nota mínima {treinamento.notaMinima}%</h3>
          {resultado && !resultado.aprovado ? (
            <section ref={resultadoRef} tabIndex={-1} className="termo-alert" data-tone="erro" role="status">
              <p>Você acertou {resultado.acertos} de {resultado.total} ({resultado.nota}%). A nota mínima é {treinamento.notaMinima}%.</p>
              <button type="button" className="termo-text-button" onClick={refazer}>Refazer quiz</button>
            </section>
          ) : (
            <>
              <p className="termo-help">
                {participacao.assinadoEm ? "Assinatura registrada. " : "Leitura confirmada. "}Responda todas as perguntas. Se não atingir a nota mínima, você pode refazer.
                {participacao.tentativas > 0 ? ` Esta é a tentativa ${participacao.tentativas + 1}.` : ""}
              </p>
              {treinamento.perguntas.map((p, i) => (
                <fieldset key={p.id} className="trn-pergunta">
                  <legend>{i + 1}. {p.texto}</legend>
                  {p.alternativas.map((a) => (
                    <label key={a.id} className="trn-alternativa" data-checked={respostas[p.id] === a.id || undefined}>
                      <input type="radio" name={`trn-${p.id}`} value={a.id} checked={respostas[p.id] === a.id} disabled={busy} onChange={() => setRespostas((atual) => ({ ...atual, [p.id]: a.id }))} />
                      <span>{a.texto}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
              <button type="button" className="termo-primary" disabled={!quizCompleto(treinamento.perguntas, respostas) || busy} aria-busy={busy || undefined} onClick={() => void enviarQuiz()}>
                {spinner}{busy ? "Corrigindo" : "Enviar respostas"}
              </button>
            </>
          )}
        </section>
      ) : null}

      {etapa === "concluido" ? (
        <section className={`termo-card trn-concluido${jaEstavaConcluido ? "" : " is-fresh"}`} role="status" aria-label="Treinamento concluído">
          <div className="termo-result"><SuccessCheck /><h2>Treinamento concluído</h2><p>Fica guardado aqui para você consultar quando quiser.</p></div>
          <dl className="trn-resumo">
            <div><dt>Concluído em</dt><dd>{formatDataHora(participacao.concluidoEm)}</dd></div>
            <div><dt>Leitura confirmada</dt><dd>{formatDataHora(participacao.confirmadoEm)}</dd></div>
            {participacao.assinadoEm ? <div><dt>Assinado por</dt><dd>{participacao.nomeAssinante || driverName}<small>{formatDataHora(participacao.assinadoEm)}</small></dd></div> : null}
            {participacao.nota != null ? <div><dt>Quiz</dt><dd>{participacao.nota}% · {participacao.aprovado ? "aprovado" : "reprovado"}<small>{participacao.tentativas} tentativa{participacao.tentativas === 1 ? "" : "s"}</small></dd></div> : null}
          </dl>
          {participacao.assinaturaJson ? <div className="trn-assinatura"><SignatureDrawing value={assinatura} /></div> : null}
          <button type="button" className="termo-primary" onClick={onClose}>Voltar para treinamentos</button>
        </section>
      ) : null}
    </section>
  );
}

export function TreinamentosScreen({ items, loadStatus, selectedId, onSelectedIdChange, onBack, onReload, onParticipacaoChange, driverName }: Props) {
  const [aba, setAba] = useState<AbaTermos>("pendentes");
  const [erro, setErro] = useState("");
  const tabRefs = useRef<Partial<Record<AbaTermos, HTMLButtonElement | null>>>({});
  const selected = items.find((item) => item.participacao.id === selectedId) ?? null;
  const { pendentes, concluidos } = useMemo(() => separarTreinamentos(items), [items]);
  const lista = aba === "pendentes" ? pendentes : concluidos;

  const onTabKey = (event: KeyboardEvent) => {
    const next = proximaAba(aba, event.key);
    if (!next) return;
    event.preventDefault();
    setAba(next);
    tabRefs.current[next]?.focus();
  };

  const refresh = async () => {
    setErro("");
    try { await onReload(); }
    catch (cause) {
      reportAppError(cause, { source: "treinamentos", action: "refresh", screen: "Treinamentos", notifyUser: false });
      setErro("Não foi possível atualizar os treinamentos. Tente novamente.");
    }
  };

  const close = () => onSelectedIdChange("");

  return (
    <AppShell screenLabel="Treinamentos">
      <ServicesMenu
        title="Treinamentos"
        eyebrow={isMockTreinamentos() ? "RH · Mock local" : "RH"}
        homeLabel="Voltar"
        homeIcon="arrowLeft"
        onHome={selected ? close : onBack}
        onRefresh={selected ? undefined : refresh}
      />
      {selected ? (
        <TreinamentoDetalhe key={selected.participacao.id} item={selected} driverName={driverName} onParticipacaoChange={onParticipacaoChange} onClose={close} />
      ) : (
        <section className="termo-screen" aria-label="Lista de treinamentos">
          <div className="termo-tabs" role="tablist" aria-label="Situação dos treinamentos" onKeyDown={onTabKey}>
            {([["pendentes", "Pendentes", pendentes.length], ["concluidos", "Concluídos", concluidos.length]] as const).map(([id, label, count]) => (
              <button key={id} ref={(el) => { tabRefs.current[id] = el; }} type="button" role="tab" id={`trn-tab-${id}`} tabIndex={aba === id ? 0 : -1} aria-selected={aba === id} aria-controls="trn-tabpanel" className="termo-tab" onClick={() => setAba(id)}>
                {label}{count ? <span className="termo-tab-count">{count}</span> : null}
              </button>
            ))}
          </div>
          <div id="trn-tabpanel" role="tabpanel" aria-labelledby={`trn-tab-${aba}`} className="termo-tabpanel" key={aba}>
            {erro ? <p className="termo-alert" data-tone="erro" role="alert">{erro}</p> : null}
            {loadStatus === "loading" && !items.length ? (
              <div className="termo-skeleton" role="status" aria-busy="true" aria-label="Carregando treinamentos"><span /><span /></div>
            ) : loadStatus === "error" && !items.length ? (
              <div className="termo-alert" data-tone="erro" role="alert">
                <p>Não foi possível carregar os treinamentos.</p>
                <button type="button" className="termo-text-button" onClick={() => void refresh()}>Tentar de novo</button>
              </div>
            ) : lista.length ? (
              <ul className="termo-list">
                {lista.map((item) => {
                  const status = statusTreinamento(item.participacao);
                  const validade = formatValidade(item.treinamento.validade);
                  const extras = [item.treinamento.exigeAssinatura ? "Assinatura" : "", item.treinamento.exigeQuiz ? "Quiz" : ""].filter(Boolean).join(" · ");
                  const quando = status === "concluido" ? `Concluído em ${formatData(item.participacao.concluidoEm)}` : validade ? `Até ${validade}` : "";
                  return (
                    <li key={item.participacao.id}>
                      <button type="button" className="termo-row trn-row" onClick={() => onSelectedIdChange(item.participacao.id)}>
                        <span className="termo-row-main">
                          <strong>{item.treinamento.titulo}</strong>
                          {item.treinamento.descricao ? <span>{item.treinamento.descricao}</span> : null}
                          <small>{[extras, quando, status === "concluido" && item.participacao.nota != null ? `Nota ${item.participacao.nota}%` : ""].filter(Boolean).join(" · ")}</small>
                        </span>
                        <span className="termo-row-side"><span className="termo-badge" data-tone={STATUS[status].tone}>{STATUS[status].label}</span></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="termo-empty">{aba === "pendentes" ? "Nenhum treinamento pendente. Quando o RH publicar um para você, ele aparece aqui." : "Nenhum treinamento concluído ainda."}</p>
            )}
          </div>
        </section>
      )}
    </AppShell>
  );
}
