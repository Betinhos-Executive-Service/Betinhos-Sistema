import type { CSSProperties } from "react";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { FormMenu } from "../../shared/ui/navigation/FormMenu";
import { BrandLoader } from "../../shared/ui/BrandLoader";
import { DICAS, atualizadaEm, faixaDaNota, notaFmt, oQueMelhorar, proximaFaixa, rotuloMes, variacaoMensal } from "./notaInfleet";
import { useNotaInfleet } from "./useNotaInfleet";

type Props = { onBack: () => void };

const kmFmt = (km: number) => km.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const percentual = (nota: number) => `${Math.max(0, Math.min(100, nota))}%`;
const pontos = (n: number) => `${n} ponto${n === 1 ? "" : "s"}`;

export function MinhaNotaScreen({ onBack }: Props) {
  const { nota, carregando, erro, recarregar } = useNotaInfleet();

  const melhorar = nota && nota.situacao !== "sem_cadastro" ? oQueMelhorar(nota.comportamentos) : [];
  const ok = nota?.situacao === "ok" ? nota : null;
  const faixa = ok ? faixaDaNota(ok.nota) : null;
  const proxima = ok ? proximaFaixa(ok.nota) : null;
  const variacao = ok ? variacaoMensal(ok.meses) : null;

  return (
    <AppShell screenLabel="TelaMinhaNota">
      <FormMenu title="Minha nota" onBack={onBack} />
      <section className="main-panel ideas-main">
        <article className="finalize-card ideas-card">
          <div className="finalize-scroll">
            <div className="finalize-form ideas-form nota-tela" aria-busy={carregando}>
              {erro && !nota ? (
                <div className="ideas-feedback ideas-feedback--error" role="alert">
                  <span>Não foi possível carregar sua nota. Verifique a internet.</span>
                  <button type="button" onClick={() => void recarregar()}>Tentar de novo</button>
                </div>
              ) : !nota ? (
                <BrandLoader variant="inline" label="Carregando nota" text="Carregando sua nota" />
              ) : nota.situacao === "sem_cadastro" ? (
                <div className="ideas-empty"><strong>Seu cadastro ainda não está ligado à telemetria. Fale com a operação.</strong></div>
              ) : (
                <>
                  {ok && faixa ? (
                    <section className={`nota-resumo nota-tom--${faixa.tom}`} aria-label="Resumo da nota">
                      <div className="nota-anel" style={{ "--nota": percentual(ok.nota) } as CSSProperties}>
                        <strong className="nota-valor">{notaFmt(ok.nota)}</strong>
                        <span className="nota-de">de 100</span>
                      </div>
                      <span className="nota-selo">{faixa.rotulo}</span>
                      <span className="nota-proxima">{proxima ? `${proxima.faltam === 1 ? "Falta" : "Faltam"} ${pontos(proxima.faltam)} para ${proxima.rotulo}` : "Continue assim"}</span>
                      {variacao ? (
                        <span className={`nota-variacao${variacao.pontos > 0 ? " nota-variacao--sobe" : variacao.pontos < 0 ? " nota-variacao--cai" : ""}`}>
                          {variacao.pontos > 0 ? `↑ Subiu ${pontos(variacao.pontos)}` : variacao.pontos < 0 ? `↓ Caiu ${pontos(-variacao.pontos)}` : "Igual"} em relação a {rotuloMes(variacao.mesAnterior.ano, variacao.mesAnterior.mes)}
                        </span>
                      ) : null}
                      <span className="nota-periodo">Últimos 90 dias · {kmFmt(ok.km)} km</span>
                      {ok.sincronizadoEm && <span className="nota-atualizada">{atualizadaEm(ok.sincronizadoEm)}</span>}
                    </section>
                  ) : (
                    <section className="nota-resumo" aria-label="Nota em formação">
                      <strong className="nota-formacao-titulo">Sua nota está em formação: precisa de pelo menos 50 km nos últimos 90 dias</strong>
                      <span className="nota-periodo">Você rodou {kmFmt(nota.km)} km até agora</span>
                      {nota.sincronizadoEm && <span className="nota-atualizada">{atualizadaEm(nota.sincronizadoEm)}</span>}
                    </section>
                  )}

                  {melhorar.length ? (
                    <section className="nota-bloco" aria-label="O que melhorar">
                      <h3>O que melhorar</h3>
                      <ul className="nota-melhorar">
                        {melhorar.map((c) => (
                          <li key={c.chave} className={`nota-tom--${faixaDaNota(c.nota).tom}`}>
                            <div className="nota-linha"><span>{c.rotulo}</span><strong>{notaFmt(c.nota)}</strong></div>
                            {DICAS[c.chave] ? <small>{DICAS[c.chave]}</small> : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {nota.comportamentos.length ? (
                    <section className="nota-bloco" aria-label="Notas por comportamento">
                      <h3>Por comportamento</h3>
                      <ul className="nota-comportamentos">
                        {nota.comportamentos.map((c) => (
                          <li key={c.chave}>
                            <div className="nota-linha"><span>{c.rotulo}</span><strong>{notaFmt(c.nota)}</strong></div>
                            <div className="nota-barra" role="img" aria-label={`${c.rotulo}: ${notaFmt(c.nota)} de 100`}>
                              <span className={`nota-barra-fill nota-tom--${faixaDaNota(c.nota).tom}`} style={{ width: percentual(c.nota) }} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {nota.meses.length ? (
                    <section className="nota-bloco" aria-label="Evolução">
                      <h3>Evolução</h3>
                      <ul className="nota-evolucao">
                        {nota.meses.map((m) => (
                          <li key={`${m.ano}-${m.mes}`}>
                            <strong>{notaFmt(m.nota)}</strong>
                            <span className="nota-coluna" role="img" aria-label={`${rotuloMes(m.ano, m.mes)}: ${notaFmt(m.nota)} de 100`}>
                              <span className={`nota-coluna-fill nota-tom--${faixaDaNota(m.nota).tom}`} style={{ height: percentual(m.nota) }} />
                            </span>
                            <span className="nota-mes">{rotuloMes(m.ano, m.mes)}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  <p className="nota-como">A nota vai de 0 a 100 e vem da telemetria do carro (Infleet): quanto menos frenagens, curvas e acelerações bruscas, maior. 90 ou mais é Ótima, de 75 a 89 é Boa, abaixo de 75 pede atenção.</p>
                </>
              )}
            </div>
          </div>
        </article>
      </section>
    </AppShell>
  );
}
