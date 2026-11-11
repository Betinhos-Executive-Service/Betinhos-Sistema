import { Crosshair, Fuel, MapPin, Navigation, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reportAppError } from "../../shared/appErrorLogger";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { ServicesMenu } from "../../shared/ui/navigation/ServicesMenu";
import { descreverGpsErro } from "../termos/termosMulta";
import { PostosMapa, type Foco, type Vista } from "./PostosMapa";
import { areaAfastadaDemais, CENTRO_PADRAO, ESPERA_BUSCA_MS, distanciaKm, LIMITE_POSTOS, maisProximos, rotuloKm, urlGoogleMaps, urlWaze, type Posicao, type Posto } from "./postosProximos";
import { carregarPostosNaArea } from "./remoto";

type Busca = "ok" | "carregando" | "erro" | "afastado";

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

  const irPara = useCallback((lat: number, lon: number, zoom?: number) => { chaveFoco.current += 1; setFoco({ lat, lon, zoom, chave: chaveFoco.current }); }, []);

  const localizar = useCallback(() => {
    setAviso("");
    lerPosicao().then((atual) => {
      setPosicao(atual);
      // Quem já arrastou o mapa não perde o lugar quando o GPS responde tarde.
      if (!moveuSozinho.current) irPara(atual.lat, atual.lon, 15);
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

  const centro = vista?.centro ?? CENTRO_PADRAO;
  const lista = useMemo(() => maisProximos(postos, centro), [postos, centro]);

  const selecionar = useCallback((posto: Posto, centralizar: boolean) => {
    setSelecionado(posto);
    if (centralizar) irPara(posto.lat, posto.lon, Math.max(vista?.zoom ?? 0, 15));
  }, [irPara, vista?.zoom]);

  const distanciaCartao = selecionado ? (posicao ? `a ${rotuloKm(distanciaKm(posicao, selecionado))} de você` : `a ${rotuloKm(distanciaKm(centro, selecionado))} do centro do mapa`) : "";

  return (
    <AppShell screenLabel="PostosProximos">
      <ServicesMenu title="Postos próximos" eyebrow={isMock() ? "Combustível · Mock local" : "Combustível"} homeLabel="Voltar" homeIcon="arrowLeft" onHome={onBack} onRefresh={() => (vista ? buscar(vista) : undefined)} />
      <section className="termo-screen gr-screen pp-screen" aria-label="Postos próximos">
        <div className="pp-mapa-caixa" onPointerDown={() => { moveuSozinho.current = true; }}>
          <PostosMapa postos={postos} posicao={posicao} selecionadoId={selecionado?.id ?? ""} foco={foco} onVista={aoMudarVista} onSelecionar={(posto) => selecionar(posto, true)} onDesselecionar={() => setSelecionado(null)} />
          {posicao ? <button type="button" className="pp-minha-posicao" aria-label="Minha posição" onClick={() => irPara(posicao.lat, posicao.lon, 15)}><Crosshair aria-hidden="true" /></button> : null}
          {busca === "carregando" ? <span className="pp-status" role="status">Buscando postos…</span> : null}
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
        {aviso ? <div className="termo-alert" data-tone="atencao" role="status"><p>{aviso}</p><button type="button" className="termo-text-button" onClick={localizar}>Tentar de novo</button></div> : null}
        {busca === "afastado" ? <div className="termo-alert" data-tone="atencao" role="status"><p>Aproxime o mapa para ver os postos.</p></div> : null}
        {busca === "erro" ? <div className="termo-alert" data-tone="erro" role="alert"><p>Não foi possível carregar os postos.</p><button type="button" className="termo-text-button" onClick={() => { if (vista) void buscar(vista); }}>Tentar de novo</button></div> : null}
        {busca === "ok" && postos.length >= LIMITE_POSTOS ? <p className="gr-legenda">Mostrando os {LIMITE_POSTOS} primeiros desta área. Aproxime o mapa para ver os outros.</p> : null}
        <section aria-labelledby="pp-lista-titulo">
          <h2 className="gr-subtitulo" id="pp-lista-titulo">Mais próximos do centro do mapa</h2>
          {lista.length ? (
            <ul className="pp-lista">
              {lista.map((posto) => (
                <li key={posto.id}>
                  <button type="button" className="pp-item" data-ativo={posto.id === selecionado?.id || undefined} onClick={() => selecionar(posto, true)}>
                    <Fuel aria-hidden="true" />
                    <span className="pp-item-texto"><strong>{posto.nome}</strong>{posto.endereco ? <span>{posto.endereco}</span> : null}</span>
                    <span className="pp-item-km">{rotuloKm(posto.distanciaKm)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : busca === "carregando" ? null : (
            <p className="termo-empty"><MapPin aria-hidden="true" /> {busca === "afastado" ? "Aproxime o mapa para listar os postos." : "Nenhum posto da rede CTF nesta área. Arraste o mapa para outra região."}</p>
          )}
        </section>
        <p className="gr-legenda">Postos da rede CTF (cartão de combustível). © OpenStreetMap.</p>
      </section>
    </AppShell>
  );
}
