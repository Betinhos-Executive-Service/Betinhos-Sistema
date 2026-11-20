// Stub: ajv só é usado por validadores de cliente/elicitação do SDK MCP, que este servidor não usa (workerd usa @cfworker/json-schema).
export default class Ajv { constructor() { throw new Error('ajv indisponível neste Worker') } }
export { Ajv }
