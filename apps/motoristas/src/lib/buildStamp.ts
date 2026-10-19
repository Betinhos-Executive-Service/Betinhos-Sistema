export type BuildInfo = {
  version?: string;
  builtAt?: string;
  builtAtLabel?: string;
};

// Formato padrão Betinhos: "v2.1.706 · 18/10/2026 19:49".
export function formatBuildStamp(info: BuildInfo) {
  const version = info.version ? `v${info.version.replace(/^v/i, "")}` : "local";
  const builtAt = (info.builtAtLabel ?? "").replace(",", "").replace(/\s+/g, " ").trim();
  return builtAt ? `${version} · ${builtAt}` : version;
}

export function getBuildInfo(): BuildInfo {
  if (typeof window === "undefined") return {};
  return ((window as Window & { __APP_BUILD_INFO?: BuildInfo }).__APP_BUILD_INFO ?? {}) as BuildInfo;
}
