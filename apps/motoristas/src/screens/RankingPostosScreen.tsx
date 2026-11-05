import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { ServicesMenu } from "../components/navigation/ServicesMenu";
import { reportAppError } from "../lib/appErrorLogger";
import { formatDiaMes, isMockGastosCartao } from "../lib/gastosCartao";
import { formatBRL } from "../lib/gastosRelatorio";
import { carregarRankingPostos, ehMenorPreco, rotuloAbastecimentos, type RankingPostos } from "../lib/rankingPostos";

type Carga = { status: "loading" } | { status: "error" } | { status: "ready"; ranking: RankingPostos };

export function RankingPostosScreen({ onBack }: { onBack: () => void }) {
  const [carga, setCarga] = useState<Carga>({ status: "loading" });
  const carregar = useCallback(() => {
    setCarga({ status: "loading" });
    return carregarRankingPostos().then(
      (ranking) => setCarga({ status: "ready", ranking }),
      (error) => {
        setCarga({ status: "error" });
        reportAppError(error, { severity: "warning", source: "app", action: "carregarRankingPostos", screen: "RankingPostos", notifyUser: false });
      }
    );
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <AppShell screenLabel="RankingPostos">
      <ServicesMenu
        title="Preço dos postos"
        eyebrow={isMockGastosCartao() ? "Financeiro · Mock local" : "Financeiro"}
        homeLabel="Voltar"
        homeIcon="arrowLeft"
        onHome={onBack}
        onRefresh={carregar}
      />
      <section className="termo-screen gr-screen" aria-label="Preço dos postos por cidade">
        {carga.status === "loading" ? (
          <div className="gr-skeleton" role="status" aria-busy="true" aria-label="Carregando preço dos postos"><span /><span /><span /></div>
        ) : carga.status === "error" ? (
          <div className="termo-alert" data-tone="erro" role="alert">
            <p>Não foi possível carregar o preço dos postos.</p>
            <button type="button" className="termo-text-button" onClick={carregar}>Tentar de novo</button>
          </div>
        ) : carga.ranking.cidades.length === 0 ? (
          <p className="termo-empty">Ainda não há preços de postos nos últimos {carga.ranking.dias} dias.</p>
        ) : (
          <>
            <p className="gr-legenda">Média do que a frota pagou por litro nos últimos {carga.ranking.dias} dias. É um preço pago, não o preço de hoje.</p>
            {carga.ranking.cidades.map((cidade) => (
              <section key={cidade.cidade} className="gr-bloco" aria-label={cidade.cidade}>
                <h2 className="rp-cidade">{cidade.cidade}</h2>
                <ol className="gr-lista rp-lista">
                  {cidade.postos.map((posto, indice) => (
                    <li key={`${posto.nome}-${indice}`} className="rp-posto">
                      <div className="gr-linha-main">
                        <strong>{posto.nome}</strong>
                        <span>{rotuloAbastecimentos(posto.abastecimentos)} · último em {formatDiaMes(posto.ultimoAbastecimento)}</span>
                      </div>
                      <div className="gr-linha-side">
                        <strong>{formatBRL(posto.precoLitro)}</strong>
                        {ehMenorPreco(cidade, posto) ? <span className="termo-badge" data-tone="sucesso">Menor preço</span> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </>
        )}
      </section>
    </AppShell>
  );
}
