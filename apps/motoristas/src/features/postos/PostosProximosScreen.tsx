import { Crosshair, Fuel, MapPin, Minus, Navigation, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reportAppError } from "../../shared/appErrorLogger";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { ServicesMenu } from "../../shared/ui/navigation/ServicesMenu";
import { descreverGpsErro } from "../termos/termosMulta";
import { PostosMapa, type Foco, type PostosMapaControle, type Vista } from "./PostosMapa";
import { areaAfastadaDemais, ESPERA_BUSCA_MS, distanciaKm, LIMITE_POSTOS, maisProximos, origemDasDistancias, rotuloKm, rotuloOrigem, tituloLista, urlGoogleMaps, urlWaze, zoomDoFoco, type Posicao, type Posto } from "./postosProximos";
import { carregarPostosNaArea } from "./remoto";

type Busca = "ok" | "carregando" | "erro" | "afastado";

/** Altura reservada ao cartão sobre o mapa: o pino tocado fica centralizado na parte livre. */
const ALTURA_CARTAO = 196;
const ZOOM_MINHA_POSICAO = 14;

const isMock = () => ["localhost", "127.0.0.1"].includes(window.location?.hostname ?? "");

function lerPosicao(): Promise<Posicao> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(null); return; }
    navigator.geolocation.getCurrentPosition(({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude }), reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
}

export function PostosProximosScreen({ onBack }: { onBack: () => void }) {
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  const [aviso, setAviso] = useState("");
  const [vista, setVista] = useState<Vista | null>(null);
  const [postos, setPostos] = useState<Posto[]>([]);
  const [busca, setBusca] = useState<Busca>("carregando");
  const [selecionado, setSelecionado] = useState<Posto | null>(null);
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
  const lista = useMemo(() => maisProximos(postos, origem.ponto), [postos, origem]);

  // Centraliza o posto sem aproximar: mantém o zoom atual (no máximo 15) e deixa o pino acima do cartão.
  const selecionar = useCallback((posto: Posto) => {
    setSelecionado(posto);
    irPara(posto.lat, posto.lon, zoomDoFoco(vista?.zoom ?? ZOOM_MINHA_POSICAO), ALTURA_CARTAO);
    caixa.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [irPara, vista?.zoom]);

  const distanciaCartao = selecionado ? `a ${rotuloKm(distanciaKm(origem.ponto, selecionado))} ${rotuloOrigem(origem)}` : "";

  return (
    <AppShell screenLabel="PostosProximos">
      <ServicesMenu title="Postos próximos" eyebrow={isMock() ? "Combustível · Mock local" : "Combustível"} homeLabel="Voltar" homeIcon="arrowLeft" onHome={onBack} onRefresh={() => (vista ? buscar(vista) : undefined)} />
      <section className="termo-screen gr-screen pp-screen" aria-label="Postos próximos" onKeyDown={(evento) => { if (evento.key === "Escape") setSelecionado(null); }}>
        <div ref={caixa} className="pp-mapa-caixa" onPointerDown={() => { moveuSozinho.current = true; }}>
          <PostosMapa ref={controle} postos={postos} posicao={posicao} selecionadoId={selecionado?.id ?? ""} foco={foco} onVista={aoMudarVista} onSelecionar={selecionar} onDesselecionar={() => setSelecionado(null)} />
          {busca === "carregando" ? <span className="pp-status" role="status"><i aria-hidden="true" />Buscando postos…</span> : null}
          <div className="pp-controles">
            <button type="button" className="pp-botao" aria-label="Aproximar" onClick={() => controle.current?.aproximar()}><Plus aria-hidden="true" /></button>
            <button type="button" className="pp-botao" aria-label="Afastar" onClick={() => controle.current?.afastar()}><Minus aria-hidden="true" /></button>
            {posicao ? <button type="button" className="pp-botao pp-botao--destaque" aria-label="Minha posição" onClick={() => irPara(posicao.lat, posicao.lon, ZOOM_MINHA_POSICAO)}><Crosshair aria-hidden="true" /></button> : null}
          </div>
          {selecionado ? (
            <article className="pp-cartao" aria-label={`Posto ${selecionado.nome}`}>
              <button type="button" className="pp-cartao-fechar" aria-label="Fechar" onClick={() => setSelecionado(null)}><X aria-hidden="true" /></button>
              <strong className="pp-cartao-nome">{selecionado.nome}</strong>
              {selecionado.endereco ? <span className="pp-cartao-endereco">{selecionado.endereco}</span> : null}
              <span className="pp-cartao-distancia">{distanciaCartao}</span>
              <div className="pp-cartao-acoes">
                <a className="pp-ir pp-ir--primario" href={urlGoogleMaps(selecionado)} target="_blank" rel="noreferrer"><Navigation aria-hidden="true" />Ir</a>
                <a className="pp-ir" href={urlWaze(selecionado)} target="_blank" rel="noreferrer">Waze</a>
              </div>
            </article>
          ) : null}
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
            <ul className="pp-lista">
              {lista.map((posto) => (
                <li key={posto.id}>
                  <button type="button" className="pp-item" data-ativo={posto.id === selecionado?.id || undefined} onClick={() => selecionar(posto)}>
                    <span className="pp-item-icone"><Fuel aria-hidden="true" /></span>
                    <span className="pp-item-texto"><strong>{posto.nome}</strong>{posto.endereco ? <span>{posto.endereco}</span> : null}</span>
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
