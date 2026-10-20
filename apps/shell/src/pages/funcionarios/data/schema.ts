// Metadata conferida em cr40f_funcionarios (PROD e DEV idênticos, 2026-10-01).
export const TABLE = 'cr40f_funcionarios'
export const ENTITY_SET = 'cr40f_funcionarioses'
export const VEICULO_TABLE = 'cr40f_veiculos'

export type Option = { value: number; label: string }

export const STATUS: Option[] = [
  { value: 0, label: 'Ativo' },
  { value: 2, label: 'Afastado' },
  { value: 1, label: 'Desligado' },
]
export const FUNCAO: Option[] = [
  { value: 202410000, label: 'Motorista' },
  { value: 202410001, label: 'Administrativo' },
]
export const EMPRESA: Option[] = [
  { value: 202410000, label: 'BETINHOS L AUTO LTDA EPP' },
  { value: 202410001, label: 'DEPAULA L AUTO LTDA EPP' },
]
export const VINCULO: Option[] = [
  { value: 0, label: 'Colaborador' },
  { value: 1, label: 'Terceiro' },
]
export const MULTA_STATUS: Option[] = [
  { value: 202410000, label: 'Notificar o Condutor' },
  { value: 202410001, label: 'Indicada' },
  { value: 202410002, label: 'Recurso' },
  { value: 202410003, label: 'Descontado' },
  { value: 202410004, label: 'Condutor Notificado' },
  { value: 202410005, label: 'Finalizado' },
  { value: 202410006, label: 'Pago' },
]

export type FieldKind = 'text' | 'textarea' | 'cpf' | 'phone' | 'email' | 'url' | 'date' | 'choice' | 'bool'
export type FieldGroup = 'pessoais' | 'vinculo' | 'contato' | 'detalhes'

export type FieldDef = {
  key: string
  label: string
  kind: FieldKind
  group: FieldGroup
  options?: Option[]
  required?: boolean
  readonly?: boolean
  /** Texto de apoio abaixo do campo (padrão `Field` do Design System). */
  hint?: string
}

/** CNH e ASO são mantidos pelo módulo Documentos (dual-write de cr40f_documento); aqui só leitura. */
const HINT_DOCUMENTOS = 'Edite em Documentos'

export const FIELDS: FieldDef[] = [
  { key: 'cr40f_nomecompleto', label: 'Nome completo', kind: 'text', group: 'pessoais', required: true },
  { key: 'new_apelido', label: 'Apelido', kind: 'text', group: 'pessoais', required: true },
  { key: 'cr40f_numerodocpf', label: 'CPF', kind: 'cpf', group: 'pessoais' },
  { key: 'cr40f_numerodorg', label: 'RG', kind: 'text', group: 'pessoais' },
  { key: 'cr40f_datadeaniversario', label: 'Data de aniversário', kind: 'date', group: 'pessoais' },
  { key: 'cr40f_filiacao', label: 'Filiação', kind: 'text', group: 'pessoais' },
  { key: 'cr40f_enderecocompleto', label: 'Endereço completo', kind: 'textarea', group: 'pessoais' },
  { key: 'cr40f_cnhtexto', label: 'Categoria da CNH', kind: 'text', group: 'pessoais' },
  { key: 'cr40f_validadedacnh', label: 'Validade da CNH', kind: 'date', group: 'pessoais', readonly: true, hint: HINT_DOCUMENTOS },

  { key: 'cr40f_status', label: 'Status', kind: 'choice', group: 'vinculo', options: STATUS, required: true },
  { key: 'cr40f_funcao', label: 'Função', kind: 'choice', group: 'vinculo', options: FUNCAO, required: true },
  { key: 'cr40f_nomedaempresa', label: 'Empresa', kind: 'choice', group: 'vinculo', options: EMPRESA },
  { key: 'cr40f_tipodevinculo', label: 'Vínculo', kind: 'choice', group: 'vinculo', options: VINCULO },
  { key: 'cr40f_datadeadmissao', label: 'Data de admissão', kind: 'date', group: 'vinculo' },
  { key: 'cr40f_datadedemissao', label: 'Data de demissão', kind: 'date', group: 'vinculo' },
  { key: 'cr40f_datadoaso', label: 'Data do ASO', kind: 'date', group: 'vinculo', readonly: true, hint: HINT_DOCUMENTOS },
  { key: 'cr40f_relacaotrabalhista', label: 'Relação trabalhista', kind: 'text', group: 'vinculo' },

  { key: 'cr40f_telefonecorporativo', label: 'Telefone corporativo', kind: 'phone', group: 'contato' },
  { key: 'cr40f_telefonepessoal', label: 'Telefone pessoal', kind: 'phone', group: 'contato' },
  { key: 'cr40f_telefonedeemergencia', label: 'Telefone de emergência', kind: 'phone', group: 'contato' },
  { key: 'cr40f_emailbetinhos', label: 'E-mail Betinhos', kind: 'email', group: 'contato' },
  { key: 'cr40f_emailmicrosoft', label: 'E-mail Microsoft', kind: 'email', group: 'contato' },

  { key: 'cr40f_linkparadocumentos', label: 'Link para documentos', kind: 'url', group: 'detalhes' },
  { key: 'cr40f_folderid', label: 'Folder ID', kind: 'text', group: 'detalhes' },
  { key: 'new_notificacoesmotoristas', label: 'Notificações de motoristas', kind: 'bool', group: 'detalhes' },
  { key: 'new_notificacoesoperacionais', label: 'Notificações operacionais', kind: 'bool', group: 'detalhes' },
  { key: 'new_notificacoesfinanceiras', label: 'Notificações financeiras', kind: 'bool', group: 'detalhes' },
  { key: 'new_notificacoesfrota', label: 'Notificações de frota', kind: 'bool', group: 'detalhes', hint: 'Recebe o resumo semanal de pendências da frota (quarta, 08:00).' },
  { key: 'cr40f_gerarrecibopersonalizado', label: 'Gerar recibo personalizado', kind: 'bool', group: 'detalhes' },
  { key: 'cr40f_identificadordocolaborador', label: 'ID SharePoint', kind: 'text', group: 'detalhes', readonly: true },
  { key: 'new_infleetdriverid', label: 'ID InFleet', kind: 'text', group: 'detalhes', readonly: true },
]

export const GROUP_LABELS: Record<FieldGroup, string> = {
  pessoais: 'Dados pessoais',
  vinculo: 'Vínculo',
  contato: 'Contato',
  detalhes: 'Detalhes',
}

export const BOOL_REQUIRED_DEFAULTS = {
  new_notificacoesmotoristas: false,
  new_notificacoesoperacionais: false,
  new_notificacoesfinanceiras: false,
}

export function optionLabel(options: Option[], value: unknown) {
  return options.find((option) => option.value === value)?.label ?? ''
}
