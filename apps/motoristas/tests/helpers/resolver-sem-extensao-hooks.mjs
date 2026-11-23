export async function resolve(specifier, contexto, proximo) {
  try {
    return await proximo(specifier, contexto);
  } catch (erro) {
    if (erro?.code === "ERR_MODULE_NOT_FOUND" && /^\.\.?\//.test(specifier) && !/\.\w+$/.test(specifier)) {
      return proximo(`${specifier}.ts`, contexto);
    }
    throw erro;
  }
}
