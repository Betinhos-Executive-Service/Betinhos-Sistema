import { MapPin } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { PostoDetalheDialog } from "./PostoDetalheDialog";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { ServicesMenu } from "../../shared/ui/navigation/ServicesMenu";
import { reportAppError } from "../../shared/appErrorLogger";
import { rotuloRecomendacoes, type ResumoAvaliacoes } from "./avaliacaoPostos";
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
            {carga.atualizando ? <p className="rp-carregando-texto" role="status">Atualizando postos…</p> : null}
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

const ARCO_MARCADOR = "M24 118 A86 86 0 0 1 196 118";
const MARCAS_PAINEL = Array.from({ length: 17 }, (_, indice) => {
  const angulo = ((indice * 11.25 - 90) * Math.PI) / 180;
  const maior = indice % 4 === 0;
  const ponto = (raio: number) => ({ x: 110 + raio * Math.sin(angulo), y: 118 - raio * Math.cos(angulo) });
  return { maior, inicio: ponto(74), fim: ponto(maior ? 64 : 68) };
});

function ListaCarregando({ etapa }: { etapa: Etapa }) {
  return (
    <div className="rp-loader" role="status">
      <svg className="rp-painel" viewBox="0 0 220 172" aria-hidden="true">
        <defs>
          <linearGradient id="rp-vidro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0b2d5e" /><stop offset="1" stopColor="#001a3d" /></linearGradient>
          <linearGradient id="rp-faixa" x1="24" y1="0" x2="196" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#ef4444" /><stop offset="0.5" stopColor="#ffb300" /><stop offset="1" stopColor="#2fbf71" /></linearGradient>
        </defs>
        <rect x="3" y="3" width="214" height="166" rx="28" fill="url(#rp-vidro)" stroke="#cbd5e1" strokeWidth="2" />
        <path className="rp-painel-trilho" d={ARCO_MARCADOR} />
        <path className="rp-painel-nivel" d={ARCO_MARCADOR} pathLength={100} />
        {MARCAS_PAINEL.map(({ maior, inicio, fim }, indice) => (
          <line key={indice} className={maior ? "rp-painel-marca rp-painel-marca--maior" : "rp-painel-marca"} x1={inicio.x} y1={inicio.y} x2={fim.x} y2={fim.y} />
        ))}
        <text x="24" y="141">E</text>
        <text x="110" y="82">½</text>
        <text x="196" y="141">F</text>
        <path className="rp-painel-bomba" transform="translate(98 132)" d="M3 22h12M4 9h10M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5" />
        <path className="rp-painel-ponteiro" d="M106.500 118 L110 44 L113.500 118 Z" />
        <circle className="rp-painel-eixo" cx="110" cy="118" r="10" />
        <circle className="rp-painel-centro" cx="110" cy="118" r="3.500" />
      </svg>
      <p key={etapa} className="rp-loader-texto">{TEXTO_ETAPA[etapa]}</p>
      <ol className="rp-etapas">
        <li data-estado={etapa === "localizacao" ? "ativa" : "feita"}><i aria-hidden="true" />Localização</li>
        <li data-estado={etapa === "postos" ? "ativa" : "pendente"}><i aria-hidden="true" />Postos</li>
      </ol>
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
          {melhor.avaliacoes.total ? <span className="rp-hero-avaliacao">{rotuloRecomendacoes(melhor.avaliacoes)}</span> : null}
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
                    {posto.avaliacoes.total ? <span className="rp-posto-avaliacao">{rotuloRecomendacoes(posto.avaliacoes)}</span> : null}
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
