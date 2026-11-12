import { BrandLoader } from "../../../app/BrandLoader";

/**
 * Carga de uma tela do Planner: loader da marca no lugar do conteúdo. Os chamadores ainda passam `view` e `quoteView`
 * (eram do esqueleto por tela); aqui só o `label` importa.
 */
export default function LoadingFallback({ label = "Carregando tela" }: any) {
  return <BrandLoader variant="inline" label={label} text={`${label}…`} />;
}
