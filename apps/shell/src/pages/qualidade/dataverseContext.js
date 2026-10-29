function readParentXrm(runtime) {
  try {
    return runtime?.parent?.Xrm || null;
  } catch {
    return null;
  }
}

function readGlobalContext(xrm) {
  try {
    return xrm?.Utility?.getGlobalContext?.() || null;
  } catch {
    return null;
  }
}

function directWebResourceOrigin(runtime) {
  const location = runtime?.location;
  if (!location || !/^https?:$/.test(location.protocol || "")) return "";
  if (!/^\/WebResources\//i.test(location.pathname || "")) return "";
  return String(location.origin || "").replace(/\/$/, "");
}

export function getDataverseContext(runtime = typeof window === "undefined" ? null : window) {
  const xrm = readParentXrm(runtime) || runtime?.Xrm || null;
  const globalContext = readGlobalContext(xrm);
  const clientUrl = String(globalContext?.getClientUrl?.() || "").replace(/\/$/, "");
  const directClientUrl = xrm ? "" : directWebResourceOrigin(runtime);

  return {
    xrm,
    globalContext,
    clientUrl: clientUrl || directClientUrl,
    isDirectWebResource: !xrm && Boolean(directClientUrl),
  };
}
