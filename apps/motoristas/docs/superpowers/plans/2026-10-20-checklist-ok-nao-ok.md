# Checklist "OK / Não OK" — plano de implementação (entrega 1 de 3)

> **Para agentes:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Passos com checkbox (`- [ ]`).

**Objetivo:** item de checklist "OK / Não OK" em que o "Não OK" exige foto e problema da lista do item, ponta a ponta (schema, plugin, App Motoristas, Gestão de Checklists, modelo de teste no DEV).

**Arquitetura:** a opção nova `100000003` em `new_tipo` vira `tipo = "okNok"` no snapshot `new_itensjson`, que passa a levar `opcoesProblema`. O plugin valida a resposta e grava o resumo (`new_temproblema`, `new_qtdproblemas`). O App Motoristas ganha o campo `ChecklistOkNokField`. A Gestão copia `src/lib/checklists.ts` via `sync-shared` e ganha o editor e o selo "Não estava OK".

**Stack:** C# (.NET Framework, plugin Dataverse, xUnit), TypeScript/React (Vite single-file, `node --test`), PowerShell (Web API).

**Specs:** `docs/superpowers/specs/2026-10-20-checklist-ok-nao-ok-design.md`. Próximas entregas: `2026-10-20-checklist-troca-infleet-design.md` e `2026-10-20-checklist-padroes-gestao-design.md`. Cada uma terá seu próprio plano depois que esta entrar na `main`, porque elas dependem dos nomes criados aqui.

## Restrições globais

- Valor da choice: `100000003`, rótulo `OK / Não OK`. Código: `"okNok"`. Respostas: `"ok"` / `"nok"`.
- Lista padrão de problemas, nesta ordem: `Arranhado, Amassado, Trincado, Quebrado, Faltando, Sujo, Outro`.
- Limites: até 5 fotos por item (`MaxPhotosPerItem`), até 10 problemas por resposta, observação ≤ 500 caracteres, `new_opcoesproblema` ≤ 1000 caracteres, até 12 opções por item, cada opção ≤ 40 caracteres.
- Mensagens: plugin `Escolha OK ou Não OK: {rótulo}.`, `Tire a foto do problema: {rótulo}.`, `Escolha o problema: {rótulo}.`; app as mesmas sem o rótulo (aparecem sob o próprio item).
- Compatibilidade: as respostas e os itens antigos (foto/número/texto) não mudam de formato. Um rascunho do IndexedDB salvo sem `problemas`/`observacoes` continua válido.
- Publicação no DEV só a partir da `main`, no checkout principal. Ordem: schema → plugin → App Motoristas → Gestão → seed do modelo.
- Antes de cada PR, rode `verificacao-manter` (skills `verificar-checklists-backend`, `verificar-checklists-app` e a de verificação da Gestão).

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `scripts/provision-checklists.ps1` | opção `100000003`, colunas `new_OpcoesProblema`, `new_TemProblema`, `new_QtdProblemas` |
| `plugins/DriverRecordSharing/ChecklistAnswers.cs` | tipo okNok, opções de problema, validação e serialização |
| `plugins/DriverRecordSharing/ChecklistCommandPlugin.cs` | lê `new_opcoesproblema` no snapshot e grava o resumo ao concluir |
| `plugins/DriverRecordSharing.Tests/ChecklistCommandPluginTests.cs` | testes do servidor |
| `src/lib/checklists.ts` | tipos, parse, rascunho, validação, progresso, payload e fila de fotos |
| `src/components/checklists/ChecklistOkNokField.tsx` (novo) | botões OK / Não OK, chips, fotos e observação |
| `src/screens/ChecklistsScreen.tsx` | liga o campo novo, a fila de fotos e o checklist enviado com os Não OK no topo |
| `src/checklists.css` | estilos do campo |
| `tests/checklists.test.ts` | testes do app |
| `scripts/seed-checklist-modelo-teste.ps1` | modelo "Vistoria rápida" e troca do padrão |
| Gestão: `src/lib/gestaoChecklists.ts`, `src/gestao/GestaoChecklists.tsx`, `tests/gestaoChecklists.test.ts` | editor, selo e detalhe |

---

### Tarefa 1: Schema no DEV

**Arquivos:** modificar `scripts/provision-checklists.ps1` (função nova depois de `Ensure-ChoiceLabel`, linha ~273; chamadas no bloco de colunas, linhas ~289-318).

- [ ] **Passo 1: Função para incluir uma opção nova numa choice existente**

```powershell
function Ensure-ChoiceOption([string] $Table, [string] $Attribute, [int] $Value, [string] $Text) {
  if ($missingTables.Contains($Table)) { Write-Step "DRY RUN incluiria opcao $Table.$Attribute=$Value"; return }
  $metadata = Invoke-Dv "GET" "EntityDefinitions(LogicalName='$Table')/Attributes(LogicalName='$Attribute')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet(`$select=Options)"
  if (@($metadata.OptionSet.Options | Where-Object { [int]$_.Value -eq $Value }).Count -gt 0) { Ensure-ChoiceLabel $Table $Attribute $Value $Text; return }
  if (-not $Apply) { Write-Step "DRY RUN incluiria opcao $Table.$Attribute=$Value '$Text'"; return }
  Invoke-Dv "POST" "InsertOptionValue" @{ EntityLogicalName = $Table; AttributeLogicalName = $Attribute; Value = $Value; Label = (Label $Text); SolutionUniqueName = $SolutionUniqueName } | Out-Null
  Write-Step "opcao incluida: $Table.$Attribute=$Value"
}
```

- [ ] **Passo 2: Chamadas**

Depois de `Ensure-Column $item "new_Unidade" ...`:

```powershell
Ensure-Column $item "new_OpcoesProblema" "Problemas possiveis" "memo" 1000
```

Depois de `Ensure-Column $checklist "new_PushErro" ...`:

```powershell
Ensure-Column $checklist "new_TemProblema" "Tem problema" "boolean"
Ensure-Column $checklist "new_QtdProblemas" "Itens com problema" "integer"
```

Depois de `Ensure-ChoiceLabel $item "new_tipo" 100000001 $numeroLabel`:

```powershell
Ensure-ChoiceOption $item "new_tipo" 100000003 "OK / N$([char]0x00E3)o OK"
```

- [ ] **Passo 3: Dry run e aplicação no DEV**

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/provision-checklists.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com/
```

Esperado: `DRY RUN` só para as 3 colunas e a opção. Depois rode com `-Apply`. Para conferir, consulte a metadata: `new_tipo` com 4 opções e as 3 colunas presentes na solução AppBetinhos.

- [ ] **Passo 4: Commit** — `feat: schema do item OK / Não OK no checklist (opção, problemas e resumo)`

---

### Tarefa 2: Plugin valida OK / Não OK e grava o resumo

**Arquivos:** modificar `plugins/DriverRecordSharing/ChecklistAnswers.cs`, `plugins/DriverRecordSharing/ChecklistCommandPlugin.cs:149-172` e `:362-396`; testes em `plugins/DriverRecordSharing.Tests/ChecklistCommandPluginTests.cs`.

**Interfaces produzidas:** `ChecklistAnswers.OkNok = "okNok"`, `ChecklistAnswers.DefaultProblemOptions`, `ChecklistAnswers.ParseProblemOptions(string)`, `ChecklistAnswers.CountProblems(IEnumerable<ChecklistAnswer>)`; JSON do item com `opcoesProblema`; JSON da resposta com `problemas` e `observacao`.

- [ ] **Passo 1: Testes que falham**

No `Fixture`, inclua o item OK / Não OK no `Template` (ordem 4) e aceite opções:

```csharp
private const int OkNok = 100000003;
// em Template(): 
Item(template, 4, "Pneus", OkNok, true, "", "Murcho\nCareca\nFurado");
// assinatura nova:
private void Item(Entity template, int order, string label, int type, bool required, string unit, string options = null) => Add(new Entity("new_checklistmodeloitem")
{
    ["new_modelo"] = template.ToEntityReference(),
    ["new_ordem"] = order,
    ["new_name"] = label,
    ["new_tipo"] = new OptionSetValue(type),
    ["new_obrigatorio"] = required,
    ["new_unidade"] = unit,
    ["new_opcoesproblema"] = options
});
```

Atualize `Answers(...)` para responder o okNok (o parâmetro novo `okNok` é o JSON da resposta sem a chave; o padrão é OK):

```csharp
private static string Answers(List<ChecklistItem> items, string foto, string numero, string texto, string okNok = "\"valor\":\"ok\"")
{
    var parts = new List<string>();
    foreach (var item in items)
    {
        if (item.Tipo == "foto")
            parts.Add("{\"chave\":\"" + item.Chave + "\",\"fotos\":[" + (foto == null ? "" : "{\"link\":\"" + foto + "\",\"caminho\":\"Checklists/x\",\"nomeArquivo\":\"f.jpg\"}") + "]}");
        else if (item.Tipo == "numero")
            parts.Add("{\"chave\":\"" + item.Chave + "\",\"valor\":\"" + numero + "\"}");
        else if (item.Tipo == "okNok")
            parts.Add("{\"chave\":\"" + item.Chave + "\"," + okNok + "}");
        else
            parts.Add("{\"chave\":\"" + item.Chave + "\",\"valor\":\"" + texto + "\"}");
    }
    return "[" + string.Join(",", parts) + "]";
}
```

Testes novos (use o mesmo arranjo de `MotoristaConcluiComFotosEValores`: fixture, `Invoke("Request", ...)`, atribuição e `Invoke("Conclude", ...)`):

```csharp
[Fact]
public void SnapshotLevaOpcoesDoItemOuPadrao()
{
    var items = ChecklistAnswers.ParseItems(RequestAndReadItemsJson());
    Assert.Equal(new[] { "Murcho", "Careca", "Furado" }, items.Single(i => i.Tipo == "okNok").OpcoesProblema);
    Assert.Equal(ChecklistAnswers.DefaultProblemOptions, ChecklistAnswers.ParseProblemOptions(null));
}

[Fact]
public void NaoOkComFotoEProblemaConcluiEGravaResumo()
{
    var (service, checklist, user, items) = PendingChecklist();
    var nok = "\"valor\":\"nok\",\"problemas\":[\"Murcho\"],\"observacao\":\"dianteiro\",\"fotos\":[{\"link\":\"https://x.test/p\",\"caminho\":\"c\",\"nomeArquivo\":\"p.jpg\"}]";
    Invoke("Conclude", Context(user.Id, P("new_ChecklistId", checklist.Id), P("new_RespostasJson", Answers(items, "https://x.test/1", "1", "", nok))), service);
    var saved = service.Retrieve("new_checklistveiculo", checklist.Id, new ColumnSet(true));
    Assert.True(saved.GetAttributeValue<bool>("new_temproblema"));
    Assert.Equal(1, saved.GetAttributeValue<int>("new_qtdproblemas"));
    Assert.Contains("\"problemas\":[\"Murcho\"]", saved.GetAttributeValue<string>("new_respostasjson"));
}

[Theory]
[InlineData("\"valor\":\"nok\",\"problemas\":[\"Murcho\"],\"fotos\":[]", "Tire a foto do problema: Pneus.")]
[InlineData("\"valor\":\"nok\",\"problemas\":[],\"fotos\":[{\"link\":\"https://x.test/p\"}]", "Escolha o problema: Pneus.")]
[InlineData("\"valor\":\"nok\",\"problemas\":[\"Amassado\"],\"fotos\":[{\"link\":\"https://x.test/p\"}]", "Problema inválido em: Pneus.")]
[InlineData("\"valor\":\"\"", "Escolha OK ou Não OK: Pneus.")]
public void NaoOkInvalidoEhRecusado(string okNok, string message)
{
    var (service, checklist, user, items) = PendingChecklist();
    var error = Assert.Throws<InvalidPluginExecutionException>(() => Invoke("Conclude", Context(user.Id, P("new_ChecklistId", checklist.Id), P("new_RespostasJson", Answers(items, "https://x.test/1", "1", "", okNok))), service));
    Assert.Equal(message, error.Message);
}

[Fact]
public void OkDescartaFotosEProblemasEnviados()
{
    var (service, checklist, user, items) = PendingChecklist();
    var ok = "\"valor\":\"ok\",\"problemas\":[\"Murcho\"],\"fotos\":[{\"link\":\"https://x.test/p\"}]";
    Invoke("Conclude", Context(user.Id, P("new_ChecklistId", checklist.Id), P("new_RespostasJson", Answers(items, "https://x.test/1", "1", "", ok))), service);
    var saved = service.Retrieve("new_checklistveiculo", checklist.Id, new ColumnSet(true));
    Assert.False(saved.GetAttributeValue<bool>("new_temproblema"));
    Assert.Equal(0, saved.GetAttributeValue<int>("new_qtdproblemas"));
    Assert.DoesNotContain("x.test/p", saved.GetAttributeValue<string>("new_respostasjson"));
}
```

`PendingChecklist()` e `RequestAndReadItemsJson()` são helpers privados que extraem o arranjo já repetido em `MotoristaConcluiComFotosEValores` (fixture com motorista, veículo próprio, `Template(true)`, `Request`, atribuição, estado Pendente). Devolvem `(service, checklist, user, items)` e o `new_itensjson` gravado, respectivamente. Os testes existentes que concluem passam a usar o padrão `okNok = "valor":"ok"` sem mudança.

- [ ] **Passo 2: Rodar e ver falhar**

```bash
cd plugins/DriverRecordSharing.Tests && dotnet test --filter "FullyQualifiedName~ChecklistCommandPluginTests" -v q
```

Esperado: falha de compilação (`OpcoesProblema`, `ParseProblemOptions` e `DefaultProblemOptions` não existem).

- [ ] **Passo 3: Implementar em `ChecklistAnswers.cs`**

```csharp
// ChecklistItem
public List<string> OpcoesProblema = new List<string>();
// ChecklistAnswer
public List<string> Problemas = new List<string>();
public string Observacao = "";

// ChecklistAnswers
public const string OkNok = "okNok";
public const int MaxProblems = 10;
public const int MaxObservationLength = 500;
public static readonly string[] DefaultProblemOptions = { "Arranhado", "Amassado", "Trincado", "Quebrado", "Faltando", "Sujo", "Outro" };

// em TipoFromChoice:
case 100000003: return OkNok;

public static List<string> ParseProblemOptions(string raw)
{
    var options = (raw ?? "").Split('\n')
        .Select(line => line.Trim())
        .Where(line => line.Length > 0)
        .Select(line => Limit(line, 40))
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .Take(12)
        .ToList();
    return options.Count > 0 ? options : DefaultProblemOptions.ToList();
}

public static int CountProblems(IEnumerable<ChecklistAnswer> answers) => answers.Count(answer => answer.Tipo == OkNok && answer.Valor == "nok");
```

Em `SerializeItems`, inclua `["opcoesProblema"] = item.Tipo == OkNok ? item.OpcoesProblema : new List<string>()`. Em `ParseItems`, leia `OpcoesProblema = item.Tipo == OkNok ? StringList(map, "opcoesProblema", DefaultProblemOptions) : new List<string>()`, com o helper:

```csharp
private static List<string> StringList(Dictionary<string, object> map, string key, IEnumerable<string> fallback)
{
    var rows = map != null && map.ContainsKey(key) ? map[key] as object[] ?? (map[key] as System.Collections.ArrayList)?.ToArray() : null;
    var list = rows == null ? new List<string>() : rows.Select(row => Convert.ToString(row, CultureInfo.InvariantCulture)?.Trim() ?? "").Where(row => row.Length > 0).ToList();
    return list.Count > 0 || fallback == null ? list : fallback.ToList();
}
```

Em `Validate`, um `case` novo antes do `default`:

```csharp
case OkNok:
    answer.Valor = map == null ? "" : Text(map, "valor").Trim();
    if (answer.Valor.Length == 0)
    {
        if (item.Obrigatorio) throw new InvalidPluginExecutionException("Escolha OK ou Não OK: " + item.Rotulo + ".");
        break;
    }
    if (answer.Valor != "ok" && answer.Valor != "nok")
        throw new InvalidPluginExecutionException("Resposta inválida em: " + item.Rotulo + ".");
    if (answer.Valor == "ok") break; // OK descarta fotos, problemas e observação enviados por engano.
    answer.Fotos = Photos(map, item);
    if (answer.Fotos.Count == 0) throw new InvalidPluginExecutionException("Tire a foto do problema: " + item.Rotulo + ".");
    answer.Problemas = StringList(map, "problemas", null);
    if (answer.Problemas.Count == 0) throw new InvalidPluginExecutionException("Escolha o problema: " + item.Rotulo + ".");
    if (answer.Problemas.Count > MaxProblems || answer.Problemas.Any(p => !item.OpcoesProblema.Contains(p, StringComparer.Ordinal)))
        throw new InvalidPluginExecutionException("Problema inválido em: " + item.Rotulo + ".");
    answer.Observacao = Text(map, "observacao").Trim();
    if (answer.Observacao.Length > MaxObservationLength)
        throw new InvalidPluginExecutionException("Observação grande demais em: " + item.Rotulo + ".");
    break;
```

Em `SerializeAnswers`, inclua `["problemas"] = answer.Problemas` e `["observacao"] = answer.Observacao`.

- [ ] **Passo 4: Implementar em `ChecklistCommandPlugin.cs`**

Em `TemplateItems`: inclua `"new_opcoesproblema"` no `ColumnSet` e, no `Select`, monte o item primeiro e preencha `OpcoesProblema`:

```csharp
.Select(row =>
{
    var item = new ChecklistItem { /* campos atuais */ };
    if (item.Tipo == ChecklistAnswers.OkNok) item.OpcoesProblema = ChecklistAnswers.ParseProblemOptions(row.GetAttributeValue<string>("new_opcoesproblema"));
    return item;
})
```

Em `Conclude`, no `update`:

```csharp
var problems = ChecklistAnswers.CountProblems(answers);
update["new_temproblema"] = problems > 0;
update["new_qtdproblemas"] = problems;
```

- [ ] **Passo 5: Rodar os testes**

```bash
cd plugins/DriverRecordSharing.Tests && dotnet test -v q
```

Esperado: `Com falha: 0` na suíte inteira, que também protege comunicados e trocas.

- [ ] **Passo 6: Commit** — `feat: plugin do checklist valida itens OK / Não OK e grava o resumo de problemas`

---

### Tarefa 3: Regras do App Motoristas (`src/lib/checklists.ts`)

**Interfaces produzidas:**
- `ChecklistItemTipo = "foto" | "numero" | "texto" | "okNok"`
- `ChecklistItem.opcoesProblema: string[]`
- `ChecklistResposta.problemas: string[]`, `ChecklistResposta.observacao: string`
- `ChecklistDraft.problemas?: Record<string, string[]>`, `ChecklistDraft.observacoes?: Record<string, string>`
- `CHECKLIST_PROBLEMAS_PADRAO: readonly string[]`, `CHECKLIST_MAX_OBSERVACAO = 500`
- `checklistPhotoItems(itens, draft): ChecklistItem[]` (itens cujas fotos entram na fila de envio)
- `setChecklistOkNok(draft, chave, valor: "ok" | "nok"): ChecklistDraft`

- [ ] **Passo 1: Testes que falham** (`tests/checklists.test.ts`)

```ts
const okNokItem = (overrides: Partial<ChecklistItem> = {}): ChecklistItem => ({
  chave: "pneus", ordem: 1, rotulo: "Pneus", instrucao: "", tipo: "okNok", obrigatorio: true, unidade: "",
  opcoesProblema: ["Murcho", "Careca"], ...overrides
});
const draftWith = (parts: Partial<ChecklistDraft>): ChecklistDraft => ({ checklistId: "c", valores: {}, fotos: {}, updatedAt: "", ...parts });

test("parse do item okNok usa a lista do item ou a padrão", () => {
  const [comLista, semLista] = parseChecklistItems(JSON.stringify([
    { chave: "a", ordem: 1, rotulo: "Pneus", tipo: "okNok", opcoesProblema: ["Murcho"] },
    { chave: "b", ordem: 2, rotulo: "Limpeza", tipo: "okNok" }
  ]));
  assert.deepEqual(comLista.opcoesProblema, ["Murcho"]);
  assert.deepEqual(semLista.opcoesProblema, [...CHECKLIST_PROBLEMAS_PADRAO]);
});

test("validação do okNok: escolha, foto e problema", () => {
  const item = okNokItem();
  assert.equal(validateChecklistDraft([item], draftWith({}))[item.chave], "Escolha OK ou Não OK.");
  assert.equal(validateChecklistDraft([item], draftWith({ valores: { pneus: "nok" } }))[item.chave], "Tire a foto do problema.");
  assert.equal(validateChecklistDraft([item], draftWith({ valores: { pneus: "nok" }, fotos: { pneus: [{ id: "f", dataUrl: "d" }] } }))[item.chave], "Escolha o problema.");
  assert.deepEqual(validateChecklistDraft([item], draftWith({ valores: { pneus: "nok" }, fotos: { pneus: [{ id: "f", dataUrl: "d" }] }, problemas: { pneus: ["Murcho"] } })), {});
  assert.deepEqual(validateChecklistDraft([item], draftWith({ valores: { pneus: "ok" } })), {});
});

test("voltar para OK limpa problemas, observação e fotos do item", () => {
  const draft = draftWith({ valores: { pneus: "nok" }, fotos: { pneus: [{ id: "f", dataUrl: "d" }] }, problemas: { pneus: ["Murcho"] }, observacoes: { pneus: "x" } });
  const next = setChecklistOkNok(draft, "pneus", "ok");
  assert.equal(next.valores.pneus, "ok");
  assert.deepEqual(next.fotos.pneus ?? [], []);
  assert.deepEqual(next.problemas?.pneus ?? [], []);
  assert.equal(next.observacoes?.pneus ?? "", "");
});

test("payload e fila de fotos do okNok", () => {
  const item = okNokItem();
  const draft = draftWith({ valores: { pneus: "nok" }, fotos: { pneus: [{ id: "f", dataUrl: "d" }] }, problemas: { pneus: ["Murcho"] }, observacoes: { pneus: " dianteiro " } });
  assert.deepEqual(checklistPhotoItems([item], draft).map((entry) => entry.chave), ["pneus"]);
  assert.deepEqual(checklistPhotoItems([item], { ...draft, valores: { pneus: "ok" } }), []);
  const [resposta] = JSON.parse(buildChecklistRespostasJson([item], draft, { pneus: [{ link: "https://x/p", caminho: "c", nomeArquivo: "p.jpg" }] }));
  assert.deepEqual(resposta, { chave: "pneus", valor: "nok", problemas: ["Murcho"], observacao: "dianteiro", fotos: [{ link: "https://x/p", caminho: "c", nomeArquivo: "p.jpg" }] });
});

test("progresso conta okNok respondido", () => {
  assert.deepEqual(countChecklistProgress([okNokItem()], draftWith({ valores: { pneus: "ok" } })), { done: 1, total: 1 });
});
```

As mensagens do app não têm o rótulo, porque aparecem embaixo do próprio item. O plugin inclui o rótulo, porque a mensagem dele chega solta.

- [ ] **Passo 2: Rodar e ver falhar** — `npm test -- --test-name-pattern=okNok` → falha de import.

- [ ] **Passo 3: Implementar**

```ts
export type ChecklistItemTipo = "foto" | "numero" | "texto" | "okNok";
export const CHECKLIST_PROBLEMAS_PADRAO = ["Arranhado", "Amassado", "Trincado", "Quebrado", "Faltando", "Sujo", "Outro"] as const;
export const CHECKLIST_MAX_OBSERVACAO = 500;

const asTipo = (value: unknown): ChecklistItemTipo => value === "foto" || value === "numero" || value === "okNok" ? value : "texto";
const asStrings = (value: unknown) => asArray(value).map((entry) => String(entry ?? "").trim()).filter(Boolean);
```

- `ChecklistItem`: `opcoesProblema: string[]`. Em `parseChecklistItems`: `opcoesProblema: tipo === "okNok" ? (asStrings(row.opcoesProblema).length ? asStrings(row.opcoesProblema) : [...CHECKLIST_PROBLEMAS_PADRAO]) : []`, calculando `tipo` antes do objeto.
- `ChecklistResposta`: `problemas: string[]; observacao: string`. Em `parseChecklistRespostas`: `problemas: asStrings(row.problemas), observacao: String(row.observacao ?? "")`.
- `ChecklistDraft`: `problemas?: Record<string, string[]>; observacoes?: Record<string, string>`.

```ts
export function setChecklistOkNok(draft: ChecklistDraft, chave: string, valor: "ok" | "nok"): ChecklistDraft {
  const next: ChecklistDraft = { ...draft, valores: { ...draft.valores, [chave]: valor }, updatedAt: new Date().toISOString() };
  if (valor === "nok") return next;
  return {
    ...next,
    fotos: { ...draft.fotos, [chave]: [] },
    problemas: { ...(draft.problemas ?? {}), [chave]: [] },
    observacoes: { ...(draft.observacoes ?? {}), [chave]: "" }
  };
}

export const checklistPhotoItems = (itens: ChecklistItem[], draft: ChecklistDraft) =>
  itens.filter((item) => item.tipo === "foto" || (item.tipo === "okNok" && draft.valores[item.chave] === "nok"));
```

Em `validateChecklistDraft`, um ramo novo antes do `else` final:

```ts
} else if (item.tipo === "okNok") {
  if (valor !== "ok" && valor !== "nok") { if (item.obrigatorio) errors[item.chave] = "Escolha OK ou Não OK."; }
  else if (valor === "nok") {
    if (fotos.length === 0) errors[item.chave] = "Tire a foto do problema.";
    else if (fotos.length > CHECKLIST_MAX_FOTOS_POR_ITEM) errors[item.chave] = `Envie até ${CHECKLIST_MAX_FOTOS_POR_ITEM} fotos.`;
    else if (!(draft.problemas?.[item.chave] ?? []).length) errors[item.chave] = "Escolha o problema.";
    else if ((draft.observacoes?.[item.chave] ?? "").trim().length > CHECKLIST_MAX_OBSERVACAO) errors[item.chave] = `Use até ${CHECKLIST_MAX_OBSERVACAO} caracteres.`;
  }
}
```

Em `buildChecklistRespostasJson`, antes do retorno genérico:

```ts
if (item.tipo === "okNok") {
  const valor = draft.valores[item.chave] ?? "";
  if (valor !== "nok") return { chave: item.chave, valor };
  return { chave: item.chave, valor, problemas: draft.problemas?.[item.chave] ?? [], observacao: (draft.observacoes?.[item.chave] ?? "").trim(), fotos: uploaded[item.chave] ?? [] };
}
```

`countChecklistProgress` continua igual: `valores` "ok"/"nok" já contam. Inclua o item okNok `Pneus` no `mockItens()` para o modo localhost.

- [ ] **Passo 4: Testes e tipos** — `npm test` e `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` → tudo verde.

- [ ] **Passo 5: Commit** — `feat: regras do item OK / Não OK no App Motoristas (rascunho, validação e payload)`

---

### Tarefa 4: Campo OK / Não OK na tela do App Motoristas

**Arquivos:** criar `src/components/checklists/ChecklistOkNokField.tsx`; modificar `src/screens/ChecklistsScreen.tsx` (fila em ~209, render em ~316, detalhe enviado) e `src/checklists.css`.

**Consome:** `setChecklistOkNok`, `checklistPhotoItems`, `CHECKLIST_MAX_FOTOS_POR_ITEM`, `CHECKLIST_MAX_OBSERVACAO`, `PhotoAddButton`, `FieldError`, `ConfirmDialog` (`src/components/common/ConfirmDialog.tsx`).

- [ ] **Passo 1: Componente**

```tsx
import { useState } from "react";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { FieldError } from "../common/FormFields";
import { PhotoAddButton } from "../common/PhotoAddButton";
import { CHECKLIST_MAX_FOTOS_POR_ITEM, CHECKLIST_MAX_OBSERVACAO, type ChecklistDraft, type ChecklistItem } from "../../lib/checklists";

type Props = {
  item: ChecklistItem;
  draft: ChecklistDraft;
  domId: string;
  error?: string;
  disabled: boolean;
  onChoose: (valor: "ok" | "nok") => void;
  onToggleProblem: (problema: string) => void;
  onObservation: (texto: string) => void;
  onAddPhoto: () => void;
  onOpenPhoto: (photoId: string, dataUrl: string) => void;
};

export function ChecklistOkNokField({ item, draft, domId, error, disabled, onChoose, onToggleProblem, onObservation, onAddPhoto, onOpenPhoto }: Props) {
  const valor = draft.valores[item.chave] ?? "";
  const fotos = draft.fotos[item.chave] ?? [];
  const problemas = draft.problemas?.[item.chave] ?? [];
  const [confirmOk, setConfirmOk] = useState(false);
  const chooseOk = () => (valor === "nok" && fotos.length ? setConfirmOk(true) : onChoose("ok"));
  return (
    <section id={domId} tabIndex={-1} className={`checklist-oknok ${error ? "is-invalid" : ""} ${valor ? `is-${valor}` : ""}`}>
      <div className="checklist-oknok-head">
        <strong>{item.rotulo}{item.obrigatorio ? <span className="form-field-required" aria-hidden="true"> *</span> : null}</strong>
        {item.instrucao ? <p className="checklist-instruction">{item.instrucao}</p> : null}
      </div>
      <div className="checklist-oknok-choice" role="group" aria-label={item.rotulo}>
        <button type="button" className="is-ok" aria-pressed={valor === "ok"} disabled={disabled} onClick={chooseOk}>OK</button>
        <button type="button" className="is-nok" aria-pressed={valor === "nok"} disabled={disabled} onClick={() => onChoose("nok")}>Não OK</button>
      </div>
      {valor === "nok" ? (
        <div className="checklist-oknok-detail">
          <p className="checklist-oknok-label">Qual o problema?</p>
          <div className="checklist-oknok-chips">
            {item.opcoesProblema.map((opcao) => (
              <button key={opcao} type="button" aria-pressed={problemas.includes(opcao)} disabled={disabled} onClick={() => onToggleProblem(opcao)}>{opcao}</button>
            ))}
          </div>
          <div className="collision-evidence-strip">
            {fotos.map((photo, index) => (
              <button type="button" className="collision-evidence-thumb" key={photo.id} disabled={disabled} onClick={() => onOpenPhoto(photo.id, photo.dataUrl)} aria-label={`Ver foto do problema ${index + 1}: ${item.rotulo}`}>
                <img src={photo.dataUrl} alt={`Problema ${index + 1}: ${item.rotulo}`} />
              </button>
            ))}
            {fotos.length < CHECKLIST_MAX_FOTOS_POR_ITEM ? <PhotoAddButton disabled={disabled} onClick={onAddPhoto} ariaLabel={`Tirar foto do problema: ${item.rotulo}`} label={fotos.length ? "Adicionar" : "Tirar foto"} /> : null}
          </div>
          <textarea className="checklist-oknok-note" aria-label={`Observação: ${item.rotulo}`} rows={2} maxLength={CHECKLIST_MAX_OBSERVACAO} placeholder="Observação (opcional)" value={draft.observacoes?.[item.chave] ?? ""} disabled={disabled} onChange={(event) => onObservation(event.target.value)} />
        </div>
      ) : null}
      <FieldError error={error} />
      {confirmOk ? (
        <ConfirmDialog title="Marcar como OK?" message="As fotos e os problemas deste item serão descartados." confirmLabel="Marcar OK" cancelLabel="Continuar editando" onCancel={() => setConfirmOk(false)} onConfirm={() => { setConfirmOk(false); onChoose("ok"); }} />
      ) : null}
    </section>
  );
}
```

Antes de escrever, confira os caminhos reais de `FieldError` e `PhotoAddButton` com `rg "export function (FieldError|PhotoAddButton)" src`, e use os mesmos imports que o `ChecklistsScreen.tsx` já usa.

- [ ] **Passo 2: Ligar na tela**

No `map` dos itens (linha ~316), renderize `ChecklistOkNokField` quando `item.tipo === "okNok"` e `ChecklistField` nos outros casos:

```tsx
item.tipo === "okNok" ? (
  <ChecklistOkNokField
    key={item.chave}
    item={item}
    draft={draft}
    domId={itemDomId(item.chave)}
    error={errors[item.chave]}
    disabled={locked}
    onChoose={(valor) => { updateDraft((current) => setChecklistOkNok(current, item.chave, valor)); clearError(item.chave); }}
    onToggleProblem={(problema) => { updateDraft((current) => {
      const atual = current.problemas?.[item.chave] ?? [];
      const next = atual.includes(problema) ? atual.filter((entry) => entry !== problema) : [...atual, problema];
      return { ...current, problemas: { ...(current.problemas ?? {}), [item.chave]: next } };
    }); clearError(item.chave); }}
    onObservation={(texto) => updateDraft((current) => ({ ...current, observacoes: { ...(current.observacoes ?? {}), [item.chave]: texto } }))}
    onAddPhoto={() => setCapturingChave(item.chave)}
    onOpenPhoto={(photoId, dataUrl) => setPhotoView({ chave: item.chave, dataUrl, photoId })}
  />
) : (
  <ChecklistField ... />  /* sem mudança */
)
```

Na fila de envio (linha ~209), troque o filtro `item.tipo === "foto"` por `checklistPhotoItems(selected.itens, working)`:

```ts
const queue = checklistPhotoItems(selected.itens, working)
  .flatMap((item) => (working.fotos[item.chave] ?? []).map((photo, index) => ({ item, photo, order: index + 1 })));
```

No checklist enviado (detalhe concluído), ordene as respostas com `valor === "nok"` primeiro. Mostre o selo "Não OK", os problemas separados por "·", a observação e as fotos. OK aparece como "OK", em texto neutro.

- [ ] **Passo 3: CSS** (`src/checklists.css`, com tokens do Design System; azul só em foco e seleção; sem gradiente)

```css
.checklist-oknok { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--border); border-radius: var(--radius-md); background: #FCFCFB; }
.checklist-oknok.is-invalid { border-color: var(--danger); }
.checklist-oknok-choice { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.checklist-oknok-choice button { min-height: 48px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--surface); font-weight: 600; }
.checklist-oknok-choice .is-ok[aria-pressed="true"] { background: var(--success-soft); border-color: var(--success); color: var(--success-strong); }
.checklist-oknok-choice .is-nok[aria-pressed="true"] { background: var(--danger-soft); border-color: var(--danger); color: var(--danger-strong); }
.checklist-oknok-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.checklist-oknok-chips button { min-height: 40px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); }
.checklist-oknok-chips button[aria-pressed="true"] { border-color: var(--primary); color: var(--primary); background: var(--primary-soft); }
.checklist-oknok-note { width: 100%; min-height: 64px; }
```

Confira em `design-tokens.css` os nomes reais dos tokens (`--success-soft` etc.) e use os existentes. Não crie valores novos.

- [ ] **Passo 4: Verificação no navegador** — `npm run dev`, em seguida a skill `verificar-checklists-app` em 375 px (mock localhost): marcar "Não OK" sem foto e ver o erro; tirar foto, escolher problema, voltar para OK (aparece a confirmação), enviar e ver o checklist enviado com o Não OK no topo. Rode a `ux-audit` no modo Fluxo, com axe sem falhas graves e console sem erros.

- [ ] **Passo 5: Commit** — `feat: campo OK / Não OK no checklist do App Motoristas`

---

### Tarefa 5: Gestão de Checklists (repositório `Tela Gestão de Checklists`)

**Arquivos:** `src/lib/gestaoChecklists.ts` (`ITEM_TIPO`, `ModeloItem`, leitura ~224/240, `itemPayload` ~292, `situacaoVeiculo` ~49, `mapChecklistGestao` ~124), `src/gestao/GestaoChecklists.tsx` (`TIPOS` ~53, editor ~633-666, detalhe ~556), `tests/gestaoChecklists.test.ts`. Antes disso: `pnpm sync-shared` para trazer o `src/lib/checklists.ts` da Tarefa 3 (já na `main` do App Motoristas).

**Interfaces:** `ITEM_TIPO.okNok = 100000003`; `ModeloItem.opcoesProblema: string` (texto, uma por linha); `ChecklistGestao.temProblema: boolean`, `ChecklistGestao.qtdProblemas: number`.

- [ ] **Passo 1: Testes que falham**

```ts
test("concluído com problema deixa o veículo em atenção até um checklist sem problema", () => {
  const veiculo = frota("v1");
  const comProblema = checklist({ veiculoId: "v1", estado: CHECKLIST_ESTADO.concluido, concluidoEm: "2026-10-18T12:00:00Z", temProblema: true, qtdProblemas: 2 });
  const s = situacaoVeiculo(veiculo, [comProblema], 15, Date.parse("2026-10-20T12:00:00Z"));
  assert.equal(s.label, "Não estava OK (2)");
  assert.equal(s.tone, "danger");
  const limpo = checklist({ veiculoId: "v1", estado: CHECKLIST_ESTADO.concluido, concluidoEm: "2026-10-19T12:00:00Z", temProblema: false, qtdProblemas: 0 });
  assert.equal(situacaoVeiculo(veiculo, [comProblema, limpo], 15, Date.parse("2026-10-20T12:00:00Z")).label, "Em dia");
});

test("payload do item okNok grava opções normalizadas", () => {
  const payload = itemPayloadForTest({ id: "", ordem: 1, rotulo: "Pneus", instrucao: "", tipo: "okNok", obrigatorio: true, unidade: "x", opcoesProblema: " Murcho \n\nCareca" }, 1);
  assert.equal(payload.new_tipo, 100000003);
  assert.equal(payload.new_opcoesproblema, "Murcho\nCareca");
  assert.equal(payload.new_unidade, "");
});
```

Use os helpers `frota`/`checklist` que já existem no arquivo de teste e inclua neles os campos novos. Exporte `itemPayload` como `itemPayloadForTest` para o teste, sem mudar seu uso interno.

- [ ] **Passo 2: Implementar**

- `ITEM_TIPO`: `{ foto: 100000000, numero: 100000001, texto: 100000002, okNok: 100000003 }`. Ajuste `tipoFromChoice` para mapear `100000003 → "okNok"`.
- Leitura dos itens: inclua `new_opcoesproblema` no `$select`; `opcoesProblema: text(item.new_opcoesproblema)`.
- `itemPayload`: `new_opcoesproblema: item.tipo === "okNok" ? item.opcoesProblema.split("\n").map((l) => l.trim()).filter(Boolean).join("\n") : ""`.
- `validateModelo`: um item okNok com mais de 12 opções ou opção com mais de 40 caracteres gera erro "Até 12 problemas, com até 40 caracteres cada".
- `mapChecklistGestao`: `temProblema: row.new_temproblema === true, qtdProblemas: Number(row.new_qtdproblemas ?? 0) || 0`. Inclua as duas colunas no `$select` dos checklists.
- `situacaoVeiculo`: depois de `aberto` e antes do cálculo de vencimento, `if (ultimo?.temProblema) return { tone: "danger", label: \`Não estava OK (${ultimo.qtdProblemas})\`, detail: \`Checklist de ${formatDay(ultimo.concluidoEm)}\`, ordem: 1, ultimo };`. Isso faz o veículo entrar no KPI "Precisam de atenção", que já soma `ordem <= 1`; confira a regra do KPI no componente.
- Editor: `TIPOS` ganha `{ id: "okNok", label: "OK / Não OK", icon: "check" }` (confira o ícone em `icons.tsx`; se não houver "check", use o mais próximo que existir) e a classe `is-three` vira `is-four`. Com `item.tipo === "okNok"`, aparece a `textarea` "Problemas possíveis (um por linha)", com placeholder igual à lista padrão. O resumo do item mostra "OK / Não OK · N problemas".
- Detalhe: respostas `okNok` com `valor === "nok"` vão para o topo, com selo vermelho "Não OK", problemas, observação e fotos (mesma galeria dos itens Foto). As com "ok" mostram "OK".

- [ ] **Passo 3: Testes, tipos e build** — `pnpm test`, `pnpm typecheck` (ou `npx tsc --noEmit`) e `pnpm build` → verdes.

- [ ] **Passo 4: Verificação** — `pnpm dev` (mock): criar um modelo com item OK / Não OK, editar as opções e salvar; abrir um checklist mock com Não OK e conferir o selo e o detalhe. Rode a skill de verificação da Gestão e a `ux-audit` no modo Rápido.

- [ ] **Passo 5: Commit** — `feat: Gestão de Checklists com itens OK / Não OK, selo "Não estava OK" e detalhe dos problemas`

---

### Tarefa 6: Modelo "Vistoria rápida", publicação no DEV e prova ponta a ponta

**Arquivos:** `scripts/seed-checklist-modelo-teste.ps1`, `scripts/smoke-checklists-dev.ps1`, skills `verificar-checklists-*`.

- [ ] **Passo 1: Seed com o modelo novo e troca de padrão**

Parâmetros novos: `-Nome "Vistoria rápida"` (padrão) e o switch `-SubstituirPadrao`. Com o switch, o modelo padrão atual é desmarcado (`new_padraoquinzenal = false`; continua ativo) antes de criar o novo como padrão. Sem o switch, o comportamento atual se mantém (falha se já houver padrão). A lista de itens passa a ser:

```powershell
$foto = 100000000; $texto = 100000002; $okNok = 100000003
$itens = @(
  @{ nome = "Frente do ve$([char]0x00ED)culo"; tipo = $foto; obrigatorio = $true; opcoes = ""; instrucao = "Enquadre o carro inteiro, com a placa leg$([char]0x00ED)vel." },
  @{ nome = "Traseira do ve$([char]0x00ED)culo"; tipo = $foto; obrigatorio = $true; opcoes = ""; instrucao = "Enquadre o carro inteiro, com a placa leg$([char]0x00ED)vel." },
  @{ nome = "Lateral esquerda"; tipo = $foto; obrigatorio = $true; opcoes = ""; instrucao = "" },
  @{ nome = "Lateral direita"; tipo = $foto; obrigatorio = $true; opcoes = ""; instrucao = "" },
  @{ nome = "Pneus"; tipo = $okNok; obrigatorio = $true; opcoes = "Murcho`nCareca`nFurado`nOutro"; instrucao = "" },
  @{ nome = "Far$([char]0x00F3)is e lanternas"; tipo = $okNok; obrigatorio = $true; opcoes = "Queimado`nQuebrado`nOutro"; instrucao = "" },
  @{ nome = "Para-brisa e vidros"; tipo = $okNok; obrigatorio = $true; opcoes = "Trincado`nRiscado`nOutro"; instrucao = "" },
  @{ nome = "Luzes de alerta no painel"; tipo = $okNok; obrigatorio = $true; opcoes = "Inje$([char]0x00E7)$([char]0x00E3)o`nFreio`n$([char]0x00D3)leo`nBateria`nOutra"; instrucao = "Ligue o carro e confira se alguma luz de alerta fica acesa." },
  @{ nome = "Limpeza interna"; tipo = $okNok; obrigatorio = $true; opcoes = "Sujo`nCom lixo`nCom cheiro`nOutro"; instrucao = "" },
  @{ nome = "Limpeza externa"; tipo = $okNok; obrigatorio = $true; opcoes = "Sujo`nOutro"; instrucao = "" },
  @{ nome = "Combust$([char]0x00ED)vel acima de 1/4"; tipo = $okNok; obrigatorio = $true; opcoes = "Abaixo de 1/4`nNa reserva"; instrucao = "" },
  @{ nome = "Estepe, macaco e tri$([char]0x00E2)ngulo"; tipo = $okNok; obrigatorio = $true; opcoes = "Faltando`nEstepe murcho`nOutro"; instrucao = "" },
  @{ nome = "Documento do ve$([char]0x00ED)culo"; tipo = $okNok; obrigatorio = $true; opcoes = "Faltando`nVencido"; instrucao = "" },
  @{ nome = "Observa$([char]0x00E7)$([char]0x00F5)es"; tipo = $texto; obrigatorio = $false; opcoes = ""; instrucao = "O que mais a opera$([char]0x00E7)$([char]0x00E3)o precisa saber." }
)
```

No payload do item, troque `new_unidade = $i.unidade` por `new_unidade = ""` e inclua `new_opcoesproblema = $i.opcoes`.

- [ ] **Passo 2: Smoke com Não OK** — em `smoke-checklists-dev.ps1`, o envio passa a responder o primeiro item okNok com `nok`, problema = primeira opção e uma foto de teste. Confira `new_temproblema = true` e `new_qtdproblemas = 1` no checklist concluído.

- [ ] **Passo 3: PRs e publicação no DEV (nesta ordem, cada uma da `main` do checkout principal, depois do merge)**
  1. App Motoristas (Tarefas 1–4 e 6): `provision-checklists.ps1 -Apply` → publicação do plugin (`register-driver-record-sharing-plugin-webapi.ps1 ... -Apply`, com a branch sincronizada com a `main`; veja a memória "Publicar plugin só com branch sincronizada") → `npm run push` do App Motoristas.
  2. Gestão (Tarefa 5): `pnpm push`.
  3. `seed-checklist-modelo-teste.ps1 -SubstituirPadrao` (dry run, depois `-Apply`).
  4. `smoke-checklists-dev.ps1` → verde.

- [ ] **Passo 4: Prova autenticada** — Claude in Chrome: Sistema Betinhos → Frota → Checklists de Veículos → "Solicitar" para um veículo de teste; App Motoristas no DEV em 375 px, com o checklist novo mostrando Pneus etc. Responder um Não OK com foto e enviar; na Gestão, o veículo aparece em "Precisam de atenção" com "Não estava OK (1)" e o detalhe mostra a foto. Informar as versões publicadas (App Motoristas e Gestão).

- [ ] **Passo 5: Skills de verificação** — atualizar `verificar-checklists-backend` (testes okNok, schema com opção `100000003`) e `verificar-checklists-app` (roteiro do Não OK), no mesmo commit da mudança.

---

## Autorrevisão

- **Cobertura da spec:** tipo novo (T1, T2, T3), lista por item com padrão (T1, T2, T5), foto e problema obrigatórios no Não OK (T2, T3), resumo `temproblema`/`qtdproblemas` (T1, T2, T5), botões grandes, chips, observação e confirmação ao voltar para OK (T4), progresso (já existe; T3 cobre a contagem), checklist enviado com Não OK no topo (T4, T5), editor de modelo (T5), "Precisam de atenção" (T5), seed sem KM e sem foto do painel (T6), compatibilidade (testes antigos seguem verdes em T2 e T3; rascunho com campos opcionais), ordem de publicação (T6).
- **Nomes consistentes:** `okNok`, `opcoesProblema` (JSON e TS), `OpcoesProblema` (C#), `new_opcoesproblema`, `new_temproblema`, `new_qtdproblemas`, `setChecklistOkNok`, `checklistPhotoItems`.
