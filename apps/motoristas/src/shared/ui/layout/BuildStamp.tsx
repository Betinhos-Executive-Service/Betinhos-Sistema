import { useMemo } from "react";
import { formatBuildStamp, getBuildInfo } from "../../buildStamp";

// Versão de build sempre visível, discreta e sem capturar toque (aria-hidden: não é conteúdo).
export function BuildStamp() {
  const label = useMemo(() => formatBuildStamp(getBuildInfo()), []);
  return (
    <div className="build-stamp" aria-hidden="true">
      {label}
    </div>
  );
}
