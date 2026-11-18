import { MapPin, ThumbsDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { PostoDetalheDialog } from "./PostoDetalheDialog";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { BrandLoader } from "../../shared/ui/BrandLoader";
import { ServicesMenu } from "../../shared/ui/navigation/ServicesMenu";
import { reportAppError } from "../../shared/appErrorLogger";
import { maioriaNaoRecomenda, rotuloRecomendacoes, type ResumoAvaliacoes } from "./avaliacaoPostos";
import { formatDiaMes, isMockGastosCartao } from "./gastosCartao";
import { formatBRL } from "./gastosRelatorio";
import { RAIO_KM, RECOMENDACAO, carregarRankingPostos, obterPosicao, postosProximos, rotuloAbastecimentos, rotuloDistancia, rotuloMelhor, separarMelhor, urlMaps, type Posicao, type PostoProximo, type RankingPostos } from "./rankingPostos";
import { descreverGpsErro } from "../termos/termosMulta";

type Etapa = "localizacao" | "postos";

type Carga =
  | { status: "loading"; etapa: Etapa }
  | { status: "error" }
  | { status: "semGps"; mensagem: string }
  | { status: "ready"; ranking: RankingPostos; origem: Posicao; atualizando?: boolean; aviso?: string };

export function RankingPostosScreen({ onBack }: { onBack: () => void }) {
  const [carga, setCarga] = useState<Carga>({ status: "loading", etapa: "localizacao" });
  const [aberto, setAberto] = useState<PostoProximo | null>(null);
  const fecharPosto = useCallback(() => setAberto(null), []);
  const aplicarAvaliacao = useCallback((postoId: string, avaliacoes: ResumoAvaliacoes) => {
    setCarga((anterior) => (anterior.status === "ready" ? { ...anterior, ranking: { ...anterior.ranking, postos: anterior.ranking.postos.map((posto) => (posto.postoId === postoId ? { ...posto, avaliacoes } : posto)) } } : anterior));
    setAberto((atual) => (atual?.postoId === postoId ? { ...atual, avaliacoes } : atual));
  }, []);
  const pedido = useRef(0);
  const carregar = useCallback(async () => {
    const atual = ++pedido.current;
    // Atualizar mantém a lista na tela: só a primeira carga mostra o esqueleto.
    setCarga((anterior) => (anterior.status === "ready" ? { ...anterior, atualizando: true, aviso: "" } : { status: "loading", etapa: "localizacao" }));
    const localizacao = obterPosicao().then((origem) => {
      if (atual === pedido.current) setCarga((anterior) => (anterior.status === "loading" ? { status: "loading", etapa: "postos" } : anterior));
      return origem;
    });
    const [posicao, dados] = await Promise.allSettled([localizacao, carregarRankingPostos()]);
    if (dados.status === "rejected") reportAppError(dados.reason, { severity: "warning", source: "app", action: "carregarRankingPostos", screen: "RankingPostos", notifyUser: false });
    if (atual !== pedido.current) return;
    if (posicao.status === "fulfilled" && dados.status === "fulfilled") {
      setCarga({ status: "ready", ranking: dados.value, origem: posicao.value });
      return;
    }
    const mensagemGps = posicao.status === "rejected" ? descreverGpsErro(posicao.reason as { code?: number } | null) : "";
    setCarga((anterior) => {
      if (anterior.status === "ready") return { ...anterior, atualizando: false, aviso: mensagemGps || "Não foi possível atualizar. Mostrando a última lista carregada." };
      return mensagemGps ? { status: "semGps", mensagem: mensagemGps } : { status: "error" };
    });
  }, []);
  useEffect(() => {
    void carregar();
    return () => { pedido.current += 1; };
  }, [carregar]);

  const proximos = carga.status === "ready" ? postosProximos(carga.ranking.postos, carga.origem) : [];

  return (
    <AppShell screenLabel="RankingPostos">
      <ServicesMenu
        title="Postos perto de você"
        eyebrow={isMockGastosCartao() ? "Financeiro · Mock local" : "Financeiro"}
        homeLabel="Voltar"
        homeIcon="arrowLeft"
        onHome={onBack}
        onRefresh={carregar}
      />
      <section className="termo-screen gr-screen" aria-label="Postos perto de você">
        {carga.status === "loading" ? (
          <ListaCarregando etapa={carga.etapa} />
        ) : carga.status === "semGps" ? (
          <div className="termo-alert" data-tone="atencao" role="alert">
            <p>{carga.mensagem}</p>
            <button type="button" className="termo-text-button" onClick={carregar}>Tentar de novo</button>
          </div>
        ) : carga.status === "error" ? (
          <div className="termo-alert" data-tone="erro" role="alert">
            <p>Não foi possível carregar os postos.</p>
            <button type="button" className="termo-text-button" onClick={carregar}>Tentar de novo</button>
          </div>
        ) : proximos.length === 0 ? (
          <p className="termo-empty">Nenhum posto usado pela frota a até {RAIO_KM} km de você nos últimos {carga.ranking.dias} dias.</p>
        ) : (
          <>
            {carga.atualizando ? <BrandLoader variant="inline" size="sm" label="Atualizando postos" text="Atualizando postos" /> : null}
            {carga.aviso ? <div className="termo-alert" data-tone="atencao" role="alert"><p>{carga.aviso}</p></div> : null}
            <ListaPostos proximos={proximos} dias={carga.ranking.dias} onAbrir={setAberto} />
          </>
        )}
      </section>
      {aberto && carga.status === "ready" ? <PostoDetalheDialog posto={aberto} dias={carga.ranking.dias} onAvaliado={aplicarAvaliacao} onClose={fecharPosto} /> : null}
    </AppShell>
  );
}

const TEXTO_ETAPA: Record<Etapa, string> = { localizacao: "Buscando sua localização…", postos: "Procurando postos perto de você…" };

function ListaCarregando({ etapa }: { etapa: Etapa }) {
  return (
    <div className="rp-loader">
      <BrandLoader variant="inline" size="md" label={TEXTO_ETAPA[etapa]} text={TEXTO_ETAPA[etapa]} />
      <ol className="rp-etapas">
        <li data-estado={etapa === "localizacao" ? "ativa" : "feita"}><i aria-hidden="true" />Localização</li>
        <li data-estado={etapa === "postos" ? "ativa" : "pendente"}><i aria-hidden="true" />Postos</li>
      </ol>
    </div>
  );
}

function ListaPostos({ proximos, dias, onAbrir }: { proximos: PostoProximo[]; dias: number; onAbrir: (posto: PostoProximo) => void }) {
  const { melhor, outros } = separarMelhor(proximos);
  const alerta = maioriaNaoRecomenda(melhor.avaliacoes);
  return (
    <>
      <section className="rp-hero rp-entrada" data-semaforo={melhor.cor}>
        <button type="button" className="rp-hero-abrir" onClick={() => onAbrir(melhor)}>
          <span className="rp-hero-tag">{rotuloMelhor(melhor.cor, alerta)}</span>
          <strong className="rp-hero-nome">{melhor.nome}</strong>
          <span className="rp-hero-linha">
            <span className="rp-hero-preco">{formatBRL(melhor.precoLitro)}<small>/L</small></span>
            <span className="rp-hero-distancia">{rotuloDistancia(melhor)}</span>
          </span>
          <span className="rp-hero-detalhe">{RECOMENDACAO[melhor.cor].rotulo} · {rotuloAbastecimentos(melhor.abastecimentos)} · último em {formatDiaMes(melhor.ultimoAbastecimento)}</span>
          {melhor.avaliacoes.total ? <span className="rp-hero-avaliacao" data-alerta={alerta}>{alerta ? <ThumbsDown aria-hidden="true" /> : null}{alerta ? `Atenção: só ${rotuloRecomendacoes(melhor.avaliacoes)}` : rotuloRecomendacoes(melhor.avaliacoes)}</span> : null}
        </button>
        <a className="rp-maps" href={urlMaps(melhor)} target="_blank" rel="noreferrer"><MapPin aria-hidden="true" />Abrir no Maps</a>
      </section>
      {outros.length ? (
        <section className="rp-entrada" style={{ "--i": 1 } as CSSProperties} aria-labelledby="rp-outros">
          <h2 className="gr-subtitulo" id="rp-outros">Outros postos</h2>
          <ul className="rp-lista">
            {outros.map((posto, indice) => (
              <li key={`${posto.nome}-${indice}`} className="rp-posto" data-semaforo={posto.cor}>
                <button type="button" className="rp-posto-abrir" onClick={() => onAbrir(posto)}>
                  <i aria-hidden="true" />
                  <span className="rp-posto-texto">
                    <strong>{posto.nome}</strong>
                    <span>{rotuloDistancia(posto)} · {rotuloAbastecimentos(posto.abastecimentos)}</span>
                    {posto.avaliacoes.total ? <span className="rp-posto-avaliacao" data-alerta={maioriaNaoRecomenda(posto.avaliacoes)}>{rotuloRecomendacoes(posto.avaliacoes)}</span> : null}
                  </span>
                  <span className="rp-posto-preco">
                    <strong>{formatBRL(posto.precoLitro)}</strong>
                    <span>{RECOMENDACAO[posto.cor].rotulo}</span>
                  </span>
                </button>
                <a className="rp-posto-maps" href={urlMaps(posto)} target="_blank" rel="noreferrer" aria-label={`Abrir ${posto.nome} no Maps`}><MapPin aria-hidden="true" /></a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="gr-legenda rp-entrada" style={{ "--i": 2 } as CSSProperties}>Média paga pela frota nos últimos {dias} dias, a até {RAIO_KM} km de você. É um preço pago, não o preço de hoje.</p>
    </>
  );
}
