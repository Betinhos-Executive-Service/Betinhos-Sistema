import { MapPin } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { PostoDetalheDialog } from "../components/gastos/PostoDetalheDialog";
import { AppShell } from "../components/layout/AppShell";
import { ServicesMenu } from "../components/navigation/ServicesMenu";
import { reportAppError } from "../lib/appErrorLogger";
import { formatDiaMes, isMockGastosCartao } from "../lib/gastosCartao";
import { formatBRL } from "../lib/gastosRelatorio";
import { RAIO_KM, RECOMENDACAO, carregarRankingPostos, obterPosicao, postosProximos, rotuloAbastecimentos, rotuloDistancia, rotuloMelhor, separarMelhor, urlMaps, type Posicao, type PostoProximo, type RankingPostos } from "../lib/rankingPostos";
import { descreverGpsErro } from "../lib/termosMulta";

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
            {carga.atualizando ? <p className="rp-carregando-texto" role="status">Atualizando postos…</p> : null}
            {carga.aviso ? <div className="termo-alert" data-tone="atencao" role="alert"><p>{carga.aviso}</p></div> : null}
            <ListaPostos proximos={proximos} dias={carga.ranking.dias} onAbrir={setAberto} />
          </>
        )}
      </section>
      {aberto && carga.status === "ready" ? <PostoDetalheDialog posto={aberto} dias={carga.ranking.dias} onClose={fecharPosto} /> : null}
    </AppShell>
  );
}

const TEXTO_ETAPA: Record<Etapa, string> = { localizacao: "Buscando sua localização…", postos: "Procurando postos perto de você…" };

function ListaCarregando({ etapa }: { etapa: Etapa }) {
  return (
    <div className="rp-carregando" role="status">
      <p className="rp-carregando-texto">{TEXTO_ETAPA[etapa]}</p>
      <div className="rp-esqueleto rp-esqueleto-destaque" aria-hidden="true">
        <i className="rp-osso-tag" />
        <i className="rp-osso-nome" />
        <span className="rp-osso-linha"><i className="rp-osso-preco" /><i className="rp-osso-distancia" /></span>
        <i className="rp-osso-detalhe" />
        <i className="rp-osso-botao" />
      </div>
      <div className="rp-esqueleto rp-esqueleto-lista" aria-hidden="true">
        {[0, 1, 2].map((linha) => (
          <span key={linha} className="rp-osso-posto"><i /><span><i /><i /></span><i /></span>
        ))}
      </div>
    </div>
  );
}

function ListaPostos({ proximos, dias, onAbrir }: { proximos: PostoProximo[]; dias: number; onAbrir: (posto: PostoProximo) => void }) {
  const { melhor, outros } = separarMelhor(proximos);
  return (
    <>
      <section className="rp-hero rp-entrada" data-semaforo={melhor.cor}>
        <button type="button" className="rp-hero-abrir" onClick={() => onAbrir(melhor)}>
          <span className="rp-hero-tag">{rotuloMelhor(melhor.cor)}</span>
          <strong className="rp-hero-nome">{melhor.nome}</strong>
          <span className="rp-hero-linha">
            <span className="rp-hero-preco">{formatBRL(melhor.precoLitro)}<small>/L</small></span>
            <span className="rp-hero-distancia">{rotuloDistancia(melhor)}</span>
          </span>
          <span className="rp-hero-detalhe">{RECOMENDACAO[melhor.cor].rotulo} · {rotuloAbastecimentos(melhor.abastecimentos)} · último em {formatDiaMes(melhor.ultimoAbastecimento)}</span>
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
