# Gaveta da manutenção passo a passo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trocar o corpo da gaveta única da manutenção por um guia passo a passo em três etapas (Agendar · Programar · Realizar), um passo por vez, com as exceções no menu "⋯", no molde da gaveta de multas.

**Architecture:**
- **Regra:** um módulo puro, `frota/domain/manutencaoEtapas.ts`, decide etapa, passo, prazo, feitos e extras a partir do detalhe da manutenção.
- **Tela:** um componente novo, `ManutencaoPassoAPasso.tsx`, desenha topo, barra, passo e feitos. A `GavetaManutencao` fica com a casca: carregar, `StaleError`, auditoria e "Abrir formulário".
- **Gravação:** os passos usam as Custom APIs do plano 1. Agendar ganha o `grau` opcional. Programar grava a linha da Geral com o `programarPatch` do Disparar. O detalhe passa a trazer a programação (linha da Geral) e a despesa ligada.

**Tech Stack:** React 18 + TypeScript (shell), Vitest + Testing Library, `@betinhos/ui`, Dataverse Web API e Custom APIs, plugin C# `Cr40f.Frota.Plugin` (xUnit).

**Spec:** `docs/superpowers/specs/2026-11-17-manutencoes-gaveta-passo-a-passo-design.md`

## Decisões deste plano

- **P1. "Já foi feita" em todas as etapas abertas.** "Concluir" fica no "⋯" de Agendar, Programar e Realizar, com o rótulo "Concluir por ele" em Realizar e "Já foi feita: concluir" antes disso. O plano 2 permite lançar depois do fato desde Solicitado (`acoesManutencao`), e esse caso continua existindo. É o único ponto além da letra da spec. A spec é atualizada na Tarefa 7.
- **P2. A gaveta busca a programação e a despesa no detalhe.** `detalheManutencao` faz duas leituras a mais:
  - a linha ativa da Geral por `_cr40f_om_value`;
  - a despesa por `_cr40f_manutencao_value`.

  Falha nessas leituras não derruba a gaveta: o campo vira `undefined` e o passo mostra "não foi possível ler a programação".
- **P3. Programar** grava na linha da Geral `cr40f_motorista` (bind), `cr40f_dataehorriodesada` (ISO UTC a partir do horário de São Paulo) e o `programarPatch()` (`cr40f_status` = 202410005, `new_foiprogramado` = true). O espelho do plano 1 leva a manutenção a Programado. Antes de gravar, o status é relido (`executarAcaoManutencao` com a ação nova `programar`).
- **P4. Ação nova `programar` no `ACOES_MANUTENCAO`**, só em AGENDADO. Em PROGRAMADO, mudar motorista ou saída é "Reagendar" ou a própria Geral.
- **P5. O estado da despesa vira um texto curto:**
  - anexo diferente de completo → "Aguardando a nota";
  - operacional Enviado → "Em conferência";
  - Validado → "Conferida";
  - Precisa corrigir → "Precisa corrigir";
  - Recusado → "Recusada";
  - Cancelado → "Cancelada".

  O link "abrir despesa" usa `abrirGavetaRegistro('cr40f_despesaoperacional', id)`.

## Global Constraints

- Nada altera o PROD. No DEV, só leitura até a Tarefa 7, exceto o Deploy depois do merge.
- **Sessões e implementador:** nunca `pnpm push`, `sitemap:*`, `push:plugin:*` nem `provision-*`. Sem migration: nada de schema muda.
- **Máquina local (8 GB):** vitest, tsc, dotnet e dev server rodam na Betinhos-Renan.
- **Status e choices:**
  - manutenção: Solicitado 0, Agendado 202410001, Programado 202410005, Realizado 202410002, Reprovado 100000002, Cancelado 100000001;
  - grau `cr40f_graudamanutencao`: Baixa 1, Média 2, Alta 3, Urgente 4.
- **Textos da tela, exatamente:** "Agendar", "Programar", "Realizar", "Quando vai ser?", "Quem leva e quando sai?", "Aguardando o motorista concluir no App", "Esperando há N dia(s)", "Atrasada desde DD/MM", "Concluir por ele", "Já foi feita: concluir", "Reagendar", "Reprovar", "Cancelar manutenção", "Corrigir classificação", "Abrir formulário".
- **UI:** só componentes e tokens do `@betinhos/ui` e classes `frota-*` existentes; nada de cor fixa nova. Funciona a 390 px de largura sem rolagem horizontal.
- **Repositório público:** sem dado pessoal real em teste ou mock. Os nomes do mock são fictícios.
- **Commits:** terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `packages/plugins/Cr40f.Frota.Plugin/Manutencao/Contratos.cs` | `AgendarPedido.Grau` (int?) |
| `packages/plugins/Cr40f.Frota.Plugin/Manutencao/Esquema.cs` | `M.Grau` |
| `packages/plugins/Cr40f.Frota.Plugin/Manutencao/ManutencaoService.cs` | grava o grau no Agendar |
| `packages/plugins/Cr40f.Frota.Plugin.Tests/AgendarTests.cs` | testes do grau |
| `apps/shell/src/pages/frota/data/types.ts` | `ProgramacaoManutencao`, `DespesaDaManutencao`, `DetalheManutencao` estendido |
| `apps/shell/src/pages/frota/data/source.ts` | `PedidoAgendar.grau`, `PedidoProgramar`, `programarManutencao` |
| `apps/shell/src/pages/frota/data/manutencaoDataverse.ts` | leituras extras do detalhe, grau, programar |
| `apps/shell/src/pages/frota/data/mock.ts` | o mesmo no mock |
| `apps/shell/src/pages/frota/data/hostSource.ts` | `programarManutencao` em `GRAVACOES` |
| `apps/shell/src/pages/frota/domain/transitions.ts` | ação `programar` |
| `apps/shell/src/pages/frota/domain/manutencaoEtapas.ts` (novo) | regra das etapas |
| `apps/shell/src/pages/frota/components/ManutencaoPassoAPasso.tsx` (novo) | o guia |
| `apps/shell/src/pages/frota/components/GavetaManutencao.tsx` | casca + guia |
| `apps/shell/src/pages/frota/frota.css` | barra de etapas, se faltar classe |
| `.claude/skills/verificar-shell/SKILL.md` | roteiro |
| `docs/superpowers/plans/2026-11-16-manutencoes-v2-descoberta.md` | seção 8 (Tarefa 1) |

---

### Tarefa 1: Conferência no DEV (só leitura)

**Files:**
- Modify: `docs/superpowers/plans/2026-11-16-manutencoes-v2-descoberta.md` (seção nova `## 8. Gaveta passo a passo (17/11/2026)`)

**Interfaces:**
- Produces: o nome da navegação do lookup `cr40f_motorista` em `cr40f_reservadeveculos` (para o `@odata.bind` da Tarefa 3), o entity set da Geral e a confirmação de `_cr40f_manutencao_value` na despesa.

- [ ] **Step 1: Ler a metadata pela Web API (Betinhos-Renan, `az` logado)**

```bash
BASE=https://org23b93544.crm2.dynamics.com; TOKEN=$(az account get-access-token --resource "$BASE/" --query accessToken -o tsv)
get() { curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" "$BASE/api/data/v9.2/$1"; echo; }
get "EntityDefinitions(LogicalName='cr40f_reservadeveculos')?\$select=EntitySetName"
get "EntityDefinitions(LogicalName='cr40f_reservadeveculos')/ManyToOneRelationships?\$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName&\$filter=ReferencingAttribute%20eq%20'cr40f_motorista'"
get "EntityDefinitions(LogicalName='cr40f_despesaoperacional')/Attributes(LogicalName='cr40f_manutencao')?\$select=LogicalName,AttributeType"
get "EntityDefinitions(LogicalName='cr40f_manutencoes')/Attributes(LogicalName='cr40f_graudamanutencao')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?\$select=LogicalName&\$expand=OptionSet(\$select=Options)"
```

Esperado:
- o entity set da Geral (no código, `cr40f_reservadeveculoses`);
- a navegação de `cr40f_motorista` (provável `cr40f_Motorista`);
- o atributo `cr40f_manutencao` do tipo Lookup;
- as opções de grau 1 a 4.

- [ ] **Step 2: Registrar e commitar**

Acrescente ao fim do arquivo:

```markdown
## 8. Gaveta passo a passo (17/11/2026)

- Geral: entity set `<EntitySetName>`; navegação do motorista `<ReferencingEntityNavigationPropertyName>` (bind `<nav>@odata.bind`: `/cr40f_funcionarioses(<id>)`).
- Despesa: `cr40f_manutencao` é Lookup; filtro `_cr40f_manutencao_value eq <id>`.
- Grau (`cr40f_graudamanutencao`): <valores e rótulos lidos>.
```

```bash
git add docs/superpowers/plans/2026-11-16-manutencoes-v2-descoberta.md
git commit -m "docs(frota): descoberta da gaveta passo a passo (metadata do DEV)"
```

---

### Tarefa 2: Agendar aceita o grau (plugin)

**Files:**
- Modify: `packages/plugins/Cr40f.Frota.Plugin/Manutencao/Contratos.cs` (classe `AgendarPedido`)
- Modify: `packages/plugins/Cr40f.Frota.Plugin/Manutencao/Esquema.cs` (classe `M`)
- Modify: `packages/plugins/Cr40f.Frota.Plugin/Manutencao/ManutencaoService.cs` (`Agendar`)
- Test: `packages/plugins/Cr40f.Frota.Plugin.Tests/AgendarTests.cs`

**Interfaces:**
- Produces: `RequestJson` do `cr40f_ManutencaoAgendar` aceita `"grau": 1|2|3|4` (opcional). Ausente, o grau não muda. Fora de 1..4, recusa com "Grau inválido.".

- [ ] **Step 1: Testes que falham** (acrescente na classe `AgendarTests`)

```csharp
    [Fact]
    public void Agendar_com_grau_grava_o_grau()
    {
        var memoria = new MemoriaService().Com(Manutencao(M.Solicitado));
        var pedido = Semana();
        pedido.Grau = 3;

        Servico(memoria).Agendar(pedido);

        Assert.Equal(3, memoria.Obter(M.Tabela, _manutencaoId).GetAttributeValue<OptionSetValue>(M.Grau).Value);
    }

    [Fact]
    public void Agendar_sem_grau_nao_mexe_no_grau()
    {
        var m = Manutencao(M.Solicitado);
        m[M.Grau] = new OptionSetValue(2);
        var memoria = new MemoriaService().Com(m);

        Servico(memoria).Agendar(Semana());

        Assert.Equal(2, memoria.Obter(M.Tabela, _manutencaoId).GetAttributeValue<OptionSetValue>(M.Grau).Value);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(5)]
    public void Agendar_com_grau_invalido_recusa(int grau)
    {
        var memoria = new MemoriaService().Com(Manutencao(M.Solicitado));
        var pedido = Semana();
        pedido.Grau = grau;

        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Servico(memoria).Agendar(pedido));
        Assert.Equal("Grau inválido.", erro.Message);
    }
```

Se o `MemoriaService` não tiver `Obter(tabela, id)`, use o método que os testes vizinhos usam para reler a manutenção. Confira em `MemoriaService.cs` e não crie um segundo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter "FullyQualifiedName~AgendarTests"`
Expected: erro de compilação: `'AgendarPedido' does not contain a definition for 'Grau'` e `'M' does not contain a definition for 'Grau'`.

- [ ] **Step 3: Implementar**

Em `Contratos.cs`, dentro de `AgendarPedido`, depois de `Comentario`:

```csharp
    /// <summary>Grau corrigido pelo gestor ao agendar (cr40f_graudamanutencao: 1 Baixa, 2 Média, 3 Alta, 4 Urgente). Ausente = não muda.</summary>
    [DataMember(Name = "grau")] public int? Grau { get; set; }
```

Em `Esquema.cs`, na classe `M`, nova linha depois de `ComentarioColaborador`:

```csharp
    public const string Grau = "cr40f_graudamanutencao";
```

Em `ManutencaoService.Agendar`:
- **validação:** logo depois de `var (inicio, fim) = Ciclo.ValidarJanela(...)`:

```csharp
        if (pedido.Grau is int g && (g < 1 || g > 4)) throw Ciclo.Erro("Grau inválido.");
```

- **gravação:** depois da linha do `ComentarioAoMotorista` no `patch`:

```csharp
        if (pedido.Grau is int grau) patch[M.Grau] = new OptionSetValue(grau);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests`
Expected: todos aprovados (99 + 4 novos).

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin packages/plugins/Cr40f.Frota.Plugin.Tests
git commit -m "feat(frota): Agendar da manutenção aceita o grau"
```

---

### Tarefa 3: Dados da gaveta: programação, despesa, grau e programar

**Files:**
- Modify: `apps/shell/src/pages/frota/data/types.ts`
- Modify: `apps/shell/src/pages/frota/data/source.ts`
- Modify: `apps/shell/src/pages/frota/data/manutencaoDataverse.ts`
- Modify: `apps/shell/src/pages/frota/data/mock.ts`
- Modify: `apps/shell/src/pages/frota/data/hostSource.ts:11`
- Modify: `apps/shell/src/pages/frota/domain/transitions.ts` (ação `programar`)
- Test: `apps/shell/src/pages/frota/data/manutencaoDataverse.test.ts`, `apps/shell/src/pages/frota/data/mock.test.ts`, `apps/shell/src/pages/frota/domain/transitions.test.ts` (se existir; senão no teste que cobre `acoesManutencao`, ache com `grep -rln acoesManutencao apps/shell/src --include=*.test.*`)

**Interfaces:**
- Consumes: a navegação do motorista e o entity set da Geral (Tarefa 1); o `programarPatch` de `apps/shell/src/pages/geral/domain/commands.ts`.
- Produces:

```ts
// types.ts
export type ProgramacaoManutencao = { geralId: string; motorista: Ref | null; saida: string | null /* ISO UTC */ }
export type DespesaDaManutencao = { id: string; statusOperacional: number | null; statusAnexo: number | null }
export type DetalheManutencao = Manutencao & {
  comentarioAoMotorista: string | null; comentarioColaborador: string | null; pagamento: number | null; realizadoPor: Ref | null
  fotosPedido: string[]; linkNotaFiscal: string | null; fotosFinais: string[]
  /** Linha ativa da Geral; null = não há; undefined = não foi possível ler. */
  programacao?: ProgramacaoManutencao | null
  /** Despesa ligada; null = não há; undefined = não foi possível ler. */
  despesa?: DespesaDaManutencao | null
}
// source.ts
export type PedidoAgendar = { manutencaoId: string; inicio: string; fim: string; comentario: string | null; grau?: number }
export type PedidoProgramar = { manutencaoId: string; geralId: string; motoristaId: string; saida: string /* ISO UTC */ }
// em ComandosManutencao:
  /** Grava motorista e saída na linha da Geral e marca Programado (mesmo patch do Disparar); o espelho leva a manutenção a Programado. */
  programarManutencao(pedido: PedidoProgramar): Promise<void>
// transitions.ts
export type AcaoManutencao = 'encaixar' | 'reprovar' | 'cancelar' | 'concluir' | 'programar'
// ACOES_MANUTENCAO[MANUT.AGENDADO] = ['encaixar', 'programar', 'cancelar', 'concluir']; rotuloAcao('programar') = 'Programar'
```

- [ ] **Step 1: Testes que falham** em `manutencaoDataverse.test.ts`, seguindo o padrão dos testes que já existem nesse arquivo (o mesmo `api` falso e o mesmo `fetch` falso da Custom API; reaproveite os helpers dele):

```ts
it('detalhe traz a linha ativa da Geral e a despesa', async () => {
  // api.retrieveRecord devolve a manutenção; api.retrieveMultipleRecords devolve, na ordem, a linha da Geral e a despesa
  const detalhe = await comandos.detalheManutencao('m1')
  expect(detalhe?.programacao).toEqual({ geralId: 'g1', motorista: { id: 'f1', label: 'Motorista Fictício' }, saida: '2026-11-24T13:00:00.000Z' })
  expect(detalhe?.despesa).toEqual({ id: 'd1', statusOperacional: 100000000, statusAnexo: 100000002 })
  expect(api.retrieveMultipleRecords).toHaveBeenCalledWith('cr40f_reservadeveculos', expect.stringContaining('_cr40f_om_value eq m1'))
  expect(api.retrieveMultipleRecords).toHaveBeenCalledWith('cr40f_despesaoperacional', expect.stringContaining('_cr40f_manutencao_value eq m1'))
})

it('detalhe continua quando a leitura da Geral falha (programacao undefined)', async () => {
  // retrieveMultipleRecords da Geral rejeita
  const detalhe = await comandos.detalheManutencao('m1')
  expect(detalhe).not.toBeNull()
  expect(detalhe?.programacao).toBeUndefined()
})

it('agendar manda o grau quando informado', async () => {
  await comandos.agendarManutencao({ manutencaoId: 'm1', inicio: '2026-11-23', fim: '2026-11-29', comentario: null, grau: 3 })
  expect(JSON.parse(corpoDaUltimaChamada().RequestJson)).toMatchObject({ grau: 3 })
})

it('programar grava motorista, saída e o patch do Disparar na linha da Geral', async () => {
  await comandos.programarManutencao({ manutencaoId: 'm1', geralId: 'g1', motoristaId: 'f1', saida: '2026-11-24T13:00:00.000Z' })
  expect(api.updateRecord).toHaveBeenCalledWith('cr40f_reservadeveculos', 'g1', {
    '<nav da Tarefa 1>@odata.bind': '/cr40f_funcionarioses(f1)',
    cr40f_dataehorriodesada: '2026-11-24T13:00:00.000Z',
    cr40f_status: 202410005,
    new_foiprogramado: true,
  })
})
```

Troque `<nav da Tarefa 1>` pelo nome lido. Os nomes `corpoDaUltimaChamada` e `comandos` são os do arquivo: use os helpers que ele já tem, com os nomes dele.

Teste no `transitions` (ou onde `acoesManutencao` é testado):

```ts
it('programar só em Agendado', () => {
  expect(acoesManutencao(MANUT.AGENDADO)).toEqual(['encaixar', 'programar', 'cancelar', 'concluir'])
  expect(acoesManutencao(MANUT.PROGRAMADO)).not.toContain('programar')
  expect(rotuloAcao('programar', MANUT.AGENDADO)).toBe('Programar')
})
```

Teste no `mock.test.ts`:

```ts
it('mock: programar leva a Programado e o detalhe mostra a programação', async () => {
  const source = createMockSource()
  const id = /* uma manutenção do mock em Agendado (veja os fixtures: m2 é Agendado) */ 'm2'
  const antes = await source.detalheManutencao(id)
  await source.programarManutencao({ manutencaoId: id, geralId: antes!.programacao!.geralId, motoristaId: 'p1', saida: '2026-11-24T13:00:00.000Z' })
  const depois = await source.detalheManutencao(id)
  expect(depois?.status).toBe(MANUT.PROGRAMADO)
  expect(depois?.programacao?.motorista?.id).toBe('p1')
})
```

Use os nomes reais do mock (`createMockSource` ou o que o arquivo exporta, e ids de pessoas do mock): leia o topo de `mock.ts`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/data src/pages/frota/domain`
Expected: falhas por `programarManutencao is not a function` e por `programacao`/`despesa` ausentes.

- [ ] **Step 3: Implementar**

`types.ts`: substitua `DetalheManutencao` pelo bloco de **Interfaces** e acrescente os dois tipos.

`source.ts`: acrescente `grau?: number` em `PedidoAgendar`, o tipo `PedidoProgramar` e o método na interface `ComandosManutencao`.

`transitions.ts`:

```ts
export type AcaoManutencao = 'encaixar' | 'reprovar' | 'cancelar' | 'concluir' | 'programar'
const ACOES_MANUTENCAO: Partial<Record<number, AcaoManutencao[]>> = {
  [MANUT.SOLICITADO]: ['encaixar', 'reprovar', 'cancelar', 'concluir'],
  [MANUT.AGENDADO]: ['encaixar', 'programar', 'cancelar', 'concluir'],
  [MANUT.PROGRAMADO]: ['encaixar', 'cancelar', 'concluir'],
}
const ROTULO_ACAO: Record<Exclude<AcaoManutencao, 'encaixar'>, string> = { reprovar: 'Reprovar', cancelar: 'Cancelar manutenção', concluir: 'Concluir', programar: 'Programar' }
```

`manutencaoDataverse.ts`, dentro de `criarComandosXrm`:

```ts
const GERAL = 'cr40f_reservadeveculos'
const NAV_MOTORISTA = '<nav da Tarefa 1>'

async function programacaoDe(id: string): Promise<ProgramacaoManutencao | null | undefined> {
  try {
    const r = await api.retrieveMultipleRecords(GERAL, `?$select=cr40f_reservadeveculosid,_cr40f_motorista_value,cr40f_dataehorriodesada&$filter=_cr40f_om_value eq ${guid(id)} and statecode eq 0&$top=1`)
    const row = r.entities[0]
    if (!row) return null
    const motoristaId = typeof row._cr40f_motorista_value === 'string' ? cleanId(row._cr40f_motorista_value) : null
    const nome = row['_cr40f_motorista_value@OData.Community.Display.V1.FormattedValue']
    return {
      geralId: cleanId(String(row.cr40f_reservadeveculosid)),
      motorista: motoristaId ? { id: motoristaId, label: typeof nome === 'string' ? nome : '' } : null,
      saida: typeof row.cr40f_dataehorriodesada === 'string' ? row.cr40f_dataehorriodesada : null,
    }
  } catch {
    return undefined
  }
}

async function despesaDe(id: string): Promise<DespesaDaManutencao | null | undefined> {
  try {
    const r = await api.retrieveMultipleRecords(TABELA_DESPESA, `?$select=cr40f_despesaoperacionalid,cr40f_statusoperacional,cr40f_statusanexo&$filter=_cr40f_manutencao_value eq ${guid(id)} and statecode eq 0&$orderby=createdon desc&$top=1`)
    const row = r.entities[0]
    if (!row) return null
    const num = (v: unknown) => (typeof v === 'number' ? v : null)
    return { id: cleanId(String(row.cr40f_despesaoperacionalid)), statusOperacional: num(row.cr40f_statusoperacional), statusAnexo: num(row.cr40f_statusanexo) }
  } catch {
    return undefined
  }
}
```

`TABELA_DESPESA` está declarada mais abaixo no arquivo. Mova a declaração para o topo, junto das outras constantes, e não a duplique. Confira se o `retrieveMultipleRecords` do `XrmWebApi` devolve as anotações de valor formatado. Se não devolver, siga o padrão que o arquivo usa para ler o nome de um lookup (procure `FormattedValue` em `mappers.ts`).

`detalheManutencao` passa a terminar assim:

```ts
      const detalhe = mapDetalheManutencao(row, await deps.comportamentos())
      const [programacao, despesa] = await Promise.all([programacaoDe(id), despesaDe(id)])
      return { ...detalhe, programacao, despesa }
```

`agendarManutencao`:

```ts
      await comando('cr40f_ManutencaoAgendar', { manutencaoId: guid(p.manutencaoId), inicio: p.inicio, fim: p.fim, comentario: p.comentario, ...(p.grau ? { grau: p.grau } : {}) }, 'Não foi possível agendar a manutenção')
```

Método novo:

```ts
    async programarManutencao(p) {
      await api.updateRecord(GERAL, guid(p.geralId), {
        [`${NAV_MOTORISTA}@odata.bind`]: `/${ENTITY_SET.funcionarios}(${guid(p.motoristaId)})`,
        cr40f_dataehorriodesada: p.saida,
        ...programarPatch(),
      })
    },
```

com `import { programarPatch } from '../../geral/domain/commands'`.

`hostSource.ts:11`: acrescente `'programarManutencao'` em `GRAVACOES`, logo depois de `'agendarManutencao'`.

`mock.ts`:
- **dados:** guarde num `Map<string, ProgramacaoManutencao>` a linha da Geral de cada manutenção encaixada. `agendarManutencao` cria ou zera a linha (`{ geralId: 'g-' + id, motorista: null, saida: null }`), aplica `grau` se vier e volta o status a AGENDADO.
- **detalhe:** `detalheManutencao` devolve `programacao: linhas.get(id) ?? null` e `despesa`: `null`, ou, se a manutenção for REALIZADO no mock, `{ id: 'd-' + id, statusOperacional: 100000000, statusAnexo: 100000002 }`.
- **programar:** `programarManutencao` exige status AGENDADO (senão lança "Só dá para programar uma manutenção agendada."), grava motorista (de `pessoas`), saída e status PROGRAMADO.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota && pnpm --filter @betinhos/shell typecheck`
Expected: tudo verde, `tsc --noEmit` sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/frota/data apps/shell/src/pages/frota/domain/transitions.ts apps/shell/src/pages/frota/domain/*.test.ts
git commit -m "feat(frota): detalhe da manutenção com programação e despesa; programar e grau no agendar"
```

---

### Tarefa 4: Regra das etapas (`manutencaoEtapas.ts`)

**Files:**
- Create: `apps/shell/src/pages/frota/domain/manutencaoEtapas.ts`
- Test: `apps/shell/src/pages/frota/domain/manutencaoEtapas.test.ts`

**Interfaces:**
- Consumes: `DetalheManutencao`, `ProgramacaoManutencao`, `DespesaDaManutencao` (Tarefa 3); `atrasada`, `fimDaJanela`, `rotuloJanela`, `lerJanela`, `valoresJanelaIniciais`, `type ValoresJanela` (`janela.ts`); `daysBetween`, `diaSP`, `formatBR`, `horaSP` (`dates.ts`); `GRAU`, `MANUT`, `LIMITE`, `label` (`schema.ts`); `brl` (`format.ts`).
- Produces:

```ts
export type Etapa = 'agendar' | 'programar' | 'realizar' | 'realizada' | 'reprovada' | 'cancelada'
export type Passo = 'Agendar' | 'Programar' | 'AguardarConclusao'
export type Extra = 'reagendar' | 'reprovar' | 'cancelar' | 'concluir' | 'corrigirClassificacao'
export type Prazo = { rotulo: string; texto: string; perigo: boolean }
export type Situacao = { etapa: Etapa; passo: Passo | null; prazo: Prazo | null; feitos: string[]; extras: Extra[]; /** 0..2 na barra; null = todas feitas */ atual: number | null }
export const ETAPAS: readonly { chave: 'agendar' | 'programar' | 'realizar'; rotulo: string }[]
export function avaliar(m: DetalheManutencao, hoje: string): Situacao
export function rotuloExtra(extra: Extra, etapa: Etapa): string
export type ValoresAgendar = ValoresJanela & { grau: number | null }
export function valoresAgendarIniciais(m: DetalheManutencao, hoje: string): ValoresAgendar
export function lerAgendar(v: ValoresAgendar, hoje: string): { erros: Partial<Record<'grau' | 'dia' | 'semana' | 'comentario', string>>; pedido: { inicio: string; fim: string; comentario: string | null; grau: number } | null }
export type ValoresProgramar = { motoristaId: string | null; saida: string /* 'YYYY-MM-DDTHH:mm', horário de SP */ }
export function lerProgramar(v: ValoresProgramar, m: Pick<DetalheManutencao, 'janelaInicio' | 'janelaFim'>): { erros: Partial<Record<'motorista' | 'saida', string>>; saidaIso: string | null; foraDaJanela: boolean }
export function textoDespesa(d: DespesaDaManutencao): string
export const textoSaida: (iso: string) => string  // "24/11/2026 10:00"
```

- [ ] **Step 1: Testes que falham**

```ts
// apps/shell/src/pages/frota/domain/manutencaoEtapas.test.ts
import { describe, expect, it } from 'vitest'
import { MANUT } from '../data/schema'
import type { DetalheManutencao } from '../data/types'
import { avaliar, lerAgendar, lerProgramar, rotuloExtra, textoDespesa, valoresAgendarIniciais } from './manutencaoEtapas'

const HOJE = '2026-11-17'
const base: DetalheManutencao = {
  id: 'm1', codigo: 'OM-1', descricao: 'Revisão fictícia', status: MANUT.SOLICITADO, grau: 2, tipo: null, agendarPara: null, janelaInicio: null, janelaFim: null,
  dataAprovacao: null, kmRealizado: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: 60000,
  veiculo: { id: 'v1', label: 'TST4D44' }, solicitante: { id: 'p1', label: 'Motorista Fictício' }, criadoEm: '2026-11-14T12:00:00Z', servicos: [], categorias: [],
  origemClassificacao: null, confiancaIa: null, comentarioAoMotorista: null, comentarioColaborador: null, pagamento: null, realizadoPor: null, fotosPedido: [],
  linkNotaFiscal: null, fotosFinais: [], programacao: null, despesa: null,
}
const m = (patch: Partial<DetalheManutencao>): DetalheManutencao => ({ ...base, ...patch })
const agendada = m({ status: MANUT.AGENDADO, janelaInicio: '2026-11-23', janelaFim: '2026-11-29', dataAprovacao: '2026-11-17', programacao: { geralId: 'g1', motorista: null, saida: '2026-11-23T03:00:00.000Z' } })
const programada = m({ ...agendada, status: MANUT.PROGRAMADO, programacao: { geralId: 'g1', motorista: { id: 'p2', label: 'Outro Fictício' }, saida: '2026-11-24T13:00:00.000Z' } })

describe('avaliar', () => {
  it('Solicitado: etapa agendar, passo Agendar, esperando há 3 dias', () => {
    const s = avaliar(base, HOJE)
    expect(s).toMatchObject({ etapa: 'agendar', passo: 'Agendar', atual: 0, prazo: { rotulo: 'Esperando', texto: 'há 3 dias', perigo: false } })
    expect(s.extras).toEqual(['reprovar', 'cancelar', 'concluir'])
    expect(s.feitos).toEqual([])
  })
  it('Agendado: etapa programar, prazo é a janela, feito do agendamento', () => {
    const s = avaliar(agendada, HOJE)
    expect(s).toMatchObject({ etapa: 'programar', passo: 'Programar', atual: 1, prazo: { rotulo: 'Janela', perigo: false } })
    expect(s.prazo?.texto).toBe('23 a 29/11')
    expect(s.feitos).toEqual(['Agendada em 17/11/2026 para a semana de 23/11 a 29/11/2026 · Média'])
    expect(s.extras).toEqual(['reagendar', 'cancelar', 'concluir'])
  })
  it('Programado: etapa realizar, aguardando conclusão, feito da programação', () => {
    const s = avaliar(programada, HOJE)
    expect(s).toMatchObject({ etapa: 'realizar', passo: 'AguardarConclusao', atual: 2 })
    expect(s.feitos[1]).toBe('Programada: Outro Fictício, saída 24/11/2026 10:00')
    expect(s.extras).toEqual(['concluir', 'reagendar', 'cancelar'])
  })
  it('janela vencida: prazo Atrasada desde o fim, em perigo', () => {
    const s = avaliar(m({ ...agendada, janelaInicio: '2026-11-09', janelaFim: '2026-11-15' }), HOJE)
    expect(s.prazo).toEqual({ rotulo: 'Atrasada', texto: 'desde 15/11', perigo: true })
  })
  it('Realizado: sem passo, prazo é o valor, extra só corrigir classificação', () => {
    const s = avaliar(m({ ...programada, status: MANUT.REALIZADO, valor: 1240, dataManutencao: '2026-11-24T13:00:00Z' }), HOJE)
    expect(s).toMatchObject({ etapa: 'realizada', passo: null, atual: null, extras: ['corrigirClassificacao'] })
    expect(s.prazo).toMatchObject({ rotulo: 'Valor', perigo: false })
    expect(s.feitos.at(-1)).toBe('Realizada em 24/11/2026')
  })
  it('Reprovada para em Agendar, sem extras, com o motivo nos feitos', () => {
    const s = avaliar(m({ status: MANUT.REPROVADO, comentarioAprovador: 'Duplicada' }), HOJE)
    expect(s).toMatchObject({ etapa: 'reprovada', passo: null, atual: 0, extras: [], prazo: null })
    expect(s.feitos).toEqual(['Reprovada: Duplicada'])
  })
  it('Cancelada depois de programada para em Realizar', () => {
    const s = avaliar(m({ ...programada, status: MANUT.CANCELADO, comentarioAprovador: null }), HOJE)
    expect(s).toMatchObject({ etapa: 'cancelada', atual: 2, extras: [] })
    expect(s.feitos.at(-1)).toBe('Cancelada')
  })
})

describe('rotuloExtra', () => {
  it('concluir muda de nome em Realizar', () => {
    expect(rotuloExtra('concluir', 'realizar')).toBe('Concluir por ele')
    expect(rotuloExtra('concluir', 'agendar')).toBe('Já foi feita: concluir')
    expect(rotuloExtra('cancelar', 'programar')).toBe('Cancelar manutenção')
  })
})

describe('lerAgendar', () => {
  it('começa com o grau do pedido e exige grau', () => {
    const v = valoresAgendarIniciais(base, HOJE)
    expect(v.grau).toBe(2)
    expect(lerAgendar({ ...v, grau: null }, HOJE).erros.grau).toBe('Escolha o grau')
  })
  it('devolve o pedido com a janela, o comentário e o grau', () => {
    const v = { ...valoresAgendarIniciais(base, HOJE), modo: 'semana' as const, semana: '2026-11-23', grau: 3 }
    expect(lerAgendar(v, HOJE).pedido).toEqual({ inicio: '2026-11-23', fim: '2026-11-29', comentario: null, grau: 3 })
  })
})

describe('lerProgramar', () => {
  it('exige motorista e saída', () => {
    expect(lerProgramar({ motoristaId: null, saida: '' }, agendada).erros).toEqual({ motorista: 'Escolha o motorista', saida: 'Informe a data e hora de saída' })
  })
  it('converte o horário de São Paulo para UTC e diz se ficou fora da janela', () => {
    expect(lerProgramar({ motoristaId: 'p2', saida: '2026-11-24T10:00' }, agendada)).toEqual({ erros: {}, saidaIso: '2026-11-24T13:00:00.000Z', foraDaJanela: false })
    expect(lerProgramar({ motoristaId: 'p2', saida: '2026-11-30T10:00' }, agendada).foraDaJanela).toBe(true)
  })
})

describe('textoDespesa', () => {
  it('anexo incompleto vem antes do status operacional', () => {
    expect(textoDespesa({ id: 'd', statusOperacional: 100000002, statusAnexo: 100000001 })).toBe('Aguardando a nota')
    expect(textoDespesa({ id: 'd', statusOperacional: 100000000, statusAnexo: 100000002 })).toBe('Em conferência')
    expect(textoDespesa({ id: 'd', statusOperacional: 100000002, statusAnexo: 100000002 })).toBe('Conferida')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/domain/manutencaoEtapas.test.ts`
Expected: `Failed to resolve import "./manutencaoEtapas"`.

- [ ] **Step 3: Implementar**

```ts
// apps/shell/src/pages/frota/domain/manutencaoEtapas.ts
import { daysBetween, diaSP, formatBR, horaSP } from '../data/dates'
import { brl } from '../data/format'
import { GRAU, LIMITE, MANUT, label } from '../data/schema'
import type { DespesaDaManutencao, DetalheManutencao } from '../data/types'
import { atrasada, fimDaJanela, lerJanela, rotuloJanela, valoresJanelaIniciais, type ValoresJanela } from './janela'

/** Guia da gaveta da manutenção (spec 2026-11-17-manutencoes-gaveta-passo-a-passo): três etapas, um passo por vez. */
export type Etapa = 'agendar' | 'programar' | 'realizar' | 'realizada' | 'reprovada' | 'cancelada'
export type Passo = 'Agendar' | 'Programar' | 'AguardarConclusao'
export type Extra = 'reagendar' | 'reprovar' | 'cancelar' | 'concluir' | 'corrigirClassificacao'
export type Prazo = { rotulo: string; texto: string; perigo: boolean }
export type Situacao = { etapa: Etapa; passo: Passo | null; prazo: Prazo | null; feitos: string[]; extras: Extra[]; atual: number | null }

export const ETAPAS = [
  { chave: 'agendar', rotulo: 'Agendar' }, { chave: 'programar', rotulo: 'Programar' }, { chave: 'realizar', rotulo: 'Realizar' },
] as const

export const textoSaida = (iso: string) => `${formatBR(diaSP(iso))} ${horaSP(iso)}`
const ddmm = (dia: string) => formatBR(dia).slice(0, 5)

function prazoDe(m: DetalheManutencao, etapa: Etapa, hoje: string): Prazo | null {
  if (etapa === 'reprovada' || etapa === 'cancelada') return null
  if (etapa === 'realizada') return { rotulo: 'Valor', texto: brl(m.valor), perigo: false }
  if (atrasada(m, hoje)) return { rotulo: 'Atrasada', texto: `desde ${ddmm(fimDaJanela(m)!)}`, perigo: true }
  if (etapa === 'agendar') {
    const dias = Math.max(0, daysBetween(diaSP(m.criadoEm) ?? hoje, hoje))
    return { rotulo: 'Esperando', texto: `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`, perigo: false }
  }
  if (m.janelaInicio && m.janelaFim) {
    const texto = m.janelaInicio === m.janelaFim ? ddmm(m.janelaInicio) : `${m.janelaInicio.slice(8, 10)} a ${ddmm(m.janelaFim)}`
    return { rotulo: 'Janela', texto, perigo: false }
  }
  return null
}

function feitosDe(m: DetalheManutencao): string[] {
  const linhas: string[] = []
  if (m.dataAprovacao && m.janelaInicio && m.janelaFim) linhas.push(`Agendada em ${formatBR(m.dataAprovacao)} para ${rotuloJanela({ inicio: m.janelaInicio, fim: m.janelaFim }).toLowerCase()} · ${label(GRAU, m.grau)}`)
  const p = m.programacao
  if (p?.motorista && p.saida && (m.status === MANUT.PROGRAMADO || m.status === MANUT.REALIZADO || m.status === MANUT.CANCELADO)) linhas.push(`Programada: ${p.motorista.label}, saída ${textoSaida(p.saida)}`)
  if (m.status === MANUT.REALIZADO && m.dataManutencao) linhas.push(`Realizada em ${formatBR(diaSP(m.dataManutencao))}`)
  if (m.status === MANUT.REPROVADO) linhas.push(m.comentarioAprovador ? `Reprovada: ${m.comentarioAprovador}` : 'Reprovada')
  if (m.status === MANUT.CANCELADO) linhas.push(m.comentarioAprovador ? `Cancelada: ${m.comentarioAprovador}` : 'Cancelada')
  return linhas
}

export function avaliar(m: DetalheManutencao, hoje: string): Situacao {
  let etapa: Etapa
  let passo: Passo | null = null
  let extras: Extra[] = []
  let atual: number | null
  switch (m.status) {
    case MANUT.AGENDADO: etapa = 'programar'; passo = 'Programar'; extras = ['reagendar', 'cancelar', 'concluir']; atual = 1; break
    case MANUT.PROGRAMADO: etapa = 'realizar'; passo = 'AguardarConclusao'; extras = ['concluir', 'reagendar', 'cancelar']; atual = 2; break
    case MANUT.REALIZADO: etapa = 'realizada'; extras = ['corrigirClassificacao']; atual = null; break
    case MANUT.REPROVADO: etapa = 'reprovada'; atual = 0; break
    case MANUT.CANCELADO: etapa = 'cancelada'; atual = m.programacao?.motorista ? 2 : m.janelaInicio ? 1 : 0; break
    default: etapa = 'agendar'; passo = 'Agendar'; extras = ['reprovar', 'cancelar', 'concluir']; atual = 0
  }
  return { etapa, passo, prazo: prazoDe(m, etapa, hoje), feitos: feitosDe(m), extras, atual }
}

const ROTULO_EXTRA: Record<Extra, string> = { reagendar: 'Reagendar', reprovar: 'Reprovar', cancelar: 'Cancelar manutenção', concluir: 'Já foi feita: concluir', corrigirClassificacao: 'Corrigir classificação' }
export const rotuloExtra = (extra: Extra, etapa: Etapa) => (extra === 'concluir' && etapa === 'realizar' ? 'Concluir por ele' : ROTULO_EXTRA[extra])

export type ValoresAgendar = ValoresJanela & { grau: number | null }
export const valoresAgendarIniciais = (m: DetalheManutencao, hoje: string): ValoresAgendar => ({
  ...valoresJanelaIniciais(m.janelaInicio && m.janelaFim ? { inicio: m.janelaInicio, fim: m.janelaFim } : null, hoje, m.comentarioAoMotorista), grau: m.grau,
})

export function lerAgendar(v: ValoresAgendar, hoje: string) {
  const leitura = lerJanela(v, hoje, LIMITE.comentarioAoMotorista)
  const erros: Partial<Record<'grau' | 'dia' | 'semana' | 'comentario', string>> = { ...leitura.erros }
  if (v.grau === null) erros.grau = 'Escolha o grau'
  if (Object.keys(erros).length || !leitura.janela || v.grau === null) return { erros, pedido: null }
  return { erros, pedido: { inicio: leitura.janela.inicio, fim: leitura.janela.fim, comentario: leitura.comentario, grau: v.grau } }
}

export type ValoresProgramar = { motoristaId: string | null; saida: string }
export function lerProgramar(v: ValoresProgramar, m: Pick<DetalheManutencao, 'janelaInicio' | 'janelaFim'>) {
  const erros: Partial<Record<'motorista' | 'saida', string>> = {}
  if (!v.motoristaId) erros.motorista = 'Escolha o motorista'
  const data = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.saida) ? new Date(`${v.saida}:00-03:00`) : null
  if (!data || Number.isNaN(data.getTime())) erros.saida = 'Informe a data e hora de saída'
  if (Object.keys(erros).length || !data) return { erros, saidaIso: null, foraDaJanela: false }
  const dia = v.saida.slice(0, 10)
  const foraDaJanela = !!m.janelaInicio && !!m.janelaFim && (dia < m.janelaInicio || dia > m.janelaFim)
  return { erros, saidaIso: data.toISOString(), foraDaJanela }
}

const ANEXO_COMPLETO = 100000002
const OPERACIONAL: Record<number, string> = { 100000000: 'Em conferência', 100000001: 'Precisa corrigir', 100000002: 'Conferida', 100000003: 'Recusada', 100000004: 'Cancelada' }
export const textoDespesa = (d: DespesaDaManutencao) => (d.statusAnexo !== ANEXO_COMPLETO ? 'Aguardando a nota' : OPERACIONAL[d.statusOperacional ?? -1] ?? 'Em conferência')
```

Se `rotuloJanela` não devolver exatamente "Semana de 23/11 a 29/11/2026", ajuste a expectativa do teste ao formato real do `rotuloJanela`, com a primeira letra minúscula no meio da frase. Não mude o `rotuloJanela`: outras telas usam.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/domain/manutencaoEtapas.test.ts && pnpm --filter @betinhos/shell typecheck`
Expected: PASS, tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/frota/domain/manutencaoEtapas.ts apps/shell/src/pages/frota/domain/manutencaoEtapas.test.ts
git commit -m "feat(frota): regra das etapas da manutenção (Agendar, Programar, Realizar)"
```

---

### Tarefa 5: O guia (`ManutencaoPassoAPasso.tsx`)

**Files:**
- Create: `apps/shell/src/pages/frota/components/ManutencaoPassoAPasso.tsx`
- Modify: `apps/shell/src/pages/frota/frota.css` (classes `frota-etapas*` da barra, se não houver equivalente; procure primeiro a barra da multa: `grep -n "etapa" apps/shell/src/pages/frota/*.css`)
- Test: `apps/shell/src/pages/frota/components/ManutencaoPassoAPasso.test.tsx`

**Interfaces:**
- Consumes: Tarefa 4 inteira; `executarAcaoManutencao`, `desfechoDaAcao`, `StaleError` (`transitions.ts`); `useOpcoesBusca` (`components/useOpcoesBusca.ts`); `JanelaCampos` (`components/JanelaCampos.tsx`); `abrirGavetaRegistro` (`app/registroAberto.ts`); `Alert`, `Button`, `ChoiceGroup`, `Radio`, `Field`, `Input`, `Menu`, `Select`, `StatusBadge` (`@betinhos/ui`; o `MultaPassoAPasso` da branch `t3/revisar-processo-multas` usa os mesmos, veja com `git show origin/t3/revisar-processo-multas:apps/shell/src/pages/frota/components/MultaPassoAPasso.tsx`).
- Produces:

```ts
export type AbrirExtra = (extra: Extra) => void
type Props = {
  source: DataSource
  m: DetalheManutencao
  hoje: string
  /** Gravou um passo: a gaveta recarrega e avisa a lista. */
  onFeito: (mensagem: string) => void
  /** StaleError: a gaveta recarrega e decide (como hoje). */
  onDesatualizada: () => void
  /** Item do "⋯": a gaveta abre o formulário da exceção (Reagendar, Reprovar, Cancelar, Concluir, Corrigir classificação). */
  onExtra: AbrirExtra
}
export function ManutencaoPassoAPasso(props: Props): JSX.Element
```

**Comportamento:**
- **Topo:** `"<placa> · <descrição>"` em `<h2>`; embaixo, "Grau · pedido por <solicitante>" (ou, em Realizar, "<grau> · <motorista> leva em <saída>"); à direita, `prazo.rotulo` pequeno e `prazo.texto` em destaque, com `data-perigo` e cor de perigo do DS quando `perigo`.
- **Barra:** `<ol aria-label="Etapas">` com os 3 `ETAPAS`. Cada `<li>` tem `aria-current="step"` na `atual`, ✓ nas anteriores, cinza (`data-parada`) quando a etapa é `reprovada` ou `cancelada`, e todas com ✓ em `realizada`.
- **Passo:**
  - **`Agendar`:** título "Quando vai ser?"; grau por rádio (Urgente, Alta, Média, Baixa, valores de `GRAU`); `JanelaCampos`; botão "Agendar". Grava `executarAcaoManutencao(source, m, 'encaixar', () => source.agendarManutencao({ manutencaoId: m.id, ...pedido }))` dentro de `desfechoDaAcao`. Sucesso → `onFeito('Manutenção agendada: <rotuloJanela>.')`.
  - **`Programar`:** título "Quem leva e quando sai?"; `Select` de motorista pesquisável (`useOpcoesBusca` com `source.buscarFuncionarios`); `Input type="datetime-local"` "Saída", que começa em `<janelaInicio>T08:00`; `Alert tone="warning"` "A saída fica fora da janela (<rotuloJanela>). Grava assim mesmo." quando `foraDaJanela`; botão "Programar". Grava com `executarAcaoManutencao(source, m, 'programar', () => source.programarManutencao({ manutencaoId: m.id, geralId: m.programacao!.geralId, motoristaId, saida: saidaIso }))`.
    - `programacao === null`: `Alert` "Esta manutenção não tem linha na Geral; reagende para criar." e botão "Reagendar", que chama `onExtra('reagendar')`.
    - `programacao === undefined`: `Alert` "Não foi possível ler a programação. Feche e abra a gaveta de novo.".
    - Nota abaixo: "Também dá para programar pela linha na Geral."
  - **`AguardarConclusao`:** título "Aguardando o motorista concluir no App"; `Alert tone="info"` "<motorista> leva o carro em <saída>, paga e conclui pelo App com a nota."
  - **`realizada`:** título "Realizada", com:
    - serviços (rótulos das categorias, como na `ClassificacaoManutencao` em leitura);
    - km, data, valor, pagamento, estabelecimento e quem realizou;
    - nota e fotos (links, como o `Arquivos` da gaveta atual; mova `Arquivos` para este arquivo e exporte);
    - linha "Despesa": `textoDespesa` e botão-link "abrir despesa" → `abrirGavetaRegistro('cr40f_despesaoperacional', despesa.id)`. Despesa `null`: "Sem despesa ligada"; `undefined`: "Não foi possível ler a despesa".
  - **`reprovada`/`cancelada`:** `Alert tone="neutral"` com o último feito ("Reprovada: motivo").
- **Feitos:** `<ul>` com `situacao.feitos`, em texto secundário, abaixo do passo, exceto em `reprovada`/`cancelada`, onde o alerta já diz.
- **"⋯":** `Menu` com `situacao.extras` mapeados por `rotuloExtra`, que chamam `onExtra`. Sem extras, sem botão.
- **Erros:** falha do servidor vira `Alert tone="danger" title="Não foi possível gravar"` no passo; o digitado fica.
- **Foco:** ao montar um passo novo, foco no primeiro campo; o botão principal desabilita durante a gravação (`loading`).

- [ ] **Step 1: Testes que falham**

```tsx
// apps/shell/src/pages/frota/components/ManutencaoPassoAPasso.test.tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MANUT } from '../data/schema'
import type { DetalheManutencao } from '../data/types'
import { ManutencaoPassoAPasso } from './ManutencaoPassoAPasso'

const HOJE = '2026-11-17'
// Mesmos fixtures do manutencaoEtapas.test.ts (base, agendada, programada): copie-os para cá.

function montar(m: DetalheManutencao, source = fonte()) {
  const props = { source, m, hoje: HOJE, onFeito: vi.fn(), onDesatualizada: vi.fn(), onExtra: vi.fn() }
  render(<ManutencaoPassoAPasso {...props} />)
  return props
}
function fonte() {
  return {
    currentStatus: vi.fn(async () => MANUT.SOLICITADO),
    agendarManutencao: vi.fn(async () => {}),
    programarManutencao: vi.fn(async () => {}),
    buscarFuncionarios: vi.fn(async () => [{ id: 'p2', nome: 'Outro Fictício' }]),
  } as unknown as Parameters<typeof ManutencaoPassoAPasso>[0]['source']
}

describe('ManutencaoPassoAPasso', () => {
  it('mostra só o passo Agendar, com a etapa 1 atual', () => {
    montar(base)
    expect(screen.getByRole('heading', { name: 'Quando vai ser?' })).toBeInTheDocument()
    expect(screen.queryByText('Quem leva e quando sai?')).not.toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Etapas' })).getByText('Agendar').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('há 3 dias')).toBeInTheDocument()
  })

  it('Agendar chama a API com o grau escolhido', async () => {
    const props = montar(base)
    await userEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    await userEvent.click(screen.getByRole('button', { name: 'Agendar' }))
    expect(props.source.agendarManutencao).toHaveBeenCalledWith(expect.objectContaining({ manutencaoId: 'm1', grau: 3 }))
    expect(props.onFeito).toHaveBeenCalled()
  })

  it('Programar exige motorista e avisa fora da janela, sem bloquear', async () => {
    const source = fonte()
    ;(source.currentStatus as ReturnType<typeof vi.fn>).mockResolvedValue(MANUT.AGENDADO)
    const props = montar(agendada, source)
    await userEvent.click(screen.getByRole('button', { name: 'Programar' }))
    expect(screen.getByText('Escolha o motorista')).toBeInTheDocument()
    expect(source.programarManutencao).not.toHaveBeenCalled()
    // escolher o motorista no Select (siga como o teste do ConcluirManutencaoForm escolhe "Quem realizou")
    // trocar a saída para 2026-11-30T10:00
    expect(screen.getByText(/fica fora da janela/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Programar' }))
    expect(source.programarManutencao).toHaveBeenCalledWith({ manutencaoId: 'm1', geralId: 'g1', motoristaId: 'p2', saida: '2026-11-30T13:00:00.000Z' })
    expect(props.onFeito).toHaveBeenCalled()
  })

  it('Programado mostra aguardando o App e o ⋯ com Concluir por ele', async () => {
    const props = montar(programada)
    expect(screen.getByRole('heading', { name: 'Aguardando o motorista concluir no App' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mais ações' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Concluir por ele' }))
    expect(props.onExtra).toHaveBeenCalledWith('concluir')
  })

  it('Realizada mostra a despesa e abre a gaveta dela', async () => {
    montar({ ...programada, status: MANUT.REALIZADO, valor: 1240, despesa: { id: 'd1', statusOperacional: 100000000, statusAnexo: 100000002 } })
    expect(screen.getByText('Em conferência')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'abrir despesa' })).toBeInTheDocument()
  })

  it('Reprovada: barra parada, motivo, sem botão nem ⋯', () => {
    montar({ ...base, status: MANUT.REPROVADO, comentarioAprovador: 'Duplicada' })
    expect(screen.getByText('Reprovada: Duplicada')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mais ações' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agendar' })).not.toBeInTheDocument()
  })

  it('sem linha na Geral, Programar oferece Reagendar', async () => {
    const props = montar({ ...agendada, programacao: null })
    expect(screen.getByText(/não tem linha na Geral/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reagendar' }))
    expect(props.onExtra).toHaveBeenCalledWith('reagendar')
  })
})
```

Os dois comentários do teste de Programar viram código. Escolha o motorista e mude a saída do mesmo jeito que `ConcluirManutencaoForm.test.tsx` faz com o `Select` e o campo de data. Leia esse arquivo e copie o padrão.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/components/ManutencaoPassoAPasso.test.tsx`
Expected: `Failed to resolve import "./ManutencaoPassoAPasso"`.

- [ ] **Step 3: Implementar** o componente conforme **Comportamento**. Estrutura e estilos:
  - a mesma da `MultaPassoAPasso`: cabeçalho, `<ol>` da barra, um `<section>` do passo e o `Menu` "⋯" com `aria-label="Mais ações"`;
  - estilos com classes `frota-*` e tokens `--bt-*`;
  - se precisar, crie `.frota-etapas`, `.frota-etapas__item`, `[aria-current="step"]`, `[data-feita]` e `[data-parada]` em `frota.css`, iguais às da barra da multa quando ela existir no arquivo.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/components/ManutencaoPassoAPasso.test.tsx && pnpm --filter @betinhos/shell typecheck`
Expected: PASS, tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/frota/components/ManutencaoPassoAPasso.tsx apps/shell/src/pages/frota/components/ManutencaoPassoAPasso.test.tsx apps/shell/src/pages/frota/frota.css
git commit -m "feat(frota): guia passo a passo da manutenção"
```

---

### Tarefa 6: A gaveta usa o guia

**Files:**
- Modify: `apps/shell/src/pages/frota/components/GavetaManutencao.tsx`
- Test: `apps/shell/src/pages/frota/components/GavetaManutencao.test.tsx`, `apps/shell/src/app/GavetaRegistro.test.tsx` (se quebrar)

**Interfaces:**
- Consumes: `ManutencaoPassoAPasso`, `type Extra` (Tarefas 4 e 5); os formulários `EncaixeForm`, `MotivoForm` e `ConcluirManutencaoForm`, e a `ClassificacaoManutencao` que já existem.
- Produces: a mesma assinatura `GavetaManutencao(props: Props)`. Quem abre a gaveta (Frota, Pendências, hospedeiro, Geral) não muda.

**Mudança:**
- **Estado:** `acao: AcaoManutencao | null` vira `extra: Extra | null`.
- **Sem extra aberto:** o corpo é só `<ManutencaoPassoAPasso source m hoje onFeito={gravado} onDesatualizada={desatualizada} onExtra={setExtra} />`.
- **Com extra aberto**, o corpo mostra o formulário dele, com "Voltar" que zera o extra:
  - `reagendar` → `EncaixeForm` (rótulo "Reagendar");
  - `reprovar` → `MotivoForm acao="reprovar"`;
  - `cancelar` → `MotivoForm acao="cancelar"`;
  - `concluir` → `ConcluirManutencaoForm`;
  - `corrigirClassificacao` → `ClassificacaoManutencao`.
- **Saem:**
  - a seção "Ações" com botões soltos;
  - "Pedido", "Encaixe" e "Conclusão" como seções `Linhas`: o pedido vira uma linha curta abaixo do guia ("Descrição do motorista: …", km, fotos do pedido); a conclusão fica no passo `realizada` do guia;
  - "Serviços e categorias" fixa: só pelo extra `corrigirClassificacao`;
  - "Histórico": a lista de feitos substitui, e a nota "As alterações uma a uma ficam na auditoria, no botão do alto da gaveta." fica no fim.
- **Ficam:** `eyebrow` ("Manutenção OM-…"), `actions` (auditoria), `footer` ("Abrir formulário") e as telas de carregando, erro e não encontrada. O `title` do `Drawer` passa a ser `"<placa> · <descrição>"`.
- **`desatualizada()`:** passa a checar se o extra ainda vale com `avaliar(leitura.detalhe, hoje).extras.includes(aberto)` no lugar de `acoesManutencao(...)`.

- [ ] **Step 1: Ajustar os testes primeiro** em `GavetaManutencao.test.tsx`:
  - **Novo:** "abre no passo da etapa (Solicitado → 'Quando vai ser?')".
  - **Novo:** "Reagendar pelo ⋯ abre o formulário de janela e Voltar volta ao guia".
  - **Novo:** "Reprovar pelo ⋯ exige motivo".
  - **Novo:** "StaleError com o extra aberto mantém o formulário quando ainda vale".
  - **Removidos:** os testes que procuram os botões soltos ("Encaixar", "Reagendar" fora do menu) e as seções "Pedido" e "Histórico" em tabela.
  - **Ficam:** carregando, erro com "Tentar de novo", não encontrada, "Abrir formulário" e auditoria.

```tsx
it('abre no passo da etapa', async () => {
  render(<GavetaManutencao source={fonteCom(solicitada)} id="m1" hoje="2026-11-17" onClose={vi.fn()} onChanged={vi.fn()} />)
  expect(await screen.findByRole('heading', { name: 'Quando vai ser?' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Encaixar' })).not.toBeInTheDocument()
})

it('Reagendar pelo ⋯ abre o formulário e Voltar volta ao guia', async () => {
  render(<GavetaManutencao source={fonteCom(agendada)} id="m1" hoje="2026-11-17" onClose={vi.fn()} onChanged={vi.fn()} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Mais ações' }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Reagendar' }))
  expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
  expect(screen.getByRole('heading', { name: 'Quem leva e quando sai?' })).toBeInTheDocument()
})
```

Use os helpers do arquivo (`fonteCom` ou o nome que ele usa) e os fixtures dele, acrescentando `programacao` e `despesa`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/components/GavetaManutencao.test.tsx`
Expected: os testes novos falham (não acham "Quando vai ser?").

- [ ] **Step 3: Implementar** a **Mudança** acima em `GavetaManutencao.tsx`.
  - Apague `Secao`, `Linhas` e `Arquivos` se ficarem sem uso; o `Arquivos` foi para o guia.
  - `acoesManutencao`, `rotuloAcao` e `AcaoManutencao` continuam usados por `EncaixeForm`, `MotivoForm` e `executarAcaoManutencao`.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota src/app --maxWorkers=2 && pnpm --filter @betinhos/shell typecheck`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/frota/components apps/shell/src/app
git commit -m "feat(frota): gaveta da manutenção com o guia passo a passo"
```

---

### Tarefa 7: Roteiro, prints, spec e PR

**Files:**
- Modify: `.claude/skills/verificar-shell/SKILL.md` (item novo "5i. Gaveta da manutenção passo a passo", depois do 5h)
- Modify: `docs/superpowers/specs/2026-11-17-manutencoes-gaveta-passo-a-passo-design.md` (D2: "Já foi feita: concluir" no "⋯" de Agendar e Programar, conforme P1)

- [ ] **Step 1: Roteiro na skill.** Acrescente o item 5i com:
  - **onde abrir:** Frota › Manutenções › uma de cada status do mock;
  - **o que conferir:** a barra (atual, feitas, parada); um passo por vez; o "⋯" de cada etapa (os rótulos de P1 e da spec); Agendar com grau; Programar com o aviso fora da janela; o fim com a despesa; Reprovada e Cancelada sem ações; e o celular a 390 px sem rolagem horizontal.

- [ ] **Step 2: Prints no mock (Betinhos-Renan).** Rode `pnpm --filter @betinhos/shell dev` (porta 36472) e tire com Playwright:
  - (1) Agendar;
  - (2) Programar com o aviso;
  - (3) Realizar com o "⋯" aberto;
  - (4) Realizada com a despesa;
  - (5) Reprovada;
  - (6) celular, Programar.

  Envie com `t3_file_send` (toEnvironmentId `bf737e95-05bd-44a4-a6fb-01961c35493e`), nomes `gaveta-manut-0N-*.png`. Pare o dev server.

- [ ] **Step 3: Suítes.**
  - `pnpm --filter @betinhos/shell exec vitest run src/pages/frota src/app src/pages/geral --maxWorkers=2`;
  - `pnpm --filter @betinhos/shell typecheck`;
  - `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests`.

  Cole os totais.

- [ ] **Step 4: Spec e commit**

```bash
git add .claude/skills/verificar-shell/SKILL.md docs/superpowers/specs/2026-11-17-manutencoes-gaveta-passo-a-passo-design.md
git commit -m "docs(frota): roteiro da gaveta passo a passo e P1 na spec"
```

- [ ] **Step 5: PR para a `develop`.** Quem orquestra abre o PR, não o implementador. O corpo do PR leva:
  - o que muda para quem usa;
  - a única mudança de servidor (`grau` opcional no Agendar);
  - a verificação;
  - o caminho do PROD: plugin e tela → caminhos rápidos, sem "Publicar soluções".

  Depois do merge e do Deploy, a conferência no DEV usa os registros "TESTE mock" de 17/11/2026: OM-1233 a OM-1243 e os serviços OS-1979 a OS-1993.

---

## Autorrevisão

- **Cobertura da spec:**

  | Spec | Tarefa |
  |---|---|
  | D1 (etapas) | 4 |
  | D2 (um passo por vez, "⋯") | 4 e 5 (P1 na 7) |
  | D3 (grau no Agendar) | 2, 3 e 5 |
  | D4 (Programar) | 3 e 5 |
  | D5 (Realizar e Concluir por ele) | 4, 5 e 6 |
  | D6 (Reagendar volta a Programar) | comportamento atual da API; a 6 usa o `EncaixeForm` |
  | D7 (topo e prazo) | 4 e 5 |
  | D8 (fim com a despesa) | 3, 4 e 5 |
  | D9 (fim negativo) | 4 e 5 |
  | D10 (mensagem do servidor) | 5 e 6 |
  | Erros (`StaleError`, sem linha na Geral, privilégio) | 5 e 6 |
  | Testes | em cada tarefa |
  | Prints | 7 |

- **Placeholders:** `<nav da Tarefa 1>` é proposital: o valor sai da conferência no DEV da Tarefa 1, e a Tarefa 3 manda trocá-lo.
- **Tipos:**
  - `Extra`, `Situacao`, `ValoresAgendar`, `ValoresProgramar`, `ProgramacaoManutencao`, `DespesaDaManutencao` e `PedidoProgramar` têm os mesmos nomes da Tarefa 3 à 6;
  - `AcaoManutencao` ganha `programar` (Tarefa 3) e é a ação usada na Tarefa 5;
  - `onExtra(extra: Extra)` é a mesma assinatura na 5 e na 6.
