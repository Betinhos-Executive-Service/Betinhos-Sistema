import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { reportAppError } from "../../shared/appErrorLogger";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { BrandLoader } from "../../shared/ui/BrandLoader";
import { ServicesMenu } from "../../shared/ui/navigation/ServicesMenu";
import { customApiErrorMessage } from "../../data/dataverse/customApi";
import { AceiteCnhCard } from "./AceiteCnhCard";
import { agruparMinhasMultas, diaMes, ETAPAS_MULTA, etapaDaMulta, hojeEmBrasilia, horaDoCache, legendaParcelas, mesFolha, parcelasVigentes, resumoDesconto, SEM_CONEXAO_TEXTO, textoChipPrazo, type CargaStatus, type MinhaMulta } from "./minhasMultas";
import { TermoMultaDetalheScreen } from "./TermoMultaDetalheScreen";
import { abrirPdf, baixarPdf, formatBrl, formatDataHora, isMockTermos, navegadorPdfEnv, obterTermo, type TermoMulta } from "./termosMulta";

type Props = {
  items: MinhaMulta[];
  termos: TermoMulta[];
  loadStatus: CargaStatus;
  /** Hora da leitura guardada quando a lista veio do aparelho (sem conexão); null com dados novos. */
  offlineEm: string | null;
  /** Hora da última leitura bem-sucedida (para a faixa quando a rede cai depois de carregar). */
  lidoEm: string | null;
  onBack: () => void;
  onReload: () => Promise<void>;
  onDeclarar: (multaId: string) => Promise<void>;
  /** Avisa o App quando um termo abre ou fecha (o tour tem um capítulo para cada estado). */
  onSelectedChange?: (id: string) => void;
};

function useOnline(aoVoltar: () => void) {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const aoVoltarRef = useRef(aoVoltar);
  aoVoltarRef.current = aoVoltar;
  useEffect(() => {
    const ligar = () => { setOnline(true); aoVoltarRef.current(); };
    const desligar = () => setOnline(false);
    window.addEventListener("online", ligar);
    window.addEventListener("offline", desligar);
    return () => { window.removeEventListener("online", ligar); window.removeEventListener("offline", desligar); };
  }, []);
  return online;
}

type Acoes = { somenteLeitura: boolean; onAbrirTermo: (m: MinhaMulta) => void; onDeclarar: (id: string) => Promise<void> };

/** Abertura do PDF do termo assinado; o botão só aparece com termo assinado. */
function VerTermoAssinado({ multa, somenteLeitura }: { multa: MinhaMulta; somenteLeitura: boolean }) {
  const [pdf, setPdf] = useState({ busy: false, erro: "" });
  if (multa.termoStatus !== "assinado" || !multa.termoId) return null;
  const termoId = multa.termoId;
  const verPdf = async () => {
    setPdf({ busy: true, erro: "" });
    try {
      await abrirPdf(await baixarPdf(termoId), navegadorPdfEnv());
      setPdf({ busy: false, erro: "" });
    } catch (error) {
      reportAppError(error, { source: "termosMulta", action: "baixarPdf", screen: "Multas", detailId: termoId, detailType: "TERMO_MULTA", notifyUser: false });
      setPdf({ busy: false, erro: customApiErrorMessage(error, "Não foi possível abrir o PDF.") });
    }
  };
  return (
    <>
      <button type="button" className="multa-botao multa-botao-sec" disabled={somenteLeitura || pdf.busy} aria-busy={pdf.busy || undefined} onClick={() => void verPdf()}>
        {pdf.busy ? "Abrindo PDF" : "Ver termo assinado"}
      </button>
      {pdf.erro ? <p className="termo-alert" data-tone="erro" role="alert">{pdf.erro}</p> : null}
    </>
  );
}

/** Trilha de 4 etapas: feita = azul-marinho, atual = âmbar com rótulo em negrito, futura = cinza. */
function Trilha({ etapa }: { etapa: number }) {
  const estado = (i: number) => (i < etapa ? "feita" : i === etapa ? "atual" : "futura");
  return (
    <ol className="multa-trilha" aria-label="Etapas da multa">
      {ETAPAS_MULTA.map((nome, i) => (
        <li key={nome} data-estado={estado(i)} aria-current={i === etapa ? "step" : undefined}>
          <i aria-hidden="true" />
          <span>{nome}</span>
        </li>
      ))}
    </ol>
  );
}

function Meta({ multa }: { multa: MinhaMulta }) {
  const partes = [formatDataHora(multa.dataHora), multa.local].filter(Boolean);
  return (
    <p className="multa-meta">
      {partes.join(" · ")}
      {multa.infracao ? <><br />{multa.infracao}</> : null}
    </p>
  );
}

/** Cartões abertos na sessão do app (por id da multa): sobrevivem à ida ao termo e à volta. Sem armazenamento persistente. */
const cartoesAbertos = new Set<string>();

/** Cartão que começa fechado: o cabeçalho é o botão que abre e fecha os detalhes. `resumoSoFechado` esconde o resumo quando o corpo já repete a informação. */
function Cartao({ id, className, grupo, chip, titulo, resumo, resumoSoFechado, tour, children }: { id: string; className?: string; grupo: string; chip?: ReactNode; titulo: string; resumo: string; resumoSoFechado?: boolean; tour?: string; children: ReactNode }) {
  const [aberto, setAbertoEstado] = useState(() => cartoesAbertos.has(id));
  const alternar = () => setAbertoEstado((v) => {
    if (v) cartoesAbertos.delete(id); else cartoesAbertos.add(id);
    return !v;
  });
  const corpoId = useId();
  return (
    <li className={`multa-card${className ? ` ${className}` : ""}`} data-grupo={grupo} data-aberto={aberto || undefined}>
      <button type="button" className="multa-cabeca" aria-expanded={aberto} aria-controls={corpoId} data-tour={tour} onClick={alternar}>
        <span className="multa-cabeca-texto">
          {chip}
          <span className="multa-titulo">{titulo}</span>
          {resumoSoFechado && aberto ? null : <span className="multa-resumo">{resumo}</span>}
        </span>
        <span className="multa-seta" aria-hidden="true" />
      </button>
      <div id={corpoId} className="multa-corpo" role="region" aria-label={titulo}>
        <div className="multa-corpo-int"><div className="multa-detalhes">{children}</div></div>
      </div>
    </li>
  );
}

/** Cartão de tarefa: o que o motorista precisa fazer agora. */
function TarefaCard({ multa, somenteLeitura, onAbrirTermo, onDeclarar }: { multa: MinhaMulta } & Acoes) {
  const chip = multa.acao === "aceite" ? textoChipPrazo(multa.prazoAceite, hojeEmBrasilia()) : "";
  const titulo = multa.acao === "assinar" ? "Assinar o termo da multa" : multa.acao === "aceite" ? "Aceitar a indicação na CNH Digital" : multa.situacao;
  const resumo = [multa.placa || multa.auto, diaMes(multa.dataHora)].filter(Boolean).join(" · ");
  const tour = multa.acao === "aceite" ? "multas-aceite" : multa.acao === "assinar" ? "multas-termo" : undefined;
  const chipEl = <span className="multa-chip" data-tom={chip ? (chip.startsWith("Prazo vencido") ? "vencido" : "prazo") : "neutro"}>{chip || "Sem prazo marcado"}</span>;
  return (
    <Cartao id={multa.id} className="multa-tarefa" grupo={multa.grupo} chip={chipEl} titulo={titulo} resumo={resumo} tour={tour}>
      <Meta multa={multa} />
      <Trilha etapa={etapaDaMulta(multa)} />
      {multa.acao === "assinar" ? (
        <>
          <p className="multa-frase">Você lê o termo, confere o valor e assina pelo app.</p>
          <button type="button" className="termo-primary multa-botao" disabled={somenteLeitura} onClick={() => onAbrirTermo(multa)}>
            {somenteLeitura ? SEM_CONEXAO_TEXTO : "Ler e assinar o termo"}
          </button>
        </>
      ) : null}
      {multa.acao === "aceite" ? <AceiteCnhCard multa={multa} semConexao={somenteLeitura} onDeclarar={onDeclarar} /> : null}
    </Cartao>
  );
}

/** Bloco de dinheiro: quanto falta descontar, barra por parcela e o mês de cada uma. */
function DescontoCard({ multa, somenteLeitura, destaqueTour }: { multa: MinhaMulta; somenteLeitura: boolean; destaqueTour: boolean }) {
  const parcelas = parcelasVigentes(multa.parcelas);
  const { total, descontadas, falta } = resumoDesconto(multa.parcelas);
  const proxima = parcelas.find((p) => p.status !== "descontada")?.numero;
  const resumo = `Falta descontar ${formatBrl(falta)} · ${descontadas} de ${total} descontadas`;
  return (
    <Cartao id={multa.id} className="multa-dinheiro" resumoSoFechado grupo={multa.grupo} titulo={`Multa ${multa.placa || multa.auto} · ${diaMes(multa.dataHora)}`} resumo={resumo} tour={destaqueTour ? "multas-parcelas" : undefined}>
      <Trilha etapa={etapaDaMulta(multa)} />
      <p className="multa-rotulo">Falta descontar</p>
      <p className="multa-valor">{formatBrl(falta)}</p>
      <div className="multa-barra" aria-hidden="true">{parcelas.map((p) => <i key={p.numero} data-on={p.status === "descontada" || undefined} />)}</div>
      <p className="multa-legenda">{legendaParcelas(descontadas, total)}</p>
      <ul className="multa-meses" aria-label="Parcelas do desconto em folha">
        {parcelas.map((p) => (
          <li key={p.numero} data-estado={p.status === "descontada" ? "descontada" : p.numero === proxima ? "proxima" : "futura"}>
            <span>{mesFolha(p.competencia) || `Parcela ${p.numero}`}</span>
            <span>{formatBrl(p.valor)}{p.status === "descontada" ? " · descontada" : p.numero === proxima ? " · próxima" : ""}</span>
          </li>
        ))}
      </ul>
      <VerTermoAssinado multa={multa} somenteLeitura={somenteLeitura} />
    </Cartao>
  );
}

/** Multa sem tarefa nem parcelas (em andamento ou encerrada): trilha e uma linha com a situação. */
function SimplesCard({ multa, somenteLeitura }: { multa: MinhaMulta; somenteLeitura: boolean }) {
  const resumo = [multa.placa || multa.auto, diaMes(multa.dataHora)].filter(Boolean).join(" · ");
  return (
    <Cartao id={multa.id} grupo={multa.grupo} titulo={multa.situacao} resumo={resumo}>
      <Meta multa={multa} />
      <Trilha etapa={etapaDaMulta(multa)} />
      <VerTermoAssinado multa={multa} somenteLeitura={somenteLeitura} />
    </Cartao>
  );
}

function Grupo({ titulo, destaque, children }: { titulo: string; destaque?: boolean; children: ReactNode }) {
  return (
    <section className="multa-grupo" data-destaque={destaque || undefined} data-tour={destaque ? "multas-precisa" : undefined} aria-label={titulo}>
      <h2 className="multa-grupo-titulo">{titulo}</h2>
      <ul className="termo-list">{children}</ul>
    </section>
  );
}

export function MinhasMultasScreen({ items, termos, loadStatus, offlineEm, lidoEm, onBack, onReload, onDeclarar, onSelectedChange }: Props) {
  // Guarda o termo aberto: depois de assinar a multa muda de grupo, mas a tela de sucesso continua.
  const [selected, setSelected] = useState<TermoMulta | null>(null);
  useEffect(() => { onSelectedChange?.(selected?.id ?? ""); }, [selected?.id, onSelectedChange]);
  const [encerradasAbertas, setEncerradasAbertas] = useState(false);
  const [error, setError] = useState("");
  const grupos = agruparMinhasMultas(items);
  const comDesconto = grupos.andamento.filter((m) => parcelasVigentes(m.parcelas).length > 0);
  const semDesconto = grupos.andamento.filter((m) => parcelasVigentes(m.parcelas).length === 0);

  const refresh = async () => {
    setError("");
    try { await onReload(); }
    catch (cause) {
      reportAppError(cause, { source: "termosMulta", action: "refresh", screen: "Multas", notifyUser: false });
      setError("Não foi possível atualizar as multas. Tente novamente.");
    }
  };
  // Voltou a rede: relê as multas para sair do modo offline.
  const online = useOnline(() => void refresh());
  const somenteLeitura = !online || offlineEm !== null;
  const faixaEm = offlineEm ?? (online ? null : lidoEm);
  // O hook já carrega ao montar; aqui só se tenta de novo quando a primeira carga falhou.
  useEffect(() => { if (loadStatus === "error") void refresh(); }, []);

  const abrirTermo = async (multa: MinhaMulta) => {
    if (!multa.termoId) return;
    try {
      const termo = termos.find((t) => t.id === multa.termoId) ?? await obterTermo(multa.termoId);
      if (termo) setSelected(termo); else setError("Não encontramos o termo desta multa. Atualize a lista.");
    } catch (cause) {
      reportAppError(cause, { source: "termosMulta", action: "abrirTermo", screen: "Multas", detailId: multa.termoId, notifyUser: false });
      setError("Não foi possível abrir o termo. Tente novamente.");
    }
  };

  const declarar = async (multaId: string) => {
    await onDeclarar(multaId);
    // Registro feito: a releitura é outra coisa e trata a própria falha (mensagem da tela).
    void refresh();
  };

  const close = () => { setSelected(null); void refresh(); };
  const comuns = { somenteLeitura, onAbrirTermo: (m: MinhaMulta) => void abrirTermo(m), onDeclarar: declarar };

  return (
    <AppShell screenLabel="Multas">
      {selected ? (
        // O detalhe desenha o próprio cabeçalho: o Voltar dele volta uma etapa do fluxo.
        <TermoMultaDetalheScreen key={selected.id} termo={selected} onDone={close} onRefresh={refresh} />
      ) : (
        <>
          <ServicesMenu title="Multas" eyebrow={isMockTermos() ? "Operação · Mock local" : "Operação"} homeLabel="Voltar" homeIcon="arrowLeft" onHome={onBack} onRefresh={refresh} />
          <section className="termo-screen" aria-label="Multas">
            {faixaEm ? <p className="termo-alert" data-tone="atencao" role="status">Sem conexão. Mostrando as multas de {horaDoCache(faixaEm)}.</p> : null}
            {error ? <p className="termo-alert" data-tone="erro" role="alert">{error}</p> : null}
            {loadStatus === "loading" && !items.length ? (
              <BrandLoader variant="inline" label="Carregando multas" text="Carregando multas" />
            ) : loadStatus === "error" && !items.length ? (
              <div className="termo-alert" data-tone="erro" role="alert">
                <p>Não foi possível carregar as multas.</p>
                <button type="button" className="termo-text-button" onClick={() => void refresh()}>Tentar de novo</button>
              </div>
            ) : !items.length ? (
              <p className="termo-empty">Você não tem multas no momento.</p>
            ) : (
              <div className="multa-grupos">
                {grupos.precisa.length ? (
                  <Grupo titulo={`Para fazer agora · ${grupos.precisa.length}`} destaque>
                    {grupos.precisa.map((m) => <TarefaCard key={m.id} multa={m} {...comuns} />)}
                  </Grupo>
                ) : null}
                {comDesconto.length ? (
                  <Grupo titulo="Desconto em folha">
                    {comDesconto.map((m, i) => <DescontoCard key={m.id} multa={m} somenteLeitura={somenteLeitura} destaqueTour={i === 0} />)}
                  </Grupo>
                ) : null}
                {semDesconto.length ? (
                  <Grupo titulo={`Em andamento · ${semDesconto.length}`}>
                    {semDesconto.map((m) => <SimplesCard key={m.id} multa={m} somenteLeitura={somenteLeitura} />)}
                  </Grupo>
                ) : null}
                {grupos.encerrada.length ? (
                  <section className="multa-grupo" aria-label="Encerradas">
                    <h2 className="multa-grupo-titulo">
                      <button type="button" className="multa-grupo-toggle" aria-expanded={encerradasAbertas} onClick={() => setEncerradasAbertas((v) => !v)}>
                        Encerradas · {grupos.encerrada.length}
                        <span className="multa-seta" aria-hidden="true" />
                      </button>
                    </h2>
                    {encerradasAbertas ? <ul className="termo-list">{grupos.encerrada.map((m) => <SimplesCard key={m.id} multa={m} somenteLeitura={somenteLeitura} />)}</ul> : null}
                  </section>
                ) : null}
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
