import { useEffect, useState } from "react";
import { tirarFundoBranco } from "../util";

// Avatar nunca vazio: a inicial só sai quando a foto carrega de verdade. Erro, troca de foto no meio do carregamento ou
// imagem sem conteúdo (pixel 1x1, menor que 16 px) deixam a inicial.
export function Avatar({ src, inicial, id, className, ariaHidden = true }: { src?: string; inicial: string; id?: string; className: string; ariaHidden?: boolean }) {
  const [ok, setOk] = useState<string | null>(null);
  useEffect(() => {
    setOk(null);
    if (!src) return;
    let vivo = true;
    const img = new Image();
    img.onload = () => { if (vivo && img.naturalWidth >= 16 && img.naturalHeight >= 16) setOk(src); };
    img.src = src;
    return () => { vivo = false; img.onload = null; };
  }, [src]);
  return (
    <div className={className} id={id} aria-hidden={ariaHidden || undefined}>
      {ok && ok === src ? <img src={src} alt="" /> : inicial}
    </div>
  );
}

// Foto do carro com o fundo branco removido; sem foto (ou erro) a caixa fica vazia.
export function FotoCarro({ src, className, id, hidden }: { src?: string; className: string; id?: string; hidden?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!src) return;
    let vivo = true;
    tirarFundoBranco(src).then((u) => { if (vivo && u) setUrl(u); });
    return () => { vivo = false; };
  }, [src]);
  return <div className={className} id={id} aria-hidden="true" hidden={hidden}>{url ? <img src={url} alt="" /> : null}</div>;
}
