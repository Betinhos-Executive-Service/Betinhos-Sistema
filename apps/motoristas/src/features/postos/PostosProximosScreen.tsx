import { Crosshair, Fuel, MapPin, Minus, Navigation, Plus, ThumbsDown, ThumbsUp, X } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { customApiErrorMessage } from "../../data/dataverse/customApi";
import { enviarAvaliacao, rotuloRecomendacoes, type ResumoAvaliacoes } from "../despesas/avaliacaoPostos";
import { formatDiaMes } from "../despesas/gastosCartao";
import { distanciaKm, type ConviteAvaliacao, type Posicao } from "../despesas/rankingPostos";
import { reportAppError } from "../../shared/appErrorLogger";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { ServicesMenu } from "../../shared/ui/navigation/ServicesMenu";
import { descreverGpsErro } from "../termos/termosMulta";
import { PostosMapa, type Foco, type PostosMapaControle, type Vista } from "./PostosMapa";
import { PostosGaveta } from "./PostosGaveta";
import { idMenorPreco, juntarDados, juntarPosto, motivosPrincipais, notaDoPosto, podeAvaliar, rotuloBaseDoPreco, rotuloPrecoLitro, type DadosPorId, type DadosPosto, type PostoExibido } from "./postosDados";
import { areaJaCarregada, ESPERA_BUSCA_MS, LIMITE_POSTOS, medidasGaveta, origemDasDistancias, rotuloKm, rotuloOrigem, rotuloSemConexao, tituloLista, urlGoogleMaps, urlWaze, zoomDoFoco, type Area, type PosicaoGaveta, type Posto } from "./postosProximos";
import { carregarDadosPostos, carregarMaisProximos, carregarPostosDaArea, invalidarRanking, lerPosicaoDoMotorista } from "./remoto";

type Busca = "ok" | "carregando" | "erro";

/** Altura do cartão acima da gaveta: o pino tocado fica centralizado na parte livre do mapa. Com preço e recomendação o cartão cresce; com o convite de avaliar, mais ainda. */
const ALTURA_CARTAO = 196;
const ALTURA_CARTAO_COM_DADOS = 250;
const ALTURA_AVALIAR = 84;
/** O pino (42 px) mais a etiqueta (22 px) sobem a partir da ponta: a ponta fica abaixo do centro da área livre para a etiqueta não cortar no topo. */
const ALTURA_PINO_FOLGA = 60;
const FOLGA_CARTAO = 16;
const ZOOM_MINHA_POSICAO = 14;
const TEMA_ESCURO = "(prefers-color-scheme: dark)";

/** Tema escuro do aparelho, acompanhando a mudança sem recarregar. O app não tem seletor de tema próprio. */
function useTemaEscuro() {
  const [escuro, setEscuro] = useState(() => window.matchMedia?.(TEMA_ESCURO).matches ?? false);
  useEffect(() => {
    const consulta = window.matchMedia?.(TEMA_ESCURO);
    if (!consulta) return;
    const mudou = () => setEscuro(consulta.matches);
    consulta.addEventListener("change", mudou);
    return () => consulta.removeEventListener("change", mudou);
  }, []);
  return escuro;
}

function Nota({ dados }: { dados: DadosPosto }) {
  const nota = notaDoPosto(dados.avaliacoes);
  if (!nota) return null;
  const Icone = nota.alerta ? ThumbsDown : ThumbsUp;
  return <span className="pp-nota" data-alerta={nota.alerta || undefined}><Icone aria-hidden="true" />{nota.texto}<small>· {nota.total}</small></span>;
}

function ItemMeta({ posto, menor }: { posto: PostoExibido; menor: boolean }) {
  const dados = posto.dados;
  if (!dados) return null;
  return (
    <span className="pp-item-meta">
      <span className="pp-preco" data-cor={dados.cor}><i aria-hidden="true" />{rotuloPrecoLitro(dados.precoLitro)}</span>
      <Nota dados={dados} />
      {menor ? <span className="pp-selo">Menor preço</span> : null}
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
      <strong id="pp-avaliar-pergunta">Você abasteceu aqui em {formatDiaMes(convite.data)}. Como foi?</strong>
      <div className="rp-escolha" role="group" aria-labelledby="pp-avaliar-pergunta">
        <button type="button" data-tom="positivo" disabled={salvando} onClick={() => void avaliar(true)}><ThumbsUp aria-hidden="true" />Recomendo</button>
        <button type="button" data-tom="negativo" disabled={salvando} onClick={() => void avaliar(false)}><ThumbsDown aria-hidden="true" />Não recomendo</button>
      </div>
      {erro ? <small className="pp-avaliar-erro" role="alert">{erro}</small> : null}
    </div>
  );
}

function CartaoDados({ dados }: { dados: DadosPosto }) {
  const nota = notaDoPosto(dados.avaliacoes);
  const motivos = motivosPrincipais(dados.avaliacoes);
  const Icone = nota?.alerta ? ThumbsDown : ThumbsUp;
  return (
    <div className="pp-cartao-dados">
      <div className="pp-cartao-linha">
        <span className="pp-cartao-preco" data-cor={dados.cor}>{rotuloPrecoLitro(dados.precoLitro)}</span>
        {nota ? <span className="pp-cartao-nota" data-alerta={nota.alerta || undefined}><Icone aria-hidden="true" />{rotuloRecomendacoes(dados.avaliacoes)}</span> : null}
      </div>
      <span className="pp-cartao-base">{rotuloBaseDoPreco(dados)}</span>
      {motivos.length ? <ul className="pp-motivos">{motivos.map((motivo) => <li key={motivo.id} data-positivo={motivo.positivo || undefined}>{motivo.rotulo}</li>)}</ul> : null}
    </div>
  );
}

export function PostosProximosScreen({ onBack }: { onBack: () => void }) {
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  const [aviso, setAviso] = useState("");
  const [vista, setVista] = useState<Vista | null>(null);
  const [postos, setPostos] = useState<Posto[]>([]);
  const [busca, setBusca] = useState<Busca>("carregando");
  // A lista tem busca própria, em volta da origem das distâncias: o mapa só mostra o que está na tela.
  const [proximos, setProximos] = useState<Posto[]>([]);
  const [buscaLista, setBuscaLista] = useState<"ok" | "carregando" | "erro">("carregando");
  // Preço e recomendação vêm do ranking, carregado uma vez em paralelo com o mapa. Se falhar, a tela segue sem eles (como o convite de avaliação).
  const [dadosPorId, setDadosPorId] = useState<DadosPorId | null>(null);
  const [convite, setConvite] = useState<ConviteAvaliacao | null>(null);
  // Quando os dados vieram do aparelho por falta de sinal: instante em que foram guardados, por origem (área, lista, ranking).
  const [desde, setDesde] = useState<{ area: number | null; lista: number | null; ranking: number | null }>({ area: null, lista: null, ranking: null });
  const [gavetaPosicao, setGavetaPosicao] = useState<PosicaoGaveta>("meio");
  const [alturaPalco, setAlturaPalco] = useState(0);
  const escuro = useTemaEscuro();
  const [selecionado, setSelecionado] = useState<Posto | null>(null);
  // O cartão fica montado para animar a saída: guarda o último posto aberto enquanto fecha.
  const [cartaoPosto, setCartaoPosto] = useState<Posto | null>(null);
  const [listaEntrou, setListaEntrou] = useState(false);
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

  const buscarRanking = useCallback(() => carregarDadosPostos().then(({ dados, desde: quando }) => {
    setDadosPorId(dados.dados);
    setConvite(dados.convite);
    setDesde((atual) => ({ ...atual, ranking: quando }));
  }, (erro) => {
    reportAppError(erro, { severity: "warning", source: "app", action: "carregarRankingPostosProximos", screen: "PostosProximos", notifyUser: false });
  }), []);
  useEffect(() => { void buscarRanking(); }, [buscarRanking]);

  const buscar = useCallback(async (atual: Vista) => {
    const id = ++pedido.current;
    setBusca("carregando");
    try {
      const { dados: lista, desde: quando } = await carregarPostosDaArea(atual.area);
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
  }, []);

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
      const { dados: lista, desde: quando } = await carregarMaisProximos(ponto);
      if (id !== pedidoLista.current) return;
      setProximos(lista);
      setDesde((anterior) => ({ ...anterior, lista: quando }));
      setBuscaLista("ok");
    } catch (erro) {
      if (id !== pedidoLista.current) return;
      reportAppError(erro, { severity: "warning", source: "app", action: "carregarMaisProximosPostos", screen: "PostosProximos", notifyUser: false });
      setBuscaLista("erro");
    }
  }, []);
  useEffect(() => { void buscarLista(origem.ponto); }, [buscarLista, origem]);

  const exibidos = useMemo(() => juntarDados(postos, dadosPorId), [postos, dadosPorId]);
  const lista = useMemo(() => juntarDados(proximos, dadosPorId).map((posto) => ({ ...posto, distanciaKm: distanciaKm(origem.ponto, posto) })), [proximos, dadosPorId, origem]);
  const menorPreco = useMemo(() => idMenorPreco(lista), [lista]);
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
      <ServicesMenu title="Postos próximos" eyebrow="Combustível" homeLabel="Voltar" homeIcon="arrowLeft" onHome={onBack} onRefresh={async () => { await Promise.all([vista ? buscar(vista) : undefined, buscarLista(origem.ponto), buscarRanking()]); }} />
      <section className="pp-screen" aria-label="Postos próximos" onKeyDown={(evento) => { if (evento.key === "Escape") setSelecionado(null); }}>
        {avisoSemConexao ? <div className="termo-alert pp-aviso" data-tone="atencao" role="status"><p>{avisoSemConexao}</p><button type="button" className="termo-text-button pp-acao" onClick={() => { if (vista) void buscar(vista); void buscarLista(origem.ponto); void buscarRanking(); }}>Tentar de novo</button></div> : null}
        {aviso ? <div className="termo-alert pp-aviso" data-tone="atencao" role="status"><p>{aviso}</p><button type="button" className="termo-text-button pp-acao" onClick={localizar}>Tentar de novo</button></div> : null}
        {busca === "erro" ? <div className="termo-alert pp-aviso" data-tone="erro" role="alert"><p>Não foi possível carregar os postos.</p><button type="button" className="termo-text-button pp-acao" onClick={() => { if (vista) void buscar(vista); }}>Tentar de novo</button></div> : null}
        {buscaLista === "erro" ? <div className="termo-alert pp-aviso" data-tone="erro" role="alert"><p>Não foi possível carregar os postos mais próximos.</p><button type="button" className="termo-text-button pp-acao" onClick={() => { void buscarLista(origem.ponto); }}>Tentar de novo</button></div> : null}
        <div ref={palco} className="pp-palco">
          <div className="pp-mapa-caixa">
            <PostosMapa ref={controle} postos={exibidos} posicao={posicao} selecionadoId={selecionado?.id ?? ""} foco={foco} escuro={escuro} onVista={setVista} onMoveuSozinho={() => { moveuSozinho.current = true; }} onSelecionar={selecionar} onDesselecionar={() => setSelecionado(null)} />
            {busca === "carregando" ? <span className="pp-status" role="status"><i aria-hidden="true" />Buscando postos…</span> : null}
            {busca === "ok" && postos.length >= LIMITE_POSTOS ? <span className="pp-status pp-status--limite" role="status">Mostrando {LIMITE_POSTOS} postos desta área</span> : null}
            <div className="pp-controles">
              <div className="pp-zoom">
                <button type="button" className="pp-botao" aria-label="Aproximar" onClick={() => controle.current?.aproximar()}><Plus aria-hidden="true" /></button>
                <button type="button" className="pp-botao" aria-label="Afastar" onClick={() => controle.current?.afastar()}><Minus aria-hidden="true" /></button>
              </div>
              {posicao ? <button type="button" className="pp-botao pp-botao--solto pp-botao--destaque" aria-label="Minha posição" onClick={() => irPara(posicao.lat, posicao.lon, ZOOM_MINHA_POSICAO)}><Crosshair aria-hidden="true" /></button> : null}
            </div>
          </div>
          <PostosGaveta
            gaveta={gaveta} posicao={gavetaPosicao} onPosicao={setGavetaPosicao}
            titulo={tituloLista(origem)} contagem={lista.length ? `${lista.length} ${lista.length === 1 ? "posto" : "postos"}` : ""}
            acima={(
              <article className={`pp-cartao${selecionado ? " is-aberto" : ""}`} aria-label={cartao ? `Posto ${cartao.nome}` : "Posto"} aria-hidden={selecionado ? undefined : true}>
                {cartao ? (
                  <>
                    <button type="button" className="pp-cartao-fechar" aria-label="Fechar" tabIndex={selecionado ? 0 : -1} onClick={() => setSelecionado(null)}><X aria-hidden="true" /></button>
                    <strong className="pp-cartao-nome">{cartao.nome}</strong>
                    {cartao.dados ? <CartaoDados dados={cartao.dados} /> : null}
                    <div className="pp-cartao-meta">
                      <span className="pp-cartao-distancia">{distanciaCartao}</span>
                    </div>
                    {cartao.endereco ? <span className="pp-cartao-endereco">{cartao.endereco}</span> : null}
                    {cartao.dados ? <CartaoAvaliar key={cartao.id} postoId={cartao.id} dados={cartao.dados} convite={convite} onAvaliado={aoAvaliar} /> : null}
                    <div className="pp-cartao-acoes">
                      <a className="pp-ir pp-ir--primario" href={urlGoogleMaps(cartao)} target="_blank" rel="noreferrer"><Navigation aria-hidden="true" />Ir</a>
                      <a className="pp-ir" href={urlWaze(cartao)} target="_blank" rel="noreferrer">Waze</a>
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
                        <span className="pp-item-icone" data-cor={posto.dados?.cor}><Fuel aria-hidden="true" /></span>
                        <span className="pp-item-texto">
                          <strong>{posto.nome}</strong>
                          <ItemMeta posto={posto} menor={posto.id === menorPreco} />
                          {posto.endereco ? <span className="pp-item-endereco">{posto.endereco}</span> : null}
                        </span>
                        <span className="pp-item-km"><b>{rotuloKm(posto.distanciaKm)}</b><small>{origem.doMotorista ? "de você" : "do centro"}</small></span>
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
    </AppShell>
  );
}
