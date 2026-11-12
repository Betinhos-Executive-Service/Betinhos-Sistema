import { Crosshair, Info, MapPin, Minus, Navigation, Plus, ThumbsDown, ThumbsUp, X } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { customApiErrorMessage } from "../../data/dataverse/customApi";
import { enviarAvaliacao, rotuloRecomendacoes, type ResumoAvaliacoes } from "../despesas/avaliacaoPostos";
import { formatDiaMes } from "../despesas/gastosCartao";
import { PostoDetalheDialog } from "../despesas/PostoDetalheDialog";
import { distanciaKm, type ConviteAvaliacao, type Posicao } from "../despesas/rankingPostos";
import { reportAppError } from "../../shared/appErrorLogger";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { ServicesMenu } from "../../shared/ui/navigation/ServicesMenu";
import { descreverGpsErro } from "../termos/termosMulta";
import { PostosMapa, type Foco, type PostosMapaControle, type Vista } from "./PostosMapa";
import { PostosGaveta } from "./PostosGaveta";
import { juntarDados, juntarPosto, notaDoPosto, paraFicha, podeAvaliar, recomendados, rotuloBaseDoPreco, rotuloPrecoLitro, type DadosPorId, type DadosPosto, type PostoExibido, type Recomendado } from "./postosDados";
import { areaJaCarregada, ESPERA_BUSCA_MS, LIMITE_POSTOS, medidasGaveta, origemDasDistancias, rotuloKm, rotuloOrigem, rotuloSemConexao, tituloLista, urlGoogleMaps, urlWaze, zoomDoFoco, type Area, type PosicaoGaveta, type Posto } from "./postosProximos";
import { carregarCandidatosLista, carregarDadosPostos, carregarPostosDaArea, invalidarRanking, lerPosicaoDoMotorista } from "./remoto";

type Busca = "ok" | "carregando" | "erro";

/** Altura do cartão acima da gaveta: o pino tocado fica centralizado na parte livre do mapa. Com preço e recomendação o cartão cresce; com o convite de avaliar, mais ainda. */
const ALTURA_CARTAO = 120;
const ALTURA_CARTAO_COM_DADOS = 162;
const ALTURA_AVALIAR = 58;
/** O pino (42 px) mais a etiqueta (22 px) sobem a partir da ponta: a ponta fica abaixo do centro da área livre para a etiqueta não cortar no topo. */
const ALTURA_PINO_FOLGA = 60;
const FOLGA_CARTAO = 16;
const ZOOM_MINHA_POSICAO = 14;

/** Uma linha: preço, % que recomenda e o motivo da posição. Sem nenhum preço na lista (ranking falhou), nada: "Sem preço recente" em todos só faria ruído. */
function ItemMeta({ posto, comNota }: { posto: Recomendado<PostoExibido>; comNota: boolean }) {
  const dados = posto.dados;
  if (!dados) return comNota ? <span className="pp-item-meta"><span className="pp-motivo pp-motivo--neutro">{posto.motivo}</span></span> : null;
  const nota = notaDoPosto(dados.avaliacoes);
  const Polegar = nota?.alerta ? ThumbsDown : ThumbsUp;
  return (
    <span className="pp-item-meta" aria-label={`${rotuloPrecoLitro(dados.precoLitro)}${nota ? `, ${nota.texto} recomendam` : ""}. Nota ${posto.pontos} de 100: ${posto.motivo}`}>
      <span className="pp-preco" data-cor={dados.cor}><i aria-hidden="true" />{rotuloPrecoLitro(dados.precoLitro)}</span>
      {nota ? <span className="pp-nota" data-alerta={nota.alerta || undefined}><Polegar aria-hidden="true" />{nota.texto}</span> : null}
      <span className="pp-motivo">{posto.motivo}</span>
    </span>
  );
}

/** Convite do ranking: o motorista abasteceu aqui e ainda não avaliou. Reaproveita a gravação da tela Ranking (`enviarAvaliacao`, Custom API new_AvaliarPosto). */
function CartaoAvaliar({ postoId, dados, convite, onAvaliado }: { postoId: string; dados: DadosPosto; convite: ConviteAvaliacao | null; onAvaliado: (postoId: string, avaliacoes: ResumoAvaliacoes) => void }) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const minha = dados.avaliacoes.minha;
  if (minha) return <p className="pp-avaliar-feita" role="status">{minha.recomenda ? <ThumbsUp aria-hidden="true" /> : <ThumbsDown aria-hidden="true" />}Sua avaliação: {minha.recomenda ? "Recomendo" : "Não recomendo"}</p>;
  if (!convite || !podeAvaliar(convite, postoId, new Date())) return null;
  const avaliar = async (recomenda: boolean) => {
    setSalvando(true);
    setErro("");
    try {
      onAvaliado(postoId, await enviarAvaliacao(postoId, dados.avaliacoes, { recomenda, motivos: [], comentario: "" }));
    } catch (error) {
      reportAppError(error, { severity: "warning", source: "app", action: "avaliarPostoProximos", screen: "PostosProximos", notifyUser: false });
      setErro(customApiErrorMessage(error, "Não foi possível salvar. Tente de novo."));
    } finally {
      setSalvando(false);
    }
  };
  return (
    <div className="pp-avaliar">
      <strong id="pp-avaliar-pergunta">Abasteceu aqui em {formatDiaMes(convite.data)}. Recomenda?</strong>
      <div className="pp-avaliar-botoes" role="group" aria-labelledby="pp-avaliar-pergunta">
        <button type="button" data-tom="positivo" aria-label="Recomendo" disabled={salvando} onClick={() => void avaliar(true)}><ThumbsUp aria-hidden="true" />Sim</button>
        <button type="button" data-tom="negativo" aria-label="Não recomendo" disabled={salvando} onClick={() => void avaliar(false)}><ThumbsDown aria-hidden="true" />Não</button>
      </div>
      {erro ? <small className="pp-avaliar-erro" role="alert">{erro}</small> : null}
    </div>
  );
}

function CartaoDados({ dados }: { dados: DadosPosto }) {
  const nota = notaDoPosto(dados.avaliacoes);
  const Icone = nota?.alerta ? ThumbsDown : ThumbsUp;
  return (
    <div className="pp-cartao-dados">
      <div className="pp-cartao-linha">
        <span className="pp-cartao-preco" data-cor={dados.cor}>{rotuloPrecoLitro(dados.precoLitro)}</span>
        {nota ? <span className="pp-cartao-nota" data-alerta={nota.alerta || undefined}><Icone aria-hidden="true" />{rotuloRecomendacoes(dados.avaliacoes)}</span> : null}
      </div>
      <span className="pp-cartao-base">{rotuloBaseDoPreco(dados)}</span>
    </div>
  );
}

/** `motoristaId` separa os dados guardados no aparelho por motorista; vazio (ainda não carregou), nada é guardado nem lido do aparelho. */
export function PostosProximosScreen({ onBack, motoristaId }: { onBack: () => void; motoristaId: string }) {
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  const [aviso, setAviso] = useState("");
  const [vista, setVista] = useState<Vista | null>(null);
  const [postos, setPostos] = useState<Posto[]>([]);
  const [busca, setBusca] = useState<Busca>("carregando");
  // A lista tem busca própria, em volta da origem das distâncias: o mapa só mostra o que está na tela.
  const [proximos, setProximos] = useState<Posto[]>([]);
  const [buscaLista, setBuscaLista] = useState<Busca>("carregando");
  // Preço e recomendação vêm do ranking, carregado uma vez em paralelo com o mapa. Se falhar, a tela segue sem eles (como o convite de avaliação).
  const [dadosPorId, setDadosPorId] = useState<DadosPorId | null>(null);
  const [convite, setConvite] = useState<ConviteAvaliacao | null>(null);
  // Quando os dados vieram do aparelho por falta de sinal: instante em que foram guardados, por origem (área, lista, ranking).
  const [desde, setDesde] = useState<{ area: number | null; lista: number | null; ranking: number | null }>({ area: null, lista: null, ranking: null });
  const [gavetaPosicao, setGavetaPosicao] = useState<PosicaoGaveta>("meio");
  const [alturaPalco, setAlturaPalco] = useState(0);
  const [selecionado, setSelecionado] = useState<Posto | null>(null);
  // O cartão fica montado para animar a saída: guarda o último posto aberto enquanto fecha.
  const [cartaoPosto, setCartaoPosto] = useState<Posto | null>(null);
  const [listaEntrou, setListaEntrou] = useState(false);
  // Ficha do posto (histórico, avaliações e o Recomendo do motorista), herdada da antiga lista do Relatório de gastos.
  const [fichaAberta, setFichaAberta] = useState(false);
  // Avaliação feita aqui vale na hora, também para posto sem preço no ranking (que não está em dadosPorId).
  const [avaliacoesLocais, setAvaliacoesLocais] = useState<ReadonlyMap<string, ResumoAvaliacoes>>(new Map());
  const [foco, setFoco] = useState<Foco | null>(null);
  const moveuSozinho = useRef(false);
  const pedido = useRef(0);
  const pedidoLista = useRef(0);
  const ultimaCarga = useRef<{ area: Area; cheia: boolean } | null>(null);
  const chaveFoco = useRef(0);
  const primeiraBusca = useRef(true);
  const palco = useRef<HTMLDivElement | null>(null);
  const controle = useRef<PostosMapaControle | null>(null);

  const irPara = useCallback((lat: number, lon: number, zoom?: number, deslocamentoY?: number) => { chaveFoco.current += 1; setFoco({ lat, lon, zoom, deslocamentoY, chave: chaveFoco.current }); }, []);

  const localizar = useCallback(() => {
    setAviso("");
    lerPosicaoDoMotorista().then((atual) => {
      setPosicao(atual);
      // Quem já arrastou o mapa não perde o lugar quando o GPS responde tarde.
      if (!moveuSozinho.current) irPara(atual.lat, atual.lon, ZOOM_MINHA_POSICAO);
    }, (erro) => {
      setPosicao(null);
      setAviso(`${descreverGpsErro(erro as { code?: number } | null).split(".")[0]}. Mostrando São José dos Campos.`);
    });
  }, [irPara]);
  useEffect(() => { localizar(); }, [localizar]);

  const buscarRanking = useCallback(() => carregarDadosPostos(motoristaId).then(({ dados, desde: quando }) => {
    setDadosPorId(dados.dados);
    setConvite(dados.convite);
    setDesde((atual) => ({ ...atual, ranking: quando }));
  }, (erro) => {
    reportAppError(erro, { severity: "warning", source: "app", action: "carregarRankingPostosProximos", screen: "PostosProximos", notifyUser: false });
  }), [motoristaId]);
  useEffect(() => { void buscarRanking(); }, [buscarRanking]);

  const buscar = useCallback(async (atual: Vista) => {
    const id = ++pedido.current;
    setBusca("carregando");
    try {
      const { dados: lista, desde: quando } = await carregarPostosDaArea(motoristaId, atual.area);
      if (id !== pedido.current) return;
      // Do aparelho, a cópia não corresponde a esta área: nada de "já carregada", a próxima busca tenta a rede de novo.
      ultimaCarga.current = quando === null ? { area: atual.area, cheia: lista.length >= LIMITE_POSTOS } : null;
      setPostos(lista);
      setDesde((anterior) => ({ ...anterior, area: quando }));
      setBusca("ok");
    } catch (erro) {
      if (id !== pedido.current) return;
      reportAppError(erro, { severity: "warning", source: "app", action: "carregarPostosProximos", screen: "PostosProximos", notifyUser: false });
      ultimaCarga.current = null;
      setBusca("erro");
    }
  }, [motoristaId]);

  useEffect(() => {
    if (!vista) return;
    // Movimento do próprio app (centralizar um posto) cai numa área já carregada: não busca de novo.
    if (ultimaCarga.current && areaJaCarregada(vista.area, ultimaCarga.current)) return;
    const espera = primeiraBusca.current ? 0 : ESPERA_BUSCA_MS;
    primeiraBusca.current = false;
    const relogio = window.setTimeout(() => { void buscar(vista); }, espera);
    return () => window.clearTimeout(relogio);
  }, [vista, buscar]);

  // Distância sempre do motorista (ou do centro padrão sem GPS); a lista busca em caixas crescentes em volta dessa origem.
  const origem = useMemo(() => origemDasDistancias(posicao), [posicao]);

  const buscarLista = useCallback(async (ponto: Posicao) => {
    const id = ++pedidoLista.current;
    setBuscaLista("carregando");
    try {
      const { dados: lista, desde: quando } = await carregarCandidatosLista(motoristaId, ponto);
      if (id !== pedidoLista.current) return;
      setProximos(lista);
      setDesde((anterior) => ({ ...anterior, lista: quando }));
      setBuscaLista("ok");
    } catch (erro) {
      if (id !== pedidoLista.current) return;
      reportAppError(erro, { severity: "warning", source: "app", action: "carregarMaisProximosPostos", screen: "PostosProximos", notifyUser: false });
      setBuscaLista("erro");
    }
  }, [motoristaId]);
  useEffect(() => { void buscarLista(origem.ponto); }, [buscarLista, origem]);

  // O posto aberto (vindo da lista) sempre ganha pino, mesmo fora dos 200 da área do mapa.
  const exibidos = useMemo(() => juntarDados(selecionado && !postos.some((posto) => posto.id === selecionado.id) ? [...postos, selecionado] : postos, dadosPorId), [postos, selecionado, dadosPorId]);
  // Ordem por nota (preço, recomendação, distância); sem nenhum preço a ordem é só a distância e o título diz "Mais próximos".
  const lista = useMemo(() => recomendados(juntarDados(proximos, dadosPorId).map((posto) => ({ ...posto, distanciaKm: distanciaKm(origem.ponto, posto) }))), [proximos, dadosPorId, origem]);
  const comNota = lista.some((posto) => posto.pontos !== null);
  const cartao = cartaoPosto ? juntarPosto(cartaoPosto, dadosPorId) : null;

  // Palco = área do mapa e da gaveta; a gaveta se mede por ele.
  useEffect(() => {
    const el = palco.current;
    if (!el) return;
    const medir = () => setAlturaPalco(el.clientHeight);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
  const gaveta = useMemo(() => medidasGaveta(alturaPalco), [alturaPalco]);

  const semConexaoDesde = [desde.area, desde.lista, desde.ranking].filter((valor): valor is number => valor !== null);
  const avisoSemConexao = semConexaoDesde.length ? rotuloSemConexao(Math.min(...semConexaoDesde)) : "";

  // Nota nova do posto avaliado, sem recarregar o ranking (que a próxima abertura relê).
  const aoAvaliar = useCallback((postoId: string, avaliacoes: ResumoAvaliacoes) => {
    setAvaliacoesLocais((atual) => new Map(atual).set(postoId, avaliacoes));
    setDadosPorId((atual) => {
      const dados = atual?.get(postoId);
      return atual && dados ? new Map(atual).set(postoId, { ...dados, avaliacoes }) : atual;
    });
    invalidarRanking();
  }, []);

  // Centraliza o posto sem aproximar: mantém o zoom atual (no máximo 15) e deixa o pino acima do cartão e da gaveta.
  // Gaveta aberta recolhe para o meio (o mapa precisa aparecer); recolhida fica como está.
  const selecionar = useCallback((posto: Posto) => {
    const destino: PosicaoGaveta = gavetaPosicao === "aberta" ? "meio" : gavetaPosicao;
    setGavetaPosicao(destino);
    setSelecionado(posto);
    setCartaoPosto(posto);
    const dados = dadosPorId?.get(posto.id);
    const cartaoAltura = (dados ? ALTURA_CARTAO_COM_DADOS : ALTURA_CARTAO) + (dados && podeAvaliar(convite, posto.id, new Date()) && !dados.avaliacoes.minha ? ALTURA_AVALIAR : 0);
    irPara(posto.lat, posto.lon, zoomDoFoco(vista?.zoom ?? ZOOM_MINHA_POSICAO), gaveta.visivel[destino] + cartaoAltura + FOLGA_CARTAO - ALTURA_PINO_FOLGA);
  }, [irPara, vista?.zoom, dadosPorId, convite, gavetaPosicao, gaveta]);

  // Escalonamento da lista só na primeira carga; depois de ~700 ms a classe sai e movimentos do mapa não animam.
  useEffect(() => {
    if (!lista.length || listaEntrou) return;
    const relogio = window.setTimeout(() => setListaEntrou(true), 700);
    return () => window.clearTimeout(relogio);
  }, [lista.length, listaEntrou]);

  const distanciaCartao = cartao ? `a ${rotuloKm(distanciaKm(origem.ponto, cartao))} ${rotuloOrigem(origem)}` : "";

  return (
    <AppShell screenLabel="PostosProximos">
      <ServicesMenu title="Postos próximos" eyebrow="Combustível" homeLabel="Voltar" homeIcon="arrowLeft" onHome={onBack} onRefresh={async () => { invalidarRanking(); await Promise.all([vista ? buscar(vista) : undefined, buscarLista(origem.ponto), buscarRanking()]); }} />
      <section className="pp-screen" aria-label="Postos próximos" onKeyDown={(evento) => { if (evento.key === "Escape") setSelecionado(null); }}>
        <div ref={palco} className="pp-palco">
          <div className="pp-mapa-caixa">
            <PostosMapa ref={controle} postos={exibidos} posicao={posicao} selecionadoId={selecionado?.id ?? ""} foco={foco} onVista={setVista} onMoveuSozinho={() => { moveuSozinho.current = true; }} onSelecionar={selecionar} onDesselecionar={() => setSelecionado(null)} />
            <div className="pp-controles">
              <div className="pp-zoom">
                <button type="button" className="pp-botao" aria-label="Aproximar" onClick={() => controle.current?.aproximar()}><Plus aria-hidden="true" /></button>
                <button type="button" className="pp-botao" aria-label="Afastar" onClick={() => controle.current?.afastar()}><Minus aria-hidden="true" /></button>
              </div>
              {posicao ? <button type="button" className="pp-botao pp-botao--solto pp-botao--destaque" aria-label="Minha posição" onClick={() => irPara(posicao.lat, posicao.lon, ZOOM_MINHA_POSICAO)}><Crosshair aria-hidden="true" /></button> : null}
            </div>
          </div>
          <div className="pp-avisos">
            {busca === "carregando" ? <span className="pp-status" role="status"><i aria-hidden="true" />Buscando postos…</span> : null}
            {busca === "ok" && postos.length >= LIMITE_POSTOS ? <span className="pp-status pp-status--limite" role="status">Mostrando {LIMITE_POSTOS} postos desta área</span> : null}
            {avisoSemConexao ? <div className="termo-alert pp-aviso" data-tone="atencao" role="status"><p>{avisoSemConexao}</p><button type="button" className="termo-text-button pp-acao" onClick={() => { if (vista) void buscar(vista); void buscarLista(origem.ponto); void buscarRanking(); }}>Tentar de novo</button></div> : null}
            {aviso ? <div className="termo-alert pp-aviso" data-tone="atencao" role="status"><p>{aviso}</p><button type="button" className="termo-text-button pp-acao" onClick={localizar}>Tentar de novo</button></div> : null}
            {busca === "erro" ? <div className="termo-alert pp-aviso" data-tone="erro" role="alert"><p>Não foi possível carregar os postos.</p><button type="button" className="termo-text-button pp-acao" onClick={() => { if (vista) void buscar(vista); }}>Tentar de novo</button></div> : null}
            {buscaLista === "erro" ? <div className="termo-alert pp-aviso" data-tone="erro" role="alert"><p>Não foi possível carregar os postos mais próximos.</p><button type="button" className="termo-text-button pp-acao" onClick={() => { void buscarLista(origem.ponto); }}>Tentar de novo</button></div> : null}
          </div>
          <PostosGaveta
            gaveta={gaveta} posicao={gavetaPosicao} onPosicao={setGavetaPosicao}
            titulo={tituloLista(origem, comNota)} contagem={lista.length ? `${lista.length} ${lista.length === 1 ? "posto" : "postos"}` : ""}
            acima={(
              <article className={`pp-cartao${selecionado ? " is-aberto" : ""}`} aria-label={cartao ? `Posto ${cartao.nome}` : "Posto"} aria-hidden={selecionado ? undefined : true}>
                {cartao ? (
                  <>
                    <button type="button" className="pp-cartao-fechar" aria-label="Fechar" tabIndex={selecionado ? 0 : -1} onClick={() => setSelecionado(null)}><X aria-hidden="true" /></button>
                    <strong className="pp-cartao-nome">{cartao.nome}</strong>
                    {cartao.dados ? <CartaoDados dados={cartao.dados} /> : null}
                    <p className="pp-cartao-onde"><span className="pp-cartao-distancia">{distanciaCartao}</span>{cartao.endereco ? <> · {cartao.endereco}</> : null}</p>
                    {cartao.dados ? <CartaoAvaliar key={cartao.id} postoId={cartao.id} dados={cartao.dados} convite={convite} onAvaliado={aoAvaliar} /> : null}
                    <div className="pp-cartao-acoes">
                      <a className="pp-ir pp-ir--primario" href={urlGoogleMaps(cartao)} target="_blank" rel="noreferrer"><Navigation aria-hidden="true" />Ir</a>
                      <a className="pp-ir" href={urlWaze(cartao)} target="_blank" rel="noreferrer">Waze</a>
                      <button type="button" className="pp-ir pp-ficha" aria-label="Detalhes e avaliação do posto" tabIndex={selecionado ? 0 : -1} onClick={() => setFichaAberta(true)}><Info aria-hidden="true" />Detalhes</button>
                    </div>
                  </>
                ) : null}
              </article>
            )}
          >
            <div aria-busy={buscaLista === "carregando"}>
              {lista.length ? (
                <ul className={`pp-lista${listaEntrou ? "" : " pp-lista--entrada"}`}>
                  {lista.map((posto, indice) => (
                    <li key={posto.id} style={listaEntrou ? undefined : ({ "--pp-i": Math.min(indice, 8) } as CSSProperties)}>
                      <button type="button" className="pp-item" data-ativo={posto.id === selecionado?.id || undefined} onClick={() => selecionar(posto)}>
                        <strong className="pp-item-nome">{posto.nome}</strong>
                        <span className="pp-item-km">{rotuloKm(posto.distanciaKm)}</span>
                        <ItemMeta posto={posto} comNota={comNota} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : buscaLista === "carregando" ? (
                <ul className="pp-lista" aria-hidden="true">{[0, 1, 2].map((n) => <li key={n} className="pp-item pp-item--esqueleto"><span /><span /></li>)}</ul>
              ) : buscaLista === "erro" ? null : (
                <p className="termo-empty"><MapPin aria-hidden="true" /> Nenhum posto da rede CTF encontrado num raio de 30 km.</p>
              )}
              <p className="gr-legenda">Postos da rede CTF (cartão de combustível).</p>
            </div>
          </PostosGaveta>
        </div>
      </section>
      {fichaAberta && cartao ? <PostoDetalheDialog posto={paraFicha(cartao, distanciaKm(origem.ponto, cartao), avaliacoesLocais.get(cartao.id))} dias={cartao.dados?.dias ?? 30} onAvaliado={aoAvaliar} onClose={() => setFichaAberta(false)} /> : null}
    </AppShell>
  );
}
