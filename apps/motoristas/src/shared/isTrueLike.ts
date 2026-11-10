// Campo booleano do Dataverse que pode chegar como true, 1 ou "true".
export function isTrueLike(value: unknown) {
  return value === true || value === 1 || value === "true";
}
