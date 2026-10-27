// Manifest do PWA (puro, testável em Node).
export const PWA_SW_NAME = "new_app-motoristas-v2-sw";
export const THEME_COLOR = "#001a3d";
const BACKGROUND_COLOR = "#fcfcfb";

/** Remove o prefixo de versão do Dataverse (/%7B...%7D/) para fixar uma URL estável de abertura. */
export function stableAppPath(pathname: string) {
  return pathname.replace(/^\/(%7B|\{)[^/]+(%7D|\})(?=\/)/i, "");
}

export function buildManifest(origin: string, pathname: string, icons: { icon192: string; icon512: string; iconMaskable512: string }) {
  const startUrl = `${origin}${stableAppPath(pathname)}`;
  return {
    name: "App Betinhos Motoristas",
    short_name: "Motoristas",
    lang: "pt-BR",
    id: startUrl,
    start_url: startUrl,
    scope: `${origin}/WebResources/`,
    display: "standalone",
    orientation: "any",
    theme_color: THEME_COLOR,
    background_color: BACKGROUND_COLOR,
    icons: [
      { src: icons.icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icons.icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: icons.iconMaskable512, sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}

