import { ehPdf } from "./mediaDrafts";

/** Anexo da galeria pode ser PDF: a miniatura vira um selo "PDF" no lugar da imagem (o arquivo sobe como veio). */
export function ImagemOuPdf({ src, alt, className }: { src: string; alt: string; className?: string }) {
  if (ehPdf(src)) {
    return (
      <span className={`media-pdf-thumb ${className ?? ""}`.trim()} role="img" aria-label={alt}>
        <strong>PDF</strong>
      </span>
    );
  }
  return <img className={className} src={src} alt={alt} />;
}
