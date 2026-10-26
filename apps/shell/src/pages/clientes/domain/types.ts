/** Cliente (empresa ou particular) da tabela `cr40f_clientes1`. */
export type Cliente = {
  id: string
  nome: string
  /** "Registro" no Dataverse: hoje guarda a praça do cliente (ex.: SJCampos, Pinda). */
  registro: string
  endereco: string
  criadoEm: Date | null
}
