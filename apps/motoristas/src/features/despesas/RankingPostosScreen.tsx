import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { ServicesMenu } from "../../shared/ui/navigation/ServicesMenu";
import { reportAppError } from "../../shared/appErrorLogger";
import { formatDiaMes, isMockGastosCartao } from "./gastosCartao";
import { formatBRL, type Semaforo } from "./gastosRelatorio";
import { RAIO_KM, carregarRankingPostos, obterPosicao, postosProximos, rotuloAbastecimentos, rotuloDistancia, type Posicao, type RankingPostos } from "./rankingPostos";
import { descreverGpsErro } from "../termos/termosMulta";

type Carga =
  | { status: "loading" }
  | { status: "error" }
  | { status: "semGps"; mensagem: string }
  | { status: "ready"; ranking: RankingPostos; origem: Posicao };

const RECOMENDACAO: Record<Semaforo, { rotulo: string; tom: string }> = {
  verde: { rotulo: "Recomendado", tom: "sucesso" },
  amarelo: { rotulo: "Atenção", tom: "atencao" },
  vermelho: { rotulo: "Evitar", tom: "erro" }
};

export function RankingPostosScreen({ onBack }: { onBack: () => void }) {
  const [carga, setCarga] = useState<Carga>({ status: "loading" });
  const carregar = useCallback(async () => {
    setCarga({ status: "loading" });
    const [posicao, dados] = await Promise.allSettled([obterPosicao(), carregarRankingPostos()]);
    if (dados.status === "rejected") reportAppError(dados.reason, { severity: "warning", source: "app", action: "carregarRankingPostos", screen: "RankingPostos", notifyUser: false });
    if (posicao.status === "rejected") {
      setCarga({ status: "semGps", mensagem: descreverGpsErro(posicao.reason as { code?: number } | null) });
    } else if (dados.status === "rejected") {
      setCarga({ status: "error" });
    } else {
      setCarga({ status: "ready", ranking: dados.value, origem: posicao.value });
    }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

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
          <div className="gr-skeleton" role="status" aria-busy="true" aria-label="Procurando postos perto de você"><span /><span /><span /></div>
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
            <p className="gr-legenda">Média paga pela frota nos últimos {carga.ranking.dias} dias, a até {RAIO_KM} km de você. É um preço pago, não o preço de hoje.</p>
            <section className="gr-bloco">
              <ol className="gr-lista rp-lista">
                {proximos.map((posto, indice) => (
                  <li key={`${posto.nome}-${indice}`} className="rp-posto">
                    <div className="gr-linha-main">
                      <strong>{posto.nome}</strong>
                      <span>{rotuloDistancia(posto)}</span>
                      <small>{rotuloAbastecimentos(posto.abastecimentos)} · último em {formatDiaMes(posto.ultimoAbastecimento)}</small>
                    </div>
                    <div className="gr-linha-side">
                      <strong>{formatBRL(posto.precoLitro)}</strong>
                      <span className="termo-badge" data-tone={RECOMENDACAO[posto.cor].tom}>{RECOMENDACAO[posto.cor].rotulo}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </section>
    </AppShell>
  );
}
