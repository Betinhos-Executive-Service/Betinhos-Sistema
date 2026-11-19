import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { FormMenu } from "../../shared/ui/navigation/FormMenu";
import { BrandLoader } from "../../shared/ui/BrandLoader";
import { carregarNotaInfleet, faixaDaNota, oQueMelhorar, rotuloMes, type NotaInfleet } from "./notaInfleet";

type Props = { onBack: () => void; carregar?: () => Promise<NotaInfleet> };

const kmFmt = (km: number) => km.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const notaFmt = (nota: number) => String(Math.round(nota));

export function MinhaNotaScreen({ onBack, carregar = carregarNotaInfleet }: Props) {
  const [nota, setNota] = useState<NotaInfleet | null>(null);
  const [erro, setErro] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;

  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    try { setNota(await carregarRef.current()); } catch { setErro(true); } finally { setCarregando(false); }
  }, []);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const detalhes = nota && nota.situacao !== "sem_cadastro" ? nota : null;
  const melhorar = detalhes ? oQueMelhorar(detalhes.comportamentos) : [];
  const faixa = nota?.situacao === "ok" ? faixaDaNota(nota.nota) : null;

  return (
    <AppShell screenLabel="TelaMinhaNota">
      <FormMenu title="Minha nota" onBack={onBack} />
      <section className="main-panel ideas-main">
        <article className="finalize-card ideas-card">
          <div className="finalize-scroll">
            <div className="finalize-form ideas-form nota-tela" aria-busy={carregando}>
              {erro ? (
                <div className="ideas-feedback ideas-feedback--error" role="alert">
                  <span>Não foi possível carregar sua nota. Verifique a internet.</span>
                  <button type="button" onClick={() => void recarregar()}>Tentar de novo</button>
                </div>
              ) : carregando || !nota ? (
                <BrandLoader variant="inline" label="Carregando nota" text="Carregando sua nota" />
              ) : nota.situacao === "sem_cadastro" ? (
                <div className="ideas-empty"><strong>Seu cadastro ainda não está ligado à telemetria. Fale com a operação.</strong></div>
              ) : (
                <>
                  {nota.situacao === "ok" && faixa ? (
                    <section className={`nota-resumo nota-resumo--${faixa.tom}`} aria-label="Resumo da nota">
                      <strong className="nota-valor">{notaFmt(nota.nota)}</strong>
                      <span className="nota-selo">{faixa.rotulo}</span>
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
                          <li key={c.chave}><span>{c.rotulo}</span><strong>{notaFmt(c.nota)}</strong></li>
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
                              <span className={`nota-barra-fill nota-barra-fill--${faixaDaNota(c.nota).tom}`} style={{ width: `${Math.max(0, Math.min(100, c.nota))}%` }} />
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
                              <span className={`nota-coluna-fill nota-barra-fill--${faixaDaNota(m.nota).tom}`} style={{ height: `${Math.max(0, Math.min(100, m.nota))}%` }} />
                            </span>
                            <span className="nota-mes">{rotuloMes(m.ano, m.mes)}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </article>
      </section>
    </AppShell>
  );
}
