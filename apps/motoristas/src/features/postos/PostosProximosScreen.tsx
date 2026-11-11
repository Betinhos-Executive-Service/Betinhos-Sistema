import { Crosshair, Fuel, MapPin, Minus, Navigation, Plus, ThumbsDown, ThumbsUp, X } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rotuloRecomendacoes } from "../despesas/avaliacaoPostos";
import { reportAppError } from "../../shared/appErrorLogger";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { ServicesMenu } from "../../shared/ui/navigation/ServicesMenu";
import { descreverGpsErro } from "../termos/termosMulta";
import { PostosMapa, type Foco, type PostosMapaControle, type Vista } from "./PostosMapa";
import { idMenorPreco, juntarDados, juntarPosto, motivosPrincipais, notaDoPosto, rotuloBaseDoPreco, rotuloPrecoLitro, type DadosPorId, type DadosPosto, type PostoExibido } from "./postosDados";
import { areaAfastadaDemais, ESPERA_BUSCA_MS, distanciaKm, LIMITE_POSTOS, maisProximos, origemDasDistancias, rotuloKm, rotuloOrigem, tituloLista, urlGoogleMaps, urlWaze, zoomDoFoco, type Posicao, type Posto } from "./postosProximos";
import { carregarDadosPostos, carregarPostosNaArea } from "./remoto";

type Busca = "ok" | "carregando" | "erro" | "afastado";

/** Altura reservada ao cartão sobre o mapa: o pino tocado fica centralizado na parte livre. Com preço e recomendação o cartão cresce. */
const ALTURA_CARTAO = 196;
const ALTURA_CARTAO_COM_DADOS = 250;
const ZOOM_MINHA_POSICAO = 14;

function lerPosicao(): Promise<Posicao> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(null); return; }
    navigator.geolocation.getCurrentPosition(({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude }), reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
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
  // Preço e recomendação vêm do ranking, carregado uma vez em paralelo com o mapa. Se falhar, a tela segue sem eles (como o convite de avaliação).
  const [dadosPorId, setDadosPorId] = useState<DadosPorId | null>(null);
  const [selecionado, setSelecionado] = useState<Posto | null>(null);
  // O cartão fica montado para animar a saída: guarda o último posto aberto enquanto fecha.
  const [cartaoPosto, setCartaoPosto] = useState<Posto | null>(null);
  const [listaEntrou, setListaEntrou] = useState(false);
  const [foco, setFoco] = useState<Foco | null>(null);
  const moveuSozinho = useRef(false);
  const pedido = useRef(0);
  const chaveFoco = useRef(0);
  const primeiraBusca = useRef(true);
  const caixa = useRef<HTMLDivElement | null>(null);
  const controle = useRef<PostosMapaControle | null>(null);

  const irPara = useCallback((lat: number, lon: number, zoom?: number, deslocamentoY?: number) => { chaveFoco.current += 1; setFoco({ lat, lon, zoom, deslocamentoY, chave: chaveFoco.current }); }, []);

  const localizar = useCallback(() => {
    setAviso("");
    lerPosicao().then((atual) => {
      setPosicao(atual);
      // Quem já arrastou o mapa não perde o lugar quando o GPS responde tarde.
      if (!moveuSozinho.current) irPara(atual.lat, atual.lon, ZOOM_MINHA_POSICAO);
    }, (erro) => {
      setPosicao(null);
      setAviso(`${descreverGpsErro(erro as { code?: number } | null).split(".")[0]}. Mostrando São José dos Campos.`);
    });
  }, [irPara]);
  useEffect(() => { localizar(); }, [localizar]);

  useEffect(() => {
    let ativo = true;
    carregarDadosPostos().then((dados) => { if (ativo) setDadosPorId(dados); }, (erro) => {
      reportAppError(erro, { severity: "warning", source: "app", action: "carregarRankingPostosProximos", screen: "PostosProximos", notifyUser: false });
    });
    return () => { ativo = false; };
  }, []);

  const aoMudarVista = useCallback((nova: Vista) => setVista(nova), []);

  const buscar = useCallback(async (atual: Vista) => {
    const id = ++pedido.current;
    if (areaAfastadaDemais(atual.zoom)) { setPostos([]); setBusca("afastado"); return; }
    setBusca("carregando");
    try {
      const lista = await carregarPostosNaArea(atual.area);
      if (id !== pedido.current) return;
      setPostos(lista);
      setBusca("ok");
    } catch (erro) {
      if (id !== pedido.current) return;
      reportAppError(erro, { severity: "warning", source: "app", action: "carregarPostosProximos", screen: "PostosProximos", notifyUser: false });
      setBusca("erro");
    }
  }, []);

  useEffect(() => {
    if (!vista) return;
    const espera = primeiraBusca.current ? 0 : ESPERA_BUSCA_MS;
    primeiraBusca.current = false;
    const relogio = window.setTimeout(() => { void buscar(vista); }, espera);
    return () => window.clearTimeout(relogio);
  }, [vista, buscar]);

  // Distância sempre do motorista (ou do centro padrão sem GPS); a lista vem dos postos carregados na área visível.
  const origem = useMemo(() => origemDasDistancias(posicao), [posicao]);
  const exibidos = useMemo(() => juntarDados(postos, dadosPorId), [postos, dadosPorId]);
  const lista = useMemo(() => maisProximos(exibidos, origem.ponto), [exibidos, origem]);
  const menorPreco = useMemo(() => idMenorPreco(lista), [lista]);
  const cartao = cartaoPosto ? juntarPosto(cartaoPosto, dadosPorId) : null;

  // Centraliza o posto sem aproximar: mantém o zoom atual (no máximo 15) e deixa o pino acima do cartão.
  const selecionar = useCallback((posto: Posto) => {
    setSelecionado(posto);
    setCartaoPosto(posto);
    irPara(posto.lat, posto.lon, zoomDoFoco(vista?.zoom ?? ZOOM_MINHA_POSICAO), dadosPorId?.has(posto.id) ? ALTURA_CARTAO_COM_DADOS : ALTURA_CARTAO);
    caixa.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [irPara, vista?.zoom, dadosPorId]);

  // Escalonamento da lista só na primeira carga; depois de ~700 ms a classe sai e movimentos do mapa não animam.
  useEffect(() => {
    if (!lista.length || listaEntrou) return;
    const relogio = window.setTimeout(() => setListaEntrou(true), 700);
    return () => window.clearTimeout(relogio);
  }, [lista.length, listaEntrou]);

  const distanciaCartao = cartao ? `a ${rotuloKm(distanciaKm(origem.ponto, cartao))} ${rotuloOrigem(origem)}` : "";

  return (
    <AppShell screenLabel="PostosProximos">
      <ServicesMenu title="Postos próximos" eyebrow="Combustível" homeLabel="Voltar" homeIcon="arrowLeft" onHome={onBack} onRefresh={() => (vista ? buscar(vista) : undefined)} />
      <section className="termo-screen gr-screen pp-screen" aria-label="Postos próximos" onKeyDown={(evento) => { if (evento.key === "Escape") setSelecionado(null); }}>
        <div ref={caixa} className="pp-mapa-caixa" onPointerDown={() => { moveuSozinho.current = true; }}>
          <PostosMapa ref={controle} postos={exibidos} posicao={posicao} selecionadoId={selecionado?.id ?? ""} foco={foco} onVista={aoMudarVista} onSelecionar={selecionar} onDesselecionar={() => setSelecionado(null)} />
          {busca === "carregando" ? <span className="pp-status" role="status"><i aria-hidden="true" />Buscando postos…</span> : null}
          <div className="pp-controles">
            <div className="pp-zoom">
              <button type="button" className="pp-botao" aria-label="Aproximar" onClick={() => controle.current?.aproximar()}><Plus aria-hidden="true" /></button>
              <button type="button" className="pp-botao" aria-label="Afastar" onClick={() => controle.current?.afastar()}><Minus aria-hidden="true" /></button>
            </div>
            {posicao ? <button type="button" className="pp-botao pp-botao--solto pp-botao--destaque" aria-label="Minha posição" onClick={() => irPara(posicao.lat, posicao.lon, ZOOM_MINHA_POSICAO)}><Crosshair aria-hidden="true" /></button> : null}
          </div>
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
                <div className="pp-cartao-acoes">
                  <a className="pp-ir pp-ir--primario" href={urlGoogleMaps(cartao)} target="_blank" rel="noreferrer"><Navigation aria-hidden="true" />Ir</a>
                  <a className="pp-ir" href={urlWaze(cartao)} target="_blank" rel="noreferrer">Waze</a>
                </div>
              </>
            ) : null}
          </article>
        </div>
        {aviso ? <div className="termo-alert pp-aviso" data-tone="atencao" role="status"><p>{aviso}</p><button type="button" className="termo-text-button pp-acao" onClick={localizar}>Tentar de novo</button></div> : null}
        {busca === "afastado" ? <div className="termo-alert" data-tone="atencao" role="status"><p>Aproxime o mapa para ver os postos.</p></div> : null}
        {busca === "erro" ? <div className="termo-alert pp-aviso" data-tone="erro" role="alert"><p>Não foi possível carregar os postos.</p><button type="button" className="termo-text-button pp-acao" onClick={() => { if (vista) void buscar(vista); }}>Tentar de novo</button></div> : null}
        <section aria-labelledby="pp-lista-titulo" aria-busy={busca === "carregando"}>
          <div className="pp-lista-cabeca">
            <h2 className="gr-subtitulo" id="pp-lista-titulo">{tituloLista(origem)}</h2>
            {lista.length ? <span className="pp-lista-total">{lista.length} {lista.length === 1 ? "posto" : "postos"}</span> : null}
          </div>
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
          ) : busca === "carregando" ? (
            <ul className="pp-lista" aria-hidden="true">{[0, 1, 2].map((n) => <li key={n} className="pp-item pp-item--esqueleto"><span /><span /></li>)}</ul>
          ) : busca === "erro" ? null : (
            <p className="termo-empty"><MapPin aria-hidden="true" /> {busca === "afastado" ? "Aproxime o mapa para listar os postos." : "Nenhum posto da rede CTF nesta área. Arraste o mapa para outra região."}</p>
          )}
        </section>
        {busca === "ok" && postos.length >= LIMITE_POSTOS ? <p className="gr-legenda">Mostrando os {LIMITE_POSTOS} primeiros desta área. Aproxime o mapa para ver os outros.</p> : null}
        <p className="gr-legenda">Postos da rede CTF (cartão de combustível).</p>
      </section>
    </AppShell>
  );
}
