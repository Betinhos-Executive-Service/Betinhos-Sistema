import type { CSSProperties } from "react";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { FormMenu } from "../../shared/ui/navigation/FormMenu";
import { BrandLoader } from "../../shared/ui/BrandLoader";
import { DICAS, carregarNotaInfleet, faixaDaNota, oQueMelhorar, proximaFaixa, rotuloMes, variacaoMensal, type NotaInfleet } from "./notaInfleet";
import { useNotaInfleet } from "./useNotaInfleet";

type Props = { onBack: () => void; carregar?: () => Promise<NotaInfleet> };

const kmFmt = (km: number) => km.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const notaFmt = (nota: number) => String(Math.round(nota));
const percentual = (nota: number) => `${Math.max(0, Math.min(100, nota))}%`;
const pontos = (n: number) => `${n} ponto${n === 1 ? "" : "s"}`;

export function MinhaNotaScreen({ onBack, carregar = carregarNotaInfleet }: Props) {
  const { nota, carregando, erro, recarregar } = useNotaInfleet(carregar);

  const detalhes = nota && nota.situacao !== "sem_cadastro" ? nota : null;
  const melhorar = detalhes ? oQueMelhorar(detalhes.comportamentos) : [];
  const faixa = nota?.situacao === "ok" ? faixaDaNota(nota.nota) : null;
  const proxima = nota?.situacao === "ok" ? proximaFaixa(nota.nota) : null;
  const variacao = nota?.situacao === "ok" ? variacaoMensal(nota.meses) : null;

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
                  {nota.situacao === "ok" && faixa ? (
                    <section className={`nota-resumo nota-resumo--${faixa.tom}`} aria-label="Resumo da nota">
                      <div className="nota-anel" style={{ "--nota": percentual(nota.nota) } as CSSProperties}>
                        <strong className="nota-valor">{notaFmt(nota.nota)}</strong>
                        <span className="nota-de">de 100</span>
                      </div>
                      <span className="nota-selo">{faixa.rotulo}</span>
                      <span className="nota-proxima">{proxima ? `Faltam ${pontos(proxima.faltam)} para ${proxima.rotulo}` : "Continue assim"}</span>
                      {variacao ? (
                        <span className={`nota-variacao nota-variacao--${variacao.pontos > 0 ? "sobe" : variacao.pontos < 0 ? "cai" : "igual"}`}>
                          {variacao.pontos > 0 ? `↑ Subiu ${pontos(variacao.pontos)}` : variacao.pontos < 0 ? `↓ Caiu ${pontos(-variacao.pontos)}` : "Igual"} em relação a {rotuloMes(variacao.mesAnterior.ano, variacao.mesAnterior.mes)}
                        </span>
                      ) : null}
                      <span className="nota-periodo">Últimos 90 dias · {kmFmt(nota.km)} km</span>
                    </section>
                  ) : (
                    <section className="nota-resumo nota-resumo--formacao" aria-label="Nota em formação">
                      <strong className="nota-formacao-titulo">Sua nota está em formação: precisa de pelo menos 50 km nos últimos 90 dias</strong>
                      <span className="nota-periodo">Você rodou {kmFmt(nota.km)} km até agora</span>
                    </section>
                  )}

                  {melhorar.length ? (
                    <section className="nota-bloco" aria-label="O que melhorar">
                      <h3>O que melhorar</h3>
                      <ul className="nota-melhorar">
                        {melhorar.map((c) => (
                          <li key={c.chave}>
                            <div className="nota-linha"><span>{c.rotulo}</span><strong>{notaFmt(c.nota)}</strong></div>
                            {DICAS[c.chave] ? <small>{DICAS[c.chave]}</small> : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {detalhes && detalhes.comportamentos.length ? (
                    <section className="nota-bloco" aria-label="Notas por comportamento">
                      <h3>Por comportamento</h3>
                      <ul className="nota-comportamentos">
                        {detalhes.comportamentos.map((c) => (
                          <li key={c.chave}>
                            <div className="nota-linha"><span>{c.rotulo}</span><strong>{notaFmt(c.nota)}</strong></div>
                            <div className="nota-barra" role="img" aria-label={`${c.rotulo}: ${notaFmt(c.nota)} de 100`}>
                              <span className={`nota-barra-fill nota-barra-fill--${faixaDaNota(c.nota).tom}`} style={{ width: percentual(c.nota) }} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {detalhes && detalhes.meses.length ? (
                    <section className="nota-bloco" aria-label="Evolução">
                      <h3>Evolução</h3>
                      <ul className="nota-evolucao">
                        {detalhes.meses.map((m) => (
                          <li key={`${m.ano}-${m.mes}`}>
                            <strong>{notaFmt(m.nota)}</strong>
                            <span className="nota-coluna" role="img" aria-label={`${rotuloMes(m.ano, m.mes)}: ${notaFmt(m.nota)} de 100`}>
                              <span className={`nota-coluna-fill nota-barra-fill--${faixaDaNota(m.nota).tom}`} style={{ height: percentual(m.nota) }} />
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
