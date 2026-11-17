import { z } from 'zod'

/** Idioma padrão dos rótulos (pt-BR). */
export const DEFAULT_LANGUAGE = 1046

export const label = (text: string, language = DEFAULT_LANGUAGE) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [
    { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: language },
  ],
})

/** Lê o rótulo de um Label do Dataverse. */
export const labelText = (l: any): string | undefined => l?.UserLocalizedLabel?.Label ?? l?.LocalizedLabels?.[0]?.Label

export const columnSchema = z.object({
  tipo: z
    .enum(['texto', 'memo', 'inteiro', 'decimal', 'moeda', 'data', 'booleano', 'choice', 'lookup'])
    .describe('Tipo da coluna.'),
  nomeSchema: z.string().describe('Nome de esquema com prefixo do publisher, ex.: cr40f_observacao (minúsculas no nome lógico).'),
  rotulo: z.string().describe('Rótulo exibido.'),
  descricao: z.string().optional(),
  obrigatoria: z.boolean().optional().describe('Se true, obrigatória no app (ApplicationRequired).'),
  tamanhoMaximo: z.number().int().optional().describe('texto (padrão 100) e memo (padrão 2000).'),
  casasDecimais: z.number().int().min(0).max(10).optional().describe('decimal (padrão 2).'),
  somenteData: z.boolean().optional().describe('data: true = só data (DateOnly); padrão false = data e hora (fuso do usuário).'),
  opcoes: z
    .array(z.object({ valor: z.number().int().optional(), rotulo: z.string() }))
    .optional()
    .describe('choice local: lista de opções; sem valor, numera a partir de 100000000.'),
  rotuloVerdadeiro: z.string().optional().describe('booleano (padrão "Sim").'),
  rotuloFalso: z.string().optional().describe('booleano (padrão "Não").'),
  tabelaAlvo: z.string().optional().describe('lookup: nome lógico da tabela referenciada.'),
})
export type ColumnInput = z.infer<typeof columnSchema>

const required = (c: ColumnInput) => ({ Value: c.obrigatoria ? 'ApplicationRequired' : 'None', CanBeChanged: true })

/** Corpo de `POST EntityDefinitions(...)/Attributes` para colunas que não são lookup. */
export function buildAttribute(c: ColumnInput, language = DEFAULT_LANGUAGE): Record<string, unknown> {
  const base = {
    SchemaName: c.nomeSchema,
    DisplayName: label(c.rotulo, language),
    ...(c.descricao ? { Description: label(c.descricao, language) } : {}),
    RequiredLevel: required(c),
  }
  const type = (t: string) => ({ '@odata.type': `Microsoft.Dynamics.CRM.${t}AttributeMetadata`, ...base })
  switch (c.tipo) {
    case 'texto':
      return { ...type('String'), MaxLength: c.tamanhoMaximo ?? 100, FormatName: { Value: 'Text' } }
    case 'memo':
      return { ...type('Memo'), MaxLength: c.tamanhoMaximo ?? 2000, Format: 'TextArea' }
    case 'inteiro':
      return { ...type('Integer'), Format: 'None', MinValue: -2147483648, MaxValue: 2147483647 }
    case 'decimal':
      return { ...type('Decimal'), Precision: c.casasDecimais ?? 2, MinValue: -100000000000, MaxValue: 100000000000 }
    case 'moeda':
      return { ...type('Money'), PrecisionSource: 2, MinValue: -922337203685477, MaxValue: 922337203685477 }
    case 'data':
      return c.somenteData
        ? { ...type('DateTime'), Format: 'DateOnly', DateTimeBehavior: { Value: 'DateOnly' } }
        : { ...type('DateTime'), Format: 'DateAndTime', DateTimeBehavior: { Value: 'UserLocal' } }
    case 'booleano':
      return {
        ...type('Boolean'),
        OptionSet: {
          TrueOption: { Value: 1, Label: label(c.rotuloVerdadeiro ?? 'Sim', language) },
          FalseOption: { Value: 0, Label: label(c.rotuloFalso ?? 'Não', language) },
          OptionSetType: 'Boolean',
        },
      }
    case 'choice': {
      if (!c.opcoes?.length) throw new Error(`Coluna ${c.nomeSchema}: choice exige "opcoes".`)
      return {
        ...type('Picklist'),
        OptionSet: {
          '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
          IsGlobal: false,
          OptionSetType: 'Picklist',
          Options: c.opcoes.map((o, i) => ({ Value: o.valor ?? 100000000 + i, Label: label(o.rotulo, language) })),
        },
      }
    }
    default:
      throw new Error('lookup é criado como relação (buildLookupRelationship).')
  }
}

/** Corpo de `POST RelationshipDefinitions` que cria um lookup (relação 1:N). */
export function buildLookupRelationship(table: string, c: ColumnInput, language = DEFAULT_LANGUAGE) {
  if (!c.tabelaAlvo) throw new Error(`Coluna ${c.nomeSchema}: lookup exige "tabelaAlvo".`)
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: `${c.nomeSchema}_${c.tabelaAlvo}_${table}`.toLowerCase().slice(0, 120),
    ReferencedEntity: c.tabelaAlvo,
    ReferencingEntity: table,
    Lookup: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: c.nomeSchema,
      DisplayName: label(c.rotulo, language),
      ...(c.descricao ? { Description: label(c.descricao, language) } : {}),
      RequiredLevel: required(c),
    },
    AssociatedMenuConfiguration: { Behavior: 'UseCollectionName', Group: 'Details', Order: 10000 },
    CascadeConfiguration: { Assign: 'NoCascade', Delete: 'RemoveLink', Merge: 'NoCascade', Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade' },
  }
}

/** Corpo de `POST EntityDefinitions` (tabela nova com a coluna principal de texto). */
export function buildTable(p: {
  nomeSchema: string
  rotulo: string
  rotuloPlural: string
  descricao?: string
  colunaPrincipal: { nomeSchema: string; rotulo: string; tamanhoMaximo?: number }
  propriedade: 'UserOwned' | 'OrganizationOwned'
  language?: number
}) {
  const language = p.language ?? DEFAULT_LANGUAGE
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: p.nomeSchema,
    DisplayName: label(p.rotulo, language),
    DisplayCollectionName: label(p.rotuloPlural, language),
    ...(p.descricao ? { Description: label(p.descricao, language) } : {}),
    OwnershipType: p.propriedade,
    HasActivities: false,
    HasNotes: false,
    Attributes: [
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        SchemaName: p.colunaPrincipal.nomeSchema,
        AttributeType: 'String',
        AttributeTypeName: { Value: 'StringType' },
        IsPrimaryName: true,
        RequiredLevel: { Value: 'SystemRequired', CanBeChanged: false },
        MaxLength: p.colunaPrincipal.tamanhoMaximo ?? 200,
        FormatName: { Value: 'Text' },
        DisplayName: label(p.colunaPrincipal.rotulo, language),
      },
    ],
  }
}

/** Chave alternativa/primária em `entitySet(k='v',k2=2)`. */
export function keyPath(keys: Record<string, string | number | boolean>): string {
  const parts = Object.entries(keys).map(([k, v]) => `${k}=${typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v}`)
  if (!parts.length) throw new Error('Informe ao menos uma chave.')
  return parts.join(',')
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Põe page/count/paging-cookie na tag `<fetch>` (substituindo os que já existirem). */
export function applyFetchPaging(xml: string, p: { page?: number; count?: number; pagingCookie?: string }): string {
  return xml.replace(/<fetch\b([^>]*?)(\/?)>/i, (_m, attrs: string, selfClose: string) => {
    let a = attrs.replace(/\s(page|count|paging-cookie)\s*=\s*("[^"]*"|'[^']*')/gi, '')
    if (p.count) a += ` count="${p.count}"`
    if (p.page) a += ` page="${p.page}"`
    if (p.pagingCookie) a += ` paging-cookie="${xmlEscape(p.pagingCookie)}"`
    return `<fetch${a}${selfClose}>`
  })
}

/** Nome da tabela principal (`<entity name="...">`) de um FetchXML. */
export const fetchXmlEntity = (xml: string): string | undefined => xml.match(/<entity\s+name\s*=\s*["']([^"']+)["']/i)?.[1]
