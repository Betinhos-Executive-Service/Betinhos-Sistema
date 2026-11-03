# Revisão do módulo de Treinamentos — plano de implementação

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Passos com checkbox (`- [ ]`).

**Objetivo:** auditar a UX do módulo (shell e App Motoristas) e acrescentar edição do publicado, Reaplicar (reciclagem), push com lembrete e comprovante em PDF da versão lida.

**Arquitetura:** quatro fases, um PR por fase e por repositório. Shell (`Sistema Betinhos`, `apps/shell/src/pages/treinamentos`) e schema (`packages/deploy/provision-treinamentos.ps1`) num repo; plugin, flow de push, redirect e tela do motorista no repo `App Motoristas`. O push reaproveita o padrão dos comunicados: a participação nasce com `cr40f_pushstatus` = Pendente, um flow observa Pendente e envia pelo Power Apps Notification V2, e uma Custom API reenfileira o lembrete.

**Tech Stack:** React 19 + TypeScript + `@betinhos/ui` + vitest (shell); `pdf-lib` (já em `apps/shell/package.json`); C# .NET Framework plugin + xUnit (`plugins/DriverRecordSharing`); PowerShell 7 (`packages/deploy/rodar-linux.sh`); `node --test` (App).

**Spec:** `docs/superpowers/specs/2026-11-01-treinamentos-design.md` (base) + as decisões abaixo (grilling de 03/11/2026, confirmadas pelo Renan).

## Decisões (03/11/2026)

1. Ordem: **Fase 1 UX → Fase 2 edição/Reaplicar → Fase 3 push → Fase 4 PDF**. Um PR por fase (por repo).
2. Admitido depois da publicação **não** recebe o treinamento. Nada muda.
3. Publicado: o RH edita **título, descrição, texto, vídeo, anexos e validade**. Quiz, assinatura e público ficam travados. As participações não mudam, ninguém é avisado, e a edição grava `cr40f_editadoem` (a auditoria guarda o histórico).
4. **Reaplicar** = rascunho copiado com título `"<título> (reciclagem dd/mm/aaaa)"` e validade vazia. O RH revisa e publica.
5. Push: reusa o padrão dos comunicados. Dispara na publicação (participação criada com Pendente). O botão **"Lembrar pendentes"** do painel reenfileira, **no máximo 1 lembrete a cada 24 h por participação**, com a regra no servidor. A Custom API nova é `cr40f_LembrarTreinamento`, no mesmo assembly do plugin dos comunicados.
6. PDF: comprovante **individual**, gerado no shell (pdf-lib), só para participação concluída. Ele imprime a **versão lida**: ao concluir, o app grava `cr40f_conteudosnapshot` e `cr40f_conteudohash` (SHA-256 do snapshot).
7. Escopo de ambiente: cada fase mergeada e validada no **DEV**. O PROD continua congelado até o Renan decidir, pelo workflow "Publicar soluções".
8. UX: ux-audit modo **Fluxo** no shell (RH) e no App (motorista), em mock local.

## Global Constraints

- Publicação só da `main` no checkout principal; nunca `pnpm push`, `sitemap:*` ou `provision-*` com `-Apply` a partir de worktree ou sessão cloud (CLAUDE.md do repo). Scripts no Linux: `packages/deploy/rodar-linux.sh <script.ps1> [-Apply]`.
- Nunca dois `pnpm push` em paralelo. Após publicar: commit `build: Sistema Betinhos vX.Y.Z publicado no DEV a partir da main`.
- PROD é somente leitura nesta revisão.
- Prefixo do schema: `cr40f_`. Choices novos começam em `100000000`.
- Texto da UI em pt-BR com acentos; datas em `America/Sao_Paulo` (`formatDate`, `todaySaoPaulo`).
- Drawer/diálogo: Esc e clique fora fecham; alteração não salva abre "Descartar alterações?" ("Continuar editando" / "Descartar").
- Arquivos só no SharePoint BetinhosGestoInterna (`Treinamentos/<id>`, no DEV `Treinamentos/DEV/<id>`); nunca OneDrive.
- Antes de cada PR: skills `qualidade-antes-do-pr` e `verificacao-manter` (`verificar-treinamentos` atualizada no mesmo commit). Commits em português, detalhados.
- Testes do shell: `cd apps/shell && pnpm exec vitest run src/pages/treinamentos`; tipos: `pnpm typecheck` na raiz. Testes do App: `pnpm test` (node --test). Plugin: `dotnet test plugins/DriverRecordSharing.Tests`.

## Mapa de arquivos

**Sistema Betinhos**
- `packages/deploy/provision-treinamentos.ps1`: colunas novas (F2: `cr40f_editadoem`; F3: `cr40f_pushstatus`, `cr40f_pusherro`, `cr40f_lembradoem`; F4: `cr40f_conteudosnapshot`, `cr40f_conteudohash`).
- `apps/shell/src/pages/treinamentos/domain/treinamentos.ts`: tipos, mapeamento, `edicaoPublicadoPayload`, `copiaParaReciclagem`, `anexoDaPasta`, `PUSH` e `pushLabel`.
- `apps/shell/src/pages/treinamentos/domain/comprovante.ts` (novo): `dadosComprovante` (puro).
- `apps/shell/src/pages/treinamentos/data/comprovantePdf.ts` (novo): `gerarComprovantePdf` (pdf-lib).
- `apps/shell/src/pages/treinamentos/data/source.ts` e `data/mock.ts`: `salvarPublicado`, `lembrar`, guarda de exclusão de anexo e push na criação.
- `apps/shell/src/pages/treinamentos/components/TreinamentoEditor.tsx`: modo publicado.
- `apps/shell/src/pages/treinamentos/components/TreinamentoPainel.tsx`: Editar, Reaplicar, Lembrar, status do push e Baixar comprovante.
- `apps/shell/src/pages/treinamentos/TreinamentosPage.tsx`: rota `editar=<id>` para o publicado e o modelo de Reaplicar.
- `.claude/skills/verificar-treinamentos/SKILL.md`: roteiro novo.

**App Motoristas**
- `plugins/DriverRecordSharing/TreinamentoCommandPlugin.cs` (novo) + `plugins/DriverRecordSharing.Tests/TreinamentoCommandPluginTests.cs` (novo).
- `scripts/provision-treinamentos-push.ps1` (novo): Custom API + flow "Push Treinamentos | Motoristas". `scripts/push-dev.ps1` passa a chamá-lo.
- `webresources/new_appmotoristas_push_redirect.js`: rota `cr40f_treinamentoparticipacao` → `treinamentoId=`.
- `src/app/navigation.ts`, `src/screens/TreinamentosScreen.tsx`: abrir pelo `treinamentoId`.
- `src/lib/treinamentos.ts` + `tests/treinamentos.test.ts`: snapshot e hash na conclusão.

---

# Fase 1 — Auditoria de UX (PR de documentação nos dois repos)

### Tarefa 1: ux-audit Fluxo no shell (RH)

**Arquivos:**
- Criar: `docs/evidencias/treinamentos/ux-fluxo-shell-2026-11-03.md` (+ screenshots em `docs/evidencias/treinamentos/img/`)

- [ ] **Passo 1:** Subir o mock: `pnpm dev` (porta da config local do shell; conferir PID/comando se ocupada, sem fallback silencioso). Abrir `http://localhost:<porta>/#/treinamentos`.
- [ ] **Passo 2:** Carregar a skill `ux-audit` (modo **Fluxo**) com a referência `~/.claude/skills/ux-audit/references/betinhos-adaptation.md`. Tarefa real: "O RH cria 'Embarque no GRU v2' com texto, 1 anexo PDF, quiz de 2 perguntas e assinatura, público Por função = Motorista, validade em 10 dias; publica; abre o painel; filtra Pendentes; abre o detalhe de quem reprovou." Rodar em 1366×800 e 375 px.
- [ ] **Passo 3:** Gravar o relatório com: veredito; achados numerados `UX-S<n>` (passos de reprodução, evidência, arquivo:linha suspeito, correção proposta, severidade); gates da skill (console = 0, axe Critical/Serious = 0).
- [ ] **Passo 4:** Commit: `docs(treinamentos): auditoria de UX do fluxo do RH no shell`.

### Tarefa 2: ux-audit Fluxo no App Motoristas (motorista)

**Arquivos:**
- Criar (repo App Motoristas): `docs/evidencias/treinamentos/ux-fluxo-app-2026-11-03.md`

- [ ] **Passo 1:** No App Motoristas, `pnpm dev` (mock via `isMockTreinamentos()` em localhost). Abrir a tela Treinamentos.
- [ ] **Passo 2:** ux-audit **Fluxo** em 375×812: "O motorista abre '[Mock] Atendimento premium', lê, assiste ao vídeo, assina, erra o quiz, tenta de novo e conclui." Incluir `?mockTreinamentoErro=gravar` para o estado de erro.
- [ ] **Passo 3:** Relatório com achados `UX-A<n>` no mesmo formato da Tarefa 1.
- [ ] **Passo 4:** Commit no repo App: `docs(treinamentos): auditoria de UX do fluxo do motorista`.

### Tarefa 3: Triagem dos achados

**Arquivos:**
- Modificar: este plano, seção nova "Achados da Fase 1" no fim.

- [ ] **Passo 1:** Para cada achado `UX-S*`/`UX-A*`: classificar como (a) resolvido por uma tarefa existente (citar o número), (b) correção nova, escrita como tarefa completa (arquivos, teste, código) e encaixada na fase que mexe no mesmo arquivo, ou (c) fora do escopo.
- [ ] **Passo 2:** Levar ao Renan, num card `AskUserQuestion`, só os achados (b) de severidade média ou maior (até 4 por card). Os outros entram como (b) sem pergunta.
- [ ] **Passo 3:** Commit: `docs(treinamentos): triagem dos achados de UX no plano`. Abrir os PRs de documentação (um por repo).

---

# Fase 2 — Edição do publicado e Reaplicar (PR Sistema Betinhos)

### Tarefa 4: Coluna `cr40f_editadoem`

**Arquivos:**
- Modificar: `packages/deploy/provision-treinamentos.ps1` (bloco de atributos de `cr40f_treinamento`, junto de `cr40f_publicadoem`; lista de verificação no fim, perto da linha 271)

- [ ] **Passo 1:** Ao lado do `Ensure-AttributeOn` de `cr40f_PublicadoEm`, acrescentar:

```powershell
Ensure-AttributeOn "cr40f_treinamento" (DateTimeUtc "cr40f_EditadoEm" "Editado em" "Ultima edicao de conteudo ou validade depois de publicado; as participacoes nao mudam")
```

- [ ] **Passo 2:** Acrescentar `"cr40f_editadoem"` ao array de verificação das colunas do treinamento (o mesmo padrão do array `$part` da linha 271).
- [ ] **Passo 3:** Rodar em DRY RUN: `packages/deploy/rodar-linux.sh packages/deploy/provision-treinamentos.ps1` → esperado `DRY RUN OK; use -Apply` e "criaria cr40f_editadoem". **Não** rodar `-Apply` da worktree: isso fica para a `main`, depois do merge (Tarefa 8).
- [ ] **Passo 4:** Commit: `feat(treinamentos): coluna cr40f_editadoem no provisionamento`.

### Tarefa 5: Regras de domínio (edição, reciclagem, anexo da pasta)

**Arquivos:**
- Modificar: `apps/shell/src/pages/treinamentos/domain/treinamentos.ts`
- Teste: `apps/shell/src/pages/treinamentos/domain/domain.test.ts`

**Interfaces (produz):**
- `Treinamento.editadoEm: string | null`
- `edicaoPublicadoPayload(item: Treinamento, agora?: string): Row`
- `copiaParaReciclagem(item: Treinamento, hoje: string): Treinamento` (`hoje` = `AAAA-MM-DD`)
- `anexoDaPasta(anexo: Anexo, treinamentoId: string): boolean`

- [ ] **Passo 1: testes que falham** (acrescentar ao `domain.test.ts`, reaproveitando a fábrica de treinamento já existente no arquivo; se não houver, usar `{ ...emptyDraft(), ...extra }`):

```ts
import { anexoDaPasta, copiaParaReciclagem, edicaoPublicadoPayload, emptyDraft, ESTADO, mapTreinamento } from './treinamentos'

describe('edição do publicado', () => {
  const publicado = { ...emptyDraft(), id: 'abc', titulo: ' Embarque ', descricao: 'd', conteudo: 'c', videoUrl: '', validade: '2026-12-01', estado: ESTADO.publicado, publicadoEm: '2026-11-01T10:00:00Z', exigeQuiz: true, notaMinima: 80 }

  it('grava só conteúdo, anexos, validade e editadoem', () => {
    const payload = edicaoPublicadoPayload(publicado, '2026-11-03T12:00:00.000Z')
    expect(Object.keys(payload).sort()).toEqual(['cr40f_anexosjson', 'cr40f_conteudo', 'cr40f_descricao', 'cr40f_editadoem', 'cr40f_name', 'cr40f_validade', 'cr40f_videourl'])
    expect(payload.cr40f_name).toBe('Embarque')
    expect(payload.cr40f_editadoem).toBe('2026-11-03T12:00:00.000Z')
  })

  it('validade vazia vira null', () => {
    expect(edicaoPublicadoPayload({ ...publicado, validade: '' }).cr40f_validade).toBeNull()
  })

  it('mapeia cr40f_editadoem', () => {
    expect(mapTreinamento({ cr40f_editadoem: '2026-11-03T12:00:00Z' }).editadoEm).toBe('2026-11-03T12:00:00Z')
    expect(mapTreinamento({}).editadoEm).toBeNull()
  })
})

describe('reciclagem', () => {
  const base = { ...emptyDraft(), id: 'abc', titulo: 'Direção defensiva', validade: '2026-01-10', estado: ESTADO.publicado, publicadoEm: '2026-01-01T10:00:00Z', editadoEm: '2026-01-02T10:00:00Z', exigeQuiz: true }

  it('vira rascunho novo, sem id, validade nem datas, com o sufixo de reciclagem', () => {
    const copia = copiaParaReciclagem(base, '2026-11-03')
    expect(copia).toMatchObject({ id: '', estado: ESTADO.rascunho, publicadoEm: null, editadoEm: null, validade: '', exigeQuiz: true, titulo: 'Direção defensiva (reciclagem 03/11/2026)' })
  })

  it('não empilha sufixos de reciclagem', () => {
    const segunda = copiaParaReciclagem({ ...base, titulo: 'Direção defensiva (reciclagem 03/11/2025)' }, '2026-11-03')
    expect(segunda.titulo).toBe('Direção defensiva (reciclagem 03/11/2026)')
  })

  it('respeita o limite de 200 caracteres', () => {
    expect(copiaParaReciclagem({ ...base, titulo: 'x'.repeat(200) }, '2026-11-03').titulo.length).toBe(200)
  })
})

describe('anexoDaPasta', () => {
  const id = 'AAAA-1'
  it('só reconhece arquivo na pasta do próprio treinamento', () => {
    expect(anexoDaPasta({ nome: 'a.pdf', caminho: '/Documentos Compartilhados/Treinamentos/DEV/aaaa-1/a.pdf', tamanho: 1, mime: 'application/pdf' }, id)).toBe(true)
    expect(anexoDaPasta({ nome: 'a.pdf', caminho: '/Documentos Compartilhados/Treinamentos/bbbb-2/a.pdf', tamanho: 1, mime: 'application/pdf' }, id)).toBe(false)
  })
})
```

- [ ] **Passo 2:** `cd apps/shell && pnpm exec vitest run src/pages/treinamentos/domain` → FALHA (funções inexistentes).
- [ ] **Passo 3: implementar** em `treinamentos.ts`:

```ts
// Treinamento: novo campo, depois de publicadoEm
  /** Última edição de conteúdo ou validade depois de publicado. */
  editadoEm: string | null

// emptyDraft(): acrescentar `editadoEm: null`
// mapTreinamento(): acrescentar `editadoEm: dateOrNull(row.cr40f_editadoem),`

/** Edição depois de publicado: conteúdo, anexos e validade. Quiz, assinatura e público ficam como foram publicados. */
export function edicaoPublicadoPayload(item: Treinamento, agora = new Date().toISOString()): Row {
  return {
    cr40f_name: item.titulo.trim(),
    cr40f_descricao: item.descricao.trim(),
    cr40f_conteudo: item.conteudo.trim(),
    cr40f_videourl: item.videoUrl.trim(),
    cr40f_anexosjson: JSON.stringify(item.anexos),
    cr40f_validade: item.validade || null,
    cr40f_editadoem: agora,
  }
}

const SUFIXO_RECICLAGEM = /\s*\(reciclagem \d{2}\/\d{2}\/\d{4}\)\s*$/

/** Reaplicar: rascunho novo com o mesmo conteúdo, quiz e público; o RH revisa a validade e publica. */
export function copiaParaReciclagem(item: Treinamento, hoje: string): Treinamento {
  const [a, m, d] = hoje.split('-')
  const sufixo = ` (reciclagem ${d}/${m}/${a})`
  const base = item.titulo.replace(SUFIXO_RECICLAGEM, '').trim().slice(0, TITULO_MAX - sufixo.length)
  return { ...item, id: '', titulo: `${base}${sufixo}`, validade: '', estado: ESTADO.rascunho, publicadoEm: null, editadoEm: null, anexos: [...item.anexos], perguntas: item.perguntas.map((p) => ({ ...p, alternativas: p.alternativas.map((x) => ({ ...x })) })) }
}

/** Arquivo gravado na pasta deste treinamento. A cópia de reciclagem aponta para a pasta do original, que não pode ser apagada por ela. */
export const anexoDaPasta = (anexo: Anexo, treinamentoId: string) =>
  anexo.caminho.toLowerCase().includes(`/${cleanId(treinamentoId).toLowerCase()}/`)
```

Ajustar quem monta `Treinamento` sem `editadoEm` (o `tsc` aponta): `data/mock.ts` (os três itens com `editadoEm: null`) e as fábricas de teste.

- [ ] **Passo 4:** `pnpm exec vitest run src/pages/treinamentos/domain` → PASSA. `pnpm typecheck` (raiz) → sem erros.
- [ ] **Passo 5:** Commit: `feat(treinamentos): regras de edição do publicado e de reciclagem`.

### Tarefa 6: Source — `salvarPublicado` e guarda de anexo

**Arquivos:**
- Modificar: `apps/shell/src/pages/treinamentos/data/source.ts`, `apps/shell/src/pages/treinamentos/data/mock.ts`

**Interfaces (produz):** `Source.salvarPublicado(item: Treinamento): Promise<void>`. `excluirAnexo` passa a só tirar da lista o anexo de outra pasta.

- [ ] **Passo 1:** No tipo `Source`, acrescentar:

```ts
  /** Publicado: grava conteúdo, anexos e validade (+ editadoem). Quiz, assinatura e público não mudam; participações intactas. */
  salvarPublicado: (item: Treinamento) => Promise<void>
```

- [ ] **Passo 2:** Acrescentar `cr40f_editadoem` ao `TREINAMENTO_SELECT`. Implementar no Dataverse:

```ts
    async salvarPublicado(item) {
      const error = validarRascunho(item)
      if (error) throw new Error(error)
      const s = await entitySets()
      const [atual] = await client.getAll(`${s.treinamento}?$select=cr40f_estado&$filter=cr40f_treinamentoid eq ${cleanId(item.id)}`)
      if (!atual || Number(atual.cr40f_estado) !== ESTADO.publicado) throw new Error('Este treinamento não está publicado. Atualize a lista.')
      await client.update(s.treinamento, item.id, edicaoPublicadoPayload(item))
    },
```

  E trocar `excluirAnexo` para:

```ts
    async excluirAnexo(treinamentoId, anexo) {
      // A cópia de reciclagem herda arquivos do original: tira da lista sem apagar o arquivo do outro treinamento.
      if (!anexoDaPasta(anexo, treinamentoId)) return
      await sharepoint.excluir(cleanId(treinamentoId), documentoDoAnexo(anexo))
    },
```

- [ ] **Passo 3:** No mock (`createMockSource`), implementar `salvarPublicado`: valida com `validarRascunho`; recusa se o item não for publicado (`'Este treinamento não está publicado. Atualize a lista.'`); aplica os campos de `edicaoPublicadoPayload` ao item em memória (`titulo`, `descricao`, `conteudo`, `videoUrl`, `anexos`, `validade`, `editadoEm`), após `await wait(150)`.
- [ ] **Passo 4:** `pnpm typecheck` → sem erros.
- [ ] **Passo 5:** Commit: `feat(treinamentos): gravação do publicado e anexo herdado na reciclagem`.

### Tarefa 7: Editor em modo publicado, Editar e Reaplicar no painel

**Arquivos:**
- Modificar: `components/TreinamentoEditor.tsx`, `components/TreinamentoPainel.tsx`, `TreinamentosPage.tsx`
- Teste: `TreinamentosPage.test.tsx`

**Interfaces:**
- Consome: `Source.salvarPublicado`, `copiaParaReciclagem`, `isPublicado`.
- Produz: props novas do painel `onEditar: () => void` e `onReaplicar: () => void`. O editor deriva o modo de `isPublicado(initial)`.

- [ ] **Passo 1: testes que falham** (em `TreinamentosPage.test.tsx`):

```tsx
  it('edita o texto e a validade do publicado sem mexer no quiz nem no público', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('button', { name: /Embarque no GRU/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Editar conteúdo' }))
    expect(await screen.findByRole('heading', { name: 'Editar treinamento publicado' })).toBeTruthy()
    expect((screen.getByRole('switch', { name: 'Exige quiz' }) as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Publicar treinamento' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: 'Texto' }), { target: { value: 'Encontro na porta 5.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText('Alterações salvas. As participações continuam como estavam.')).toBeTruthy()
    expect(await screen.findByText('Encontro na porta 5.')).toBeTruthy() // painel mostra o conteúdo novo
    expect(await screen.findAllByText('Concluído')).toHaveLength(2) // participações intactas
  })

  it('Reaplicar abre um rascunho copiado com o sufixo de reciclagem', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('button', { name: /Direção defensiva/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reaplicar' }))
    const titulo = await screen.findByRole('textbox', { name: 'Título' }) as HTMLInputElement
    expect(titulo.value).toMatch(/^Direção defensiva: revisão anual \(reciclagem \d{2}\/\d{2}\/\d{4}\)$/)
    expect((screen.getByLabelText('Validade (prazo para concluir)') as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('button', { name: 'Publicar treinamento' })).toBeTruthy()
  })
```

  (Se o `Switch` do DS não expõe `role="switch"`, usar `getByLabelText('Exige quiz')`; conferir no primeiro teste existente que usa Switch.)

- [ ] **Passo 2:** `pnpm exec vitest run src/pages/treinamentos/TreinamentosPage.test.tsx` → os dois testes FALHAM.
- [ ] **Passo 3: TreinamentosPage.** Modelo de Reaplicar e rota de edição:

```tsx
  const [modelo, setModelo] = useState<Treinamento | null>(null)
  const startNew = useCallback(() => { setModelo(null); setCreateKey((n) => n + 1); setTarget({ mode: 'create' }) }, [setTarget])
  const reaplicar = useCallback((item: Treinamento) => { setModelo(copiaParaReciclagem(item, todaySaoPaulo())); setCreateKey((n) => n + 1); setTarget({ mode: 'create' }) }, [setTarget])
  const editar = useCallback((id: string) => setTarget({ mode: 'edit', id }), [setTarget])
```

  No `body`:

```tsx
  if (target?.mode === 'create') {
    body = editor(modelo ?? emptyDraft(), `novo-${createKey}`)
  } else if (target && !data.loaded) { /* igual */ }
  else if (target && !selected) { /* igual */ }
  else if (selected) {
    body = isPublicado(selected) && target?.mode !== 'edit'
      ? <TreinamentoPainel key={selected.id} item={selected} funcionarios={data.funcionarios} source={source} onBack={goHome} onEditar={() => editar(selected.id)} onReaplicar={() => reaplicar(selected)} />
      : editor(selected, `${selected.id}-${target?.mode}`, isPublicado(selected) ? undefined : async () => { goHome(); await data.reload() })
  }
```

  Importar `todaySaoPaulo` de `@betinhos/ui` e `copiaParaReciclagem` do domínio. `onBack` do editor de publicado volta ao painel: passar `onBack={isPublicado(initial) ? () => open(initial.id) : goHome}` dentro da função `editor` (ajustar a assinatura para receber `initial` e decidir ali).

- [ ] **Passo 4: TreinamentoEditor.** `const publicado = isPublicado(initial)` e `const travado = lock || publicado` para quiz, assinatura e público.
  - Título do `PageHeader`: `publicado ? 'Editar treinamento publicado' : draft.id ? 'Editar treinamento' : 'Novo treinamento'`. Breadcrumb `publicado ? 'Editar publicado' : ...`. Meta `<StatusBadge tone={publicado ? 'success' : 'neutral'}>{publicado ? 'Publicado' : 'Rascunho'}</StatusBadge>`.
  - Descrição no publicado: `'Corrija texto, vídeo, anexos ou validade. Quiz, assinatura e público ficam como foram publicados, e quem já concluiu continua concluído.'`
  - `Switch`, `Input` de nota, `QuizEditor`, `SegmentedControl`, `Checkbox` e `SearchBox` do público usam `disabled={travado}`. Validade e conteúdo continuam com `disabled={lock}`.
  - No publicado, a ação é só `Salvar alterações`:

```tsx
  const salvarPublicado = async () => {
    const problema = validarRascunho(draft)
    if (problema) { setErro(problema); return }
    setBusy('save')
    try {
      await source.salvarPublicado(draft)
      toast({ tone: 'success', message: 'Alterações salvas. As participações continuam como estavam.' })
      await onSaved(draft.id)
    } catch (error) {
      toast({ tone: 'danger', message: erroTexto(error, 'Não foi possível salvar as alterações.') })
    } finally {
      setBusy(null)
    }
  }
```

```tsx
      <div className="tr-form__actions">
        {publicado
          ? <Button icon={<Save size={16} />} disabled={lock} loading={busy === 'save'} onClick={() => void salvarPublicado()}>Salvar alterações</Button>
          : <>{/* botões atuais: Excluir rascunho, Salvar rascunho, Publicar */}</>}
      </div>
```

  - `anexosAlterados` continua igual: `salvarAnexos` já vale para o publicado. No publicado, `garantirId` nunca roda porque o id existe.
  - A prévia e o "Descartar alterações?" continuam iguais.
  - `onSaved(id)` da página recarrega e chama `open(id)`, que volta ao painel. Nada muda ali.

- [ ] **Passo 5: TreinamentoPainel.** Props `onEditar` e `onReaplicar`. Ações do header, nesta ordem: Voltar, Atualizar, `<Button variant="secondary" icon={<Pencil size={16} />} onClick={onEditar}>Editar conteúdo</Button>`, `<Button variant="secondary" icon={<Repeat size={16} />} onClick={onReaplicar}>Reaplicar</Button>` (ícones `Pencil` e `Repeat` do lucide). Na `description`, quando `item.editadoEm`: acrescentar ` · editado em ${formatDate(item.editadoEm)}`.
- [ ] **Passo 6:** `pnpm exec vitest run src/pages/treinamentos` → todos PASSAM. `pnpm typecheck` → sem erros.
- [ ] **Passo 7:** Commit: `feat(treinamentos): editar o publicado sem resetar participações e Reaplicar como rascunho`.

### Tarefa 8: Verificação e PR da Fase 2

- [ ] **Passo 1:** Atualizar `.claude/skills/verificar-treinamentos/SKILL.md`:
  - **Cobre:** acrescentar "edição do publicado (conteúdo/anexos/validade; quiz/assinatura/público travados; `cr40f_editadoem`)" e "Reaplicar (rascunho com sufixo `(reciclagem dd/mm/aaaa)`, validade vazia; anexo herdado não é apagado do SharePoint ao sair da cópia)".
  - **Roteiro em mock:** os dois fluxos do Passo 1 da Tarefa 7.
  - **DEV:** o PATCH do publicado leva só `cr40f_name, cr40f_descricao, cr40f_conteudo, cr40f_videourl, cr40f_anexosjson, cr40f_validade, cr40f_editadoem`.
- [ ] **Passo 2:** `qualidade-antes-do-pr` e `verificacao-manter`. Depois, ux-audit **Rápido** no mock (editar e reaplicar, 1366 e 375 px).
- [ ] **Passo 3:** Commit da skill + PR `feat(treinamentos): edição do publicado e Reaplicar`. No corpo: "Depois do merge, na main do checkout principal: `rodar-linux.sh packages/deploy/provision-treinamentos.ps1 -Apply` (cria `cr40f_editadoem`) **antes** do `pnpm push`."
- [ ] **Passo 4 (após o merge, checkout principal, `main`):** `git pull`; `provision-treinamentos.ps1 -Apply`; `pnpm push`; commit do bump; no DEV autenticado, editar um publicado de teste e conferir no Network o PATCH sem `cr40f_quizjson`/`cr40f_publicojson`.

---

# Fase 3 — Push na publicação e "Lembrar pendentes"

**Ordem de entrega (obrigatória):** (1) PR Sistema com o schema da Tarefa 9, mergeado e aplicado no DEV → (2) PR App com plugin, Custom API e flow (Tarefas 11–12), `pnpm push` do App no DEV → (3) PR Sistema com o shell (Tarefa 10) → `pnpm push`. Se o shell entrar antes do flow, as participações criadas nesse intervalo ficam Pendente sem envio.

### Tarefa 9: Colunas de push na participação

**Arquivos:**
- Modificar: `packages/deploy/provision-treinamentos.ps1` (atributos de `cr40f_treinamentoparticipacao` e array `$part`, linha 271)

- [ ] **Passo 1:** Acrescentar ao lado de `cr40f_ConcluidoEm`:

```powershell
Ensure-AttributeOn "cr40f_treinamentoparticipacao" (Picklist "cr40f_PushStatus" "Status do push" "Pendente: o flow Push Treinamentos envia e grava Enviado ou Falhou" @("Pendente", "Enviado", "Falhou"))
Ensure-AttributeOn "cr40f_treinamentoparticipacao" (Text "cr40f_PushErro" "Erro do push" "Mensagem do conector quando o push falha" 1000)
Ensure-AttributeOn "cr40f_treinamentoparticipacao" (DateTimeUtc "cr40f_LembradoEm" "Lembrado em" "Ultimo lembrete enfileirado pela Custom API cr40f_LembrarTreinamento (1 a cada 24 h)")
```

  (Conferir no `Picklist` se os valores são gerados a partir de 100000000 na ordem dos rótulos; se a função exigir valores explícitos, usar 100000000/100000001/100000002.)

- [ ] **Passo 2:** Acrescentar `"cr40f_pushstatus", "cr40f_pusherro", "cr40f_lembradoem"` ao `$part`.
- [ ] **Passo 3:** DRY RUN → "criaria" as três colunas. Commit: `feat(treinamentos): colunas de push na participação`. PR curto. Depois do merge, `-Apply` na `main`.

### Tarefa 10: Shell — push na criação, status e lembrete no painel

**Arquivos:**
- Modificar: `domain/treinamentos.ts`, `domain/domain.test.ts`, `data/source.ts`, `data/mock.ts`, `components/TreinamentoPainel.tsx`, `TreinamentosPage.test.tsx`

**Interfaces (produz):**
- `PUSH = { pendente: 100000000, enviado: 100000001, falhou: 100000002 } as const`
- `Participacao.pushStatus: number | null`, `pushErro: string`, `lembradoEm: string | null`
- `pushLabel(p: Participacao): string`
- `podeLembrar(p: Participacao, agora: number): boolean` (só dica de UI; a regra vale no servidor)
- `Source.lembrar(treinamentoId: string, participacaoId?: string): Promise<{ enfileirados: number; ignorados: number }>`

- [ ] **Passo 1: testes que falham** (`domain.test.ts`):

```ts
import { mapParticipacao, podeLembrar, pushLabel, PUSH } from './treinamentos'

describe('push da participação', () => {
  const base = mapParticipacao({ cr40f_treinamentoparticipacaoid: 'p1' })
  it('mapeia status, erro e lembrete', () => {
    const p = mapParticipacao({ cr40f_pushstatus: PUSH.falhou, cr40f_pusherro: 'Dispositivo não registrado', cr40f_lembradoem: '2026-11-03T10:00:00Z' })
    expect(p).toMatchObject({ pushStatus: PUSH.falhou, pushErro: 'Dispositivo não registrado', lembradoEm: '2026-11-03T10:00:00Z' })
  })
  it('rotula o push', () => {
    expect(pushLabel({ ...base, pushStatus: null })).toBe('Sem push')
    expect(pushLabel({ ...base, pushStatus: PUSH.pendente })).toBe('Push na fila')
    expect(pushLabel({ ...base, pushStatus: PUSH.enviado })).toBe('Push enviado')
    expect(pushLabel({ ...base, pushStatus: PUSH.falhou, pushErro: 'x' })).toBe('Push falhou · x')
  })
  it('lembra pendente sem lembrete nas últimas 24 h; nunca concluído ou com push na fila', () => {
    const agora = Date.parse('2026-11-03T12:00:00Z')
    expect(podeLembrar({ ...base, pushStatus: PUSH.enviado }, agora)).toBe(true)
    expect(podeLembrar({ ...base, pushStatus: PUSH.enviado, lembradoEm: '2026-11-03T00:00:00Z' }, agora)).toBe(false)
    expect(podeLembrar({ ...base, pushStatus: PUSH.enviado, lembradoEm: '2026-11-02T11:59:00Z' }, agora)).toBe(true)
    expect(podeLembrar({ ...base, pushStatus: PUSH.pendente }, agora)).toBe(false)
    expect(podeLembrar({ ...base, pushStatus: PUSH.falhou, concluidoEm: '2026-11-03T09:00:00Z' }, agora)).toBe(false)
  })
})
```

- [ ] **Passo 2:** `vitest run src/pages/treinamentos/domain` → FALHA.
- [ ] **Passo 3: domínio**:

```ts
export const PUSH = { pendente: 100000000, enviado: 100000001, falhou: 100000002 } as const
export const LEMBRETE_INTERVALO_MS = 24 * 60 * 60 * 1000

// Participacao: + pushStatus: number | null; pushErro: string; lembradoEm: string | null
// mapParticipacao: +
//   pushStatus: typeof row.cr40f_pushstatus === 'number' ? row.cr40f_pushstatus : null,
//   pushErro: String(row.cr40f_pusherro ?? ''),
//   lembradoEm: dateOrNull(row.cr40f_lembradoem),

export function pushLabel(p: Participacao) {
  if (p.pushStatus === PUSH.enviado) return 'Push enviado'
  if (p.pushStatus === PUSH.falhou) return `Push falhou · ${p.pushErro || 'erro não informado'}`
  if (p.pushStatus === PUSH.pendente) return 'Push na fila'
  return 'Sem push'
}

/** Espelha a regra da Custom API cr40f_LembrarTreinamento: pendente, sem push na fila e sem lembrete nas últimas 24 h. */
export function podeLembrar(p: Participacao, agora: number) {
  if (isConcluida(p) || p.pushStatus === PUSH.pendente) return false
  return !p.lembradoEm || agora - Date.parse(p.lembradoEm) >= LEMBRETE_INTERVALO_MS
}
```

  Ajustar `participacao()` do mock e as fábricas de teste com `pushStatus: PUSH.enviado, pushErro: '', lembradoEm: null`. Deixar a participação 3 do mock com `pushStatus: PUSH.falhou, pushErro: 'Dispositivo não registrado'`.

- [ ] **Passo 4: source.** `PARTICIPACAO_SELECT` + `,cr40f_pushstatus,cr40f_pusherro,cr40f_lembradoem`. `participacaoPayload` + `cr40f_pushstatus: PUSH.pendente` (o flow dispara na criação). Novo método:

```ts
  /** Custom API cr40f_LembrarTreinamento: reenfileira o push dos pendentes (ou de uma participação), no máximo 1 a cada 24 h. */
  lembrar: (treinamentoId: string, participacaoId?: string) => Promise<{ enfileirados: number; ignorados: number }>
```

```ts
    async lembrar(treinamentoId, participacaoId) {
      const body: Record<string, string> = { cr40f_TreinamentoId: cleanId(treinamentoId) }
      if (participacaoId) body.cr40f_ParticipacaoId = cleanId(participacaoId)
      const out = await client.request<{ cr40f_Enfileirados?: number; cr40f_Ignorados?: number }>('cr40f_LembrarTreinamento', { method: 'POST', body: JSON.stringify(body) })
      return { enfileirados: Number(out?.cr40f_Enfileirados ?? 0), ignorados: Number(out?.cr40f_Ignorados ?? 0) }
    },
```

  Mock: aplica `podeLembrar(p, Date.now())` às participações do treinamento (ou só à indicada). As aptas viram `pushStatus = PUSH.enviado`, `pushErro = ''` e `lembradoEm = now`. Devolve as contagens.

- [ ] **Passo 5: painel.**
  - No header, `Lembrar pendentes` (`BellRing`), desabilitado quando `!rows.some((p) => podeLembrar(p, Date.now()))`, com `title` "Ninguém pode ser lembrado agora (concluído, push na fila ou lembrado nas últimas 24 h)".
  - Ao clicar: `const r = await source.lembrar(item.id)`; toast de sucesso `Lembrete enviado para ${r.enfileirados} ${plural(...)}`, mais ` · ${r.ignorados} lembrados nas últimas 24 h` quando houver; depois `await load()`. Erro: toast danger com `erroTexto`.
  - Na linha do funcionário, abaixo do status: `<small>{pushLabel(p)}</small>` com a classe `tr-push is-falhou` quando falhou.
  - No detalhe, com push falhou: `Reenviar push` → `source.lembrar(item.id, selected.id)`.
- [ ] **Passo 6: teste da página** (`TreinamentosPage.test.tsx`):

```tsx
  it('mostra o push falho e lembra os pendentes', async () => {
    render(<TreinamentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('button', { name: /Embarque no GRU/ }))
    expect(await screen.findByText('Push falhou · Dispositivo não registrado')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Lembrar pendentes' }))
    expect(await screen.findByText(/Lembrete enviado para 2 funcionários/)).toBeTruthy()
    expect((await screen.findByRole('button', { name: 'Lembrar pendentes' }) as HTMLButtonElement).disabled).toBe(true)
  })
```

- [ ] **Passo 7:** `vitest run src/pages/treinamentos` → PASSA; `pnpm typecheck` → sem erros. Commit: `feat(treinamentos): push na publicação e Lembrar pendentes no painel`.

### Tarefa 11: Plugin `TreinamentoCommandPlugin` (repo App Motoristas)

**Arquivos:**
- Criar: `plugins/DriverRecordSharing/TreinamentoCommandPlugin.cs`
- Criar: `plugins/DriverRecordSharing.Tests/TreinamentoCommandPluginTests.cs` (reusar o `FakeService` de `ComunicadoCommandPluginTests.cs`; se ele for `private`, extrair para um arquivo `FakeService.cs` com `internal`)

**Contrato da Custom API `cr40f_LembrarTreinamento`:** entrada `cr40f_TreinamentoId` (Guid, obrigatório) e `cr40f_ParticipacaoId` (Guid, opcional); saída `cr40f_Enfileirados` e `cr40f_Ignorados` (Integer). Privilégio de execução: `prvWritecr40f_Treinamento`.

- [ ] **Passo 1: testes que falham** (xUnit, no padrão de `ComunicadoCommandPluginTests`):

```csharp
[Fact] public void Enfileira_pendentes_sem_lembrete_recente_e_ignora_os_outros()
{
    var service = new FakeService();
    var treinamento = service.Add("cr40f_treinamento", ("cr40f_estado", new OptionSetValue(100000001)));
    var apta = service.Add("cr40f_treinamentoparticipacao", ("cr40f_treinamento", new EntityReference("cr40f_treinamento", treinamento)), ("cr40f_pushstatus", new OptionSetValue(100000001)));
    var recente = service.Add("cr40f_treinamentoparticipacao", ("cr40f_treinamento", new EntityReference("cr40f_treinamento", treinamento)), ("cr40f_pushstatus", new OptionSetValue(100000001)), ("cr40f_lembradoem", DateTime.UtcNow.AddHours(-2)));
    var concluida = service.Add("cr40f_treinamentoparticipacao", ("cr40f_treinamento", new EntityReference("cr40f_treinamento", treinamento)), ("cr40f_concluidoem", DateTime.UtcNow));
    var outputs = Execute(service, "cr40f_LembrarTreinamento", ("cr40f_TreinamentoId", treinamento));
    Assert.Equal(1, outputs["cr40f_Enfileirados"]);
    Assert.Equal(1, outputs["cr40f_Ignorados"]); // o recente; concluída nem entra na conta
    Assert.Equal(100000000, service.Get("cr40f_treinamentoparticipacao", apta).GetAttributeValue<OptionSetValue>("cr40f_pushstatus").Value);
    Assert.NotNull(service.Get("cr40f_treinamentoparticipacao", apta).GetAttributeValue<DateTime?>("cr40f_lembradoem"));
}

[Fact] public void Recusa_treinamento_em_rascunho()
{
    var service = new FakeService();
    var treinamento = service.Add("cr40f_treinamento", ("cr40f_estado", new OptionSetValue(100000000)));
    var error = Assert.Throws<InvalidPluginExecutionException>(() => Execute(service, "cr40f_LembrarTreinamento", ("cr40f_TreinamentoId", treinamento)));
    Assert.Contains("publicado", error.Message);
}

[Fact] public void Participacao_de_outro_treinamento_e_recusada()
{
    var service = new FakeService();
    var t1 = service.Add("cr40f_treinamento", ("cr40f_estado", new OptionSetValue(100000001)));
    var t2 = service.Add("cr40f_treinamento", ("cr40f_estado", new OptionSetValue(100000001)));
    var p = service.Add("cr40f_treinamentoparticipacao", ("cr40f_treinamento", new EntityReference("cr40f_treinamento", t2)), ("cr40f_pushstatus", new OptionSetValue(100000002)));
    Assert.Throws<InvalidPluginExecutionException>(() => Execute(service, "cr40f_LembrarTreinamento", ("cr40f_TreinamentoId", t1), ("cr40f_ParticipacaoId", p)));
}
```

  (`service.Add`, `service.Get` e `Execute` devem seguir os helpers que já existem em `ComunicadoCommandPluginTests.cs`; adaptar os nomes a eles, sem duplicar a infraestrutura.)

- [ ] **Passo 2:** `dotnet test plugins/DriverRecordSharing.Tests --filter TreinamentoCommandPlugin` → FALHA (classe inexistente).
- [ ] **Passo 3: implementar**:

```csharp
using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    /// Lembrete de treinamento: reenfileira o push (Pendente) das participações não concluídas, no máximo 1 a cada 24 h.
    /// O envio é do flow "Push Treinamentos | Motoristas", igual ao dos comunicados.
    public sealed class TreinamentoCommandPlugin : IPlugin
    {
        private const string Header = "cr40f_treinamento";
        private const string Participacao = "cr40f_treinamentoparticipacao";
        private const int Publicado = 100000001;
        private const int PushPendente = 100000000;
        private static readonly TimeSpan Intervalo = TimeSpan.FromHours(24);

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var caller = factory.CreateOrganizationService(context.InitiatingUserId);
            var system = factory.CreateOrganizationService(null);
            try
            {
                if (context.MessageName != "cr40f_LembrarTreinamento") throw new InvalidPluginExecutionException("Ação de treinamento desconhecida.");
                Lembrar(context, caller, system);
            }
            catch (InvalidPluginExecutionException) { throw; }
            catch (Exception error) { throw new InvalidPluginExecutionException("Falha ao lembrar o treinamento. Contate a operação.", error); }
        }

        private static Guid Input(IPluginExecutionContext context, string name, bool required)
        {
            if (context.InputParameters.Contains(name) && context.InputParameters[name] is Guid id && id != Guid.Empty) return id;
            if (required) throw new InvalidPluginExecutionException($"Parâmetro {name} obrigatório.");
            return Guid.Empty;
        }

        private static void Lembrar(IPluginExecutionContext context, IOrganizationService caller, IOrganizationService system)
        {
            var treinamentoId = Input(context, "cr40f_TreinamentoId", true);
            var participacaoId = Input(context, "cr40f_ParticipacaoId", false);
            // Lido pelo chamador: quem não enxerga o treinamento não lembra ninguém.
            var header = caller.Retrieve(Header, treinamentoId, new ColumnSet("cr40f_estado"));
            if (header.GetAttributeValue<OptionSetValue>("cr40f_estado")?.Value != Publicado)
                throw new InvalidPluginExecutionException("Só treinamento publicado pode ser lembrado.");

            var query = new QueryExpression(Participacao) { ColumnSet = new ColumnSet("cr40f_treinamento", "cr40f_pushstatus", "cr40f_lembradoem", "cr40f_concluidoem") };
            query.Criteria.AddCondition("cr40f_treinamento", ConditionOperator.Equal, treinamentoId);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            if (participacaoId != Guid.Empty) query.Criteria.AddCondition("cr40f_treinamentoparticipacaoid", ConditionOperator.Equal, participacaoId);
            var linhas = system.RetrieveMultiple(query).Entities;
            if (participacaoId != Guid.Empty && linhas.Count == 0) throw new InvalidPluginExecutionException("Participação não pertence a este treinamento.");

            var agora = DateTime.UtcNow;
            int enfileirados = 0, ignorados = 0;
            foreach (var p in linhas.Where((x) => !x.Contains("cr40f_concluidoem")))
            {
                var status = p.GetAttributeValue<OptionSetValue>("cr40f_pushstatus")?.Value;
                var lembrado = p.GetAttributeValue<DateTime?>("cr40f_lembradoem");
                if (status == PushPendente || (lembrado.HasValue && agora - lembrado.Value < Intervalo)) { ignorados++; continue; }
                var update = new Entity(Participacao, p.Id);
                update["cr40f_pushstatus"] = new OptionSetValue(PushPendente);
                update["cr40f_pusherro"] = "";
                update["cr40f_lembradoem"] = agora;
                system.Update(update);
                enfileirados++;
            }
            context.OutputParameters["cr40f_Enfileirados"] = enfileirados;
            context.OutputParameters["cr40f_Ignorados"] = ignorados;
        }
    }
}
```

  Se o `FakeService` não suporta `QueryExpression` com essas condições, estender o fake (filtro por igualdade de atributo), com um teste próprio do fake se ele já tiver testes.

- [ ] **Passo 4:** `dotnet test plugins/DriverRecordSharing.Tests` → tudo PASSA (incluindo os testes existentes).
- [ ] **Passo 5:** Commit: `feat(treinamentos): Custom API cr40f_LembrarTreinamento no plugin`.

### Tarefa 12: Provisionamento da API e do flow, redirect e deep link (repo App Motoristas)

**Arquivos:**
- Criar: `scripts/provision-treinamentos-push.ps1`
- Modificar: `scripts/push-dev.ps1`, `webresources/new_appmotoristas_push_redirect.js`, `tests/pushRedirect.test.ts`, `src/app/navigation.ts`, `src/screens/TreinamentosScreen.tsx`

- [ ] **Passo 1: script.** Copiar a estrutura de `scripts/provision-comunicados-push-flow.ps1` (leitura do `.env`, `Read-Dv`, conexão Dataverse e Notification V2, solução, ativação e verificação final) e da parte de Custom API de `provision-comunicados.ps1` (`Ensure-PluginType`, `Ensure-Api`). Diferenças:
  - `Ensure-PluginType "Betinhos.DriverRecordSharing.TreinamentoCommandPlugin"`. `Ensure-Api "cr40f_LembrarTreinamento" $typeId "prvWritecr40f_Treinamento"` com parâmetros `cr40f_TreinamentoId` (Type 12, obrigatório) e `cr40f_ParticipacaoId` (Type 12, opcional) e propriedades de resposta `cr40f_Enfileirados` e `cr40f_Ignorados` (Type 6 Integer). Se o `Ensure-Api` atual não cria response properties, acrescentar um `Ensure-ResponseProperty` no novo script, sem alterar o dos comunicados.
  - Flow `$flowName = "Push Treinamentos | Motoristas"`. Gatilho em `cr40f_treinamentoparticipacao`, mensagem Create+Update, `filteringattributes = "cr40f_pushstatus"`, `filterexpression = "cr40f_pushstatus eq 100000000"`.
  - Destinatário: em vez de `Get_owner` (systemuser), `Get_funcionario` = GetItem `cr40f_funcionarioses` com `recordId = @triggerOutputs()?['body/_cr40f_funcionario_value']` e `$select=cr40f_emailmicrosoft`. `payload/recipients = @outputs('Get_funcionario')?['body/cr40f_emailmicrosoft']`. Conferir o entity set real na metadata antes.
  - `payload/message = "Novo treinamento: @{triggerOutputs()?['body/cr40f_name']}"`. Como `cr40f_name` é "título · funcionário", usar o título via `Get_treinamento` (`_cr40f_treinamento_value`, `$select=cr40f_name`). `dynamicParams/entityLogicalName = "cr40f_treinamentoparticipacao"`, `recordId = triggerOutputs()?['body/cr40f_treinamentoparticipacaoid']`.
  - Sucesso: UpdateRecord `cr40f_pushstatus = 100000001`. Falha (Get_funcionario ou push com Failed/TimedOut): `cr40f_pushstatus = 100000002` e `cr40f_pusherro` com a mensagem do erro (`@{actions('Enviar_push')?['error']?['message']}`, como no flow dos comunicados).
  - Verificação final, no padrão do script dos comunicados: estado ativo, entidade do gatilho, `SendPushNotificationV2`, app `new_AppMotoristasv2`.
  - Form leve de push para `cr40f_treinamentoparticipacao`, com o OnLoad do redirect, seguindo `provision-push-redirect.ps1`. Se esse script já recebe a lista de tabelas, só acrescentar a tabela nele.
- [ ] **Passo 2:** `push-dev.ps1` executa `provision-treinamentos-push.ps1 -Apply` depois de `provision-comunicados.ps1` e valida no ZIP final a Custom API `cr40f_LembrarTreinamento`, como faz com as quatro dos comunicados.
- [ ] **Passo 3: redirect + teste.** Em `ROUTES` do redirect:

```js
    cr40f_treinamentoparticipacao: function (id) { return "treinamentoParticipacaoId=" + id; },
```

  Em `tests/pushRedirect.test.ts`, um caso no padrão do de comunicado: form de `cr40f_treinamentoparticipacao` com id `{ABC}` navega para `new_app-motoristas-v2` com `data=treinamentoParticipacaoId=abc`.
- [ ] **Passo 4: deep link no app.** Em `navigation.ts`, ler `treinamentoParticipacaoId` do `data` do mesmo jeito que `comunicadoId` e abrir a tela `treinamentos` com o item cuja `participacao.id` bate. Em `TreinamentosScreen.tsx`, aceitar `participacaoInicial?: string` e abrir o detalhe dela depois do carregamento; se não achar, ficar na lista. Teste em `tests/treinamentos.test.ts` ou no teste de navegação existente: parse de `treinamentoParticipacaoId=abc` → `{ screen: 'treinamentos', participacaoId: 'abc' }` (nome do campo conforme o tipo já usado para `comunicadoId`).
- [ ] **Passo 5:** `pnpm test` → PASSA. `pwsh -File scripts/provision-treinamentos-push.ps1` (sem `-Apply`) → DRY RUN OK.
- [ ] **Passo 6:** Commit: `feat(treinamentos): flow de push, Custom API e abertura pelo push`. PR no repo App. Depois do merge: `pnpm push` do App (checkout principal, `main`); disparar `cr40f_LembrarTreinamento` num treinamento de teste e conferir na participação `cr40f_pushstatus` 100000001 ou 100000002 com erro. Recebimento em aparelho é verificação separada: declarar "não verificado em aparelho" se não houver um.

### Tarefa 13: Verificação e PR do shell da Fase 3

- [ ] **Passo 1:** `verificar-treinamentos`: em Cobre, "push na criação (`cr40f_pushstatus` 100000000), status por funcionário, Lembrar pendentes (1 a cada 24 h, regra no plugin) e Reenviar push". No DEV: o POST de participação leva `cr40f_pushstatus: 100000000`, a chamada `cr40f_LembrarTreinamento` devolve as contagens, e o flow "Push Treinamentos | Motoristas" grava Enviado ou Falhou.
- [ ] **Passo 2:** `qualidade-antes-do-pr` + `verificacao-manter` + ux-audit Rápido (painel com push falho e lembrete).
- [ ] **Passo 3:** PR `feat(treinamentos): push e lembrete no painel`. No corpo, a dependência: "mergear só depois do flow ativo no DEV (PR do App)". Depois do merge: `pnpm push` e commit do bump.

---

# Fase 4 — Comprovante em PDF da versão lida

**Ordem:** schema (Tarefa 14) → App grava o snapshot (Tarefa 15, `pnpm push` do App) → shell gera o PDF (Tarefas 16–17).

### Tarefa 14: Colunas de snapshot

**Arquivos:**
- Modificar: `packages/deploy/provision-treinamentos.ps1`

- [ ] **Passo 1:**

```powershell
Ensure-AttributeOn "cr40f_treinamentoparticipacao" (Memo "cr40f_ConteudoSnapshot" "Conteudo lido" "JSON da versao do treinamento no momento da conclusao, gravado pelo App Motoristas" 120000)
Ensure-AttributeOn "cr40f_treinamentoparticipacao" (Text "cr40f_ConteudoHash" "Hash do conteudo lido" "SHA-256 (hex) do cr40f_conteudosnapshot" 64)
```

- [ ] **Passo 2:** `$part` + `"cr40f_conteudosnapshot", "cr40f_conteudohash"`. DRY RUN. Commit `feat(treinamentos): colunas do snapshot da versão lida`, PR curto e `-Apply` na `main` depois do merge.

### Tarefa 15: App grava snapshot e hash na conclusão (repo App Motoristas)

**Arquivos:**
- Modificar: `src/lib/treinamentos.ts`
- Teste: `tests/treinamentos.test.ts`

**Interfaces (produz):**
- `snapshotConteudo(item: Treinamento): string` (JSON estável, sem espaços)
- `sha256Hex(texto: string): Promise<string>`
- Formato do snapshot: `{"v":1,"titulo","descricao","conteudo","videoUrl","anexos":[{"nome","tamanho"}],"exigeAssinatura","exigeQuiz","notaMinima","publicadoEm","editadoEm"}`. O shell lê esse formato na Tarefa 16.

- [ ] **Passo 1: testes que falham:**

```ts
import { sha256Hex, snapshotConteudo } from "../src/lib/treinamentos.ts";

test("snapshot guarda a versão lida em JSON estável", () => {
  const json = snapshotConteudo(treinamento({ titulo: "Embarque", conteudo: "Porta 4", anexos: [{ nome: "mapa.pdf", caminho: "/x/mapa.pdf", tamanho: 10, mime: "application/pdf" }], editadoEm: "2026-11-03T12:00:00Z" }));
  const obj = JSON.parse(json);
  assert.equal(obj.v, 1);
  assert.equal(obj.titulo, "Embarque");
  assert.deepEqual(obj.anexos, [{ nome: "mapa.pdf", tamanho: 10 }]);
  assert.equal(obj.editadoEm, "2026-11-03T12:00:00Z");
  assert.equal(snapshotConteudo(treinamento({ titulo: "Embarque", conteudo: "Porta 4", anexos: [{ nome: "mapa.pdf", caminho: "/x/mapa.pdf", tamanho: 10, mime: "application/pdf" }], editadoEm: "2026-11-03T12:00:00Z" })), json);
});

test("sha256Hex devolve 64 hex", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
```

  Na fábrica `treinamento()` do teste, acrescentar `editadoEm: null`.

- [ ] **Passo 2:** `pnpm test` → FALHA.
- [ ] **Passo 3: implementar:**

```ts
// Treinamento: + editadoEm: string | null  (mapTreinamento: editadoEm: dateOrNull(row.cr40f_editadoem))
// TREINAMENTO_SELECT: + ,cr40f_editadoem

/** Versão que o motorista leu, gravada na conclusão: o RH pode editar o publicado depois e o comprovante prova esta. */
export function snapshotConteudo(item: Treinamento): string {
  return JSON.stringify({
    v: 1, titulo: item.titulo, descricao: item.descricao, conteudo: item.conteudo, videoUrl: item.videoUrl,
    anexos: item.anexos.map((a) => ({ nome: a.nome, tamanho: a.tamanho })),
    exigeAssinatura: item.exigeAssinatura, exigeQuiz: item.exigeQuiz, notaMinima: item.notaMinima,
    publicadoEm: item.publicadoEm, editadoEm: item.editadoEm,
  });
}

export async function sha256Hex(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
```

  `aplicar` passa a receber o treinamento e acrescenta o snapshot quando a mudança conclui:

```ts
async function aplicar(mudanca: Mudanca, item?: Treinamento) {
  if (item && mudanca.patch.cr40f_concluidoem) {
    const snapshot = snapshotConteudo(item);
    mudanca = { ...mudanca, patch: { ...mudanca.patch, cr40f_conteudosnapshot: snapshot, cr40f_conteudohash: await sha256Hex(snapshot) } };
  }
  // ... resto igual
}

export const confirmarLeitura = (item: TreinamentoMotorista) => aplicar(mudancaConfirmacao(item.treinamento, item.participacao), item.treinamento);
export const assinarTreinamento = (item: TreinamentoMotorista, strokes: SignatureStrokes, nome: string) => aplicar(mudancaAssinatura(item.treinamento, item.participacao, strokes, nome), item.treinamento);
// responderQuiz: const participacao = await aplicar(mudanca, item.treinamento);
```

  Um teste a mais, com o mock: concluir via `confirmarLeitura` num treinamento sem assinatura nem quiz grava `cr40f_conteudosnapshot` e `cr40f_conteudohash` na linha do store (`getMockStore()`), se o teste já usa o store; senão, cobrir só o payload puro.

- [ ] **Passo 4:** `pnpm test` → PASSA. Commit `feat(treinamentos): grava a versão lida e o hash ao concluir`. PR no App; depois do merge, `pnpm push` do App.

### Tarefa 16: Dados do comprovante (shell, puro)

**Arquivos:**
- Modificar: `domain/treinamentos.ts` (`Participacao` + `conteudoSnapshot: string`, `conteudoHash: string`; `mapParticipacao`; `PARTICIPACAO_SELECT` em `source.ts` + `,cr40f_conteudosnapshot,cr40f_conteudohash`)
- Criar: `domain/comprovante.ts`, `domain/comprovante.test.ts`

**Interfaces (produz):**

```ts
export type DadosComprovante = {
  arquivo: string                // "comprovante-<slug-do-titulo>-<slug-do-nome>.pdf"
  titulo: string
  funcionario: string
  publicadoEm: string           // formatDate
  concluidoEm: string
  abertoEm: string; confirmadoEm: string; assinadoEm: string
  nota: string                  // "85% · aprovado · 2 tentativas" ou ""
  versao: 'lida' | 'atual'      // 'atual' quando não há snapshot (concluiu antes desta mudança)
  aviso: string                 // texto para 'atual'; vazio para 'lida'
  descricao: string; conteudo: string; videoUrl: string; anexos: string[]
  hash: string
  assinatura: SignatureStrokes  // [] sem assinatura
  nomeAssinante: string
}
export function dadosComprovante(item: Treinamento, p: Participacao, nomeFuncionario: string): DadosComprovante
```

- [ ] **Passo 1: testes que falham** (`comprovante.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { dadosComprovante } from './comprovante'
import { emptyDraft, ESTADO, mapParticipacao } from './treinamentos'

const item = { ...emptyDraft(), id: 't1', titulo: 'Embarque no GRU', conteudo: 'Texto atual', estado: ESTADO.publicado, publicadoEm: '2026-11-01T13:00:00Z', exigeQuiz: true }
const base = mapParticipacao({ cr40f_treinamentoparticipacaoid: 'p1', cr40f_concluidoem: '2026-11-02T13:00:00Z', cr40f_nota: 85, cr40f_aprovado: true, cr40f_tentativas: 2 })

describe('dadosComprovante', () => {
  it('usa a versão lida quando há snapshot', () => {
    const p = { ...base, conteudoSnapshot: JSON.stringify({ v: 1, titulo: 'Embarque no GRU', descricao: '', conteudo: 'Texto lido', videoUrl: '', anexos: [{ nome: 'mapa.pdf', tamanho: 1 }] }), conteudoHash: 'ab'.repeat(32) }
    const d = dadosComprovante(item, p, 'Carlos Alberto')
    expect(d).toMatchObject({ versao: 'lida', conteudo: 'Texto lido', anexos: ['mapa.pdf'], hash: 'ab'.repeat(32), aviso: '', nota: '85% · aprovado · 2 tentativas' })
    expect(d.arquivo).toBe('comprovante-embarque-no-gru-carlos-alberto.pdf')
  })

  it('cai no conteúdo atual com aviso quando não há snapshot', () => {
    const d = dadosComprovante(item, { ...base, conteudoSnapshot: '', conteudoHash: '' }, 'Carlos')
    expect(d.versao).toBe('atual')
    expect(d.conteudo).toBe('Texto atual')
    expect(d.aviso).toBe('Concluído antes do registro da versão lida: este comprovante mostra o conteúdo atual do treinamento.')
  })

  it('recusa participação não concluída', () => {
    expect(() => dadosComprovante(item, { ...base, concluidoEm: null, conteudoSnapshot: '', conteudoHash: '' }, 'Carlos')).toThrow('Só participação concluída tem comprovante.')
  })
})
```

- [ ] **Passo 2:** `vitest run src/pages/treinamentos/domain` → FALHA.
- [ ] **Passo 3: implementar** `comprovante.ts`:

```ts
import { parseSignature, type SignatureStrokes } from '../../comunicados/domain/comunicados'
import { formatDate, plural, type Participacao, type Treinamento } from './treinamentos'

export type DadosComprovante = { /* como na Interface acima */ }

type Snapshot = { titulo?: string; descricao?: string; conteudo?: string; videoUrl?: string; anexos?: { nome?: string }[] }

const slug = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

function lerSnapshot(json: string): Snapshot | null {
  try { const v = JSON.parse(json) as Snapshot; return v && typeof v === 'object' ? v : null } catch { return null }
}

export function dadosComprovante(item: Treinamento, p: Participacao, nomeFuncionario: string): DadosComprovante {
  if (!p.concluidoEm) throw new Error('Só participação concluída tem comprovante.')
  const snap = p.conteudoSnapshot ? lerSnapshot(p.conteudoSnapshot) : null
  const fonte = snap ?? { titulo: item.titulo, descricao: item.descricao, conteudo: item.conteudo, videoUrl: item.videoUrl, anexos: item.anexos }
  const titulo = String(fonte.titulo ?? item.titulo)
  return {
    arquivo: `comprovante-${slug(titulo)}-${slug(nomeFuncionario)}.pdf`,
    titulo,
    funcionario: nomeFuncionario,
    publicadoEm: formatDate(item.publicadoEm),
    concluidoEm: formatDate(p.concluidoEm),
    abertoEm: formatDate(p.abertoEm), confirmadoEm: formatDate(p.confirmadoEm), assinadoEm: formatDate(p.assinadoEm),
    nota: p.nota == null ? '' : `${p.nota}% · ${p.aprovado ? 'aprovado' : 'reprovado'} · ${p.tentativas} ${plural(p.tentativas, 'tentativa', 'tentativas')}`,
    versao: snap ? 'lida' : 'atual',
    aviso: snap ? '' : 'Concluído antes do registro da versão lida: este comprovante mostra o conteúdo atual do treinamento.',
    descricao: String(fonte.descricao ?? ''), conteudo: String(fonte.conteudo ?? ''), videoUrl: String(fonte.videoUrl ?? ''),
    anexos: (fonte.anexos ?? []).map((a) => String(a?.nome ?? '')).filter(Boolean),
    hash: snap ? p.conteudoHash : '',
    assinatura: p.assinaturaJson ? parseSignature(p.assinaturaJson) : [],
    nomeAssinante: p.nomeAssinante,
  }
}
```

  `mapParticipacao`: `conteudoSnapshot: String(row.cr40f_conteudosnapshot ?? '')` e `conteudoHash: String(row.cr40f_conteudohash ?? '')`. Atualizar o mock (`participacao()` com `conteudoSnapshot: ''` e `conteudoHash: ''`; a participação 1 com um snapshot v1 e hash fictício `'0'.repeat(64)`, identificado como mock) e as fábricas de teste.

- [ ] **Passo 4:** PASSA + `pnpm typecheck`. Commit `feat(treinamentos): dados do comprovante pela versão lida`.

### Tarefa 17: PDF com pdf-lib e botão no painel

**Arquivos:**
- Criar: `data/comprovantePdf.ts`, `data/comprovantePdf.test.ts`
- Modificar: `components/TreinamentoPainel.tsx`, `TreinamentosPage.test.tsx`

**Interfaces:** consome `DadosComprovante`; produz `gerarComprovantePdf(d: DadosComprovante): Promise<Uint8Array>` e `paraWinAnsi(texto: string): string`.

- [ ] **Passo 1: testes que falham** (`comprovantePdf.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { gerarComprovantePdf, paraWinAnsi } from './comprovantePdf'
import type { DadosComprovante } from '../domain/comprovante'

const dados: DadosComprovante = {
  arquivo: 'comprovante-x-y.pdf', titulo: 'Embarque no GRU', funcionario: 'Márcio Lima', publicadoEm: '01/11/2026 10:00', concluidoEm: '02/11/2026 10:00',
  abertoEm: '02/11/2026 09:00', confirmadoEm: '02/11/2026 09:30', assinadoEm: '02/11/2026 09:40', nota: '85% · aprovado · 2 tentativas',
  versao: 'lida', aviso: '', descricao: 'Ponto de encontro', conteudo: '# Porta 4\n- Chegue 30 min antes 🚗\n\n' + 'Texto longo. '.repeat(600),
  videoUrl: 'https://youtu.be/x', anexos: ['mapa.pdf'], hash: 'ab'.repeat(32), assinatura: [[[0.1, 0.5], [0.5, 0.2], [0.9, 0.6]]], nomeAssinante: 'Márcio Lima',
}

describe('comprovante PDF', () => {
  it('gera PDF válido, com mais de uma página quando o texto é longo', async () => {
    const bytes = await gerarComprovantePdf(dados)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThan(1)
    expect(doc.getTitle()).toBe('Comprovante · Embarque no GRU · Márcio Lima')
  })
  it('remove o que a Helvetica não codifica e mantém os acentos', () => {
    expect(paraWinAnsi('Ação 🚗 · “ok”')).toBe('Ação  · “ok”')
  })
})
```

- [ ] **Passo 2:** `vitest run src/pages/treinamentos/data` → FALHA.
- [ ] **Passo 3: implementar** `comprovantePdf.ts`:

```ts
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { DadosComprovante } from '../domain/comprovante'
import { blocosDoConteudo } from '../domain/treinamentos'

const A4: [number, number] = [595.28, 841.89]
const MARGEM = 56
const LARGURA = A4[0] - MARGEM * 2
const COR = rgb(0.12, 0.12, 0.14)
const SUAVE = rgb(0.42, 0.42, 0.46)
// WinAnsi (Helvetica padrão): Latin-1 + aspas e travessões tipográficos. O resto (emoji etc.) sai.
const EXTRAS = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'])
export const paraWinAnsi = (texto: string) => [...texto].filter((c) => c === '\n' || (c >= ' ' && c.charCodeAt(0) <= 0xff) || EXTRAS.has(c)).join('')

function quebrar(texto: string, font: PDFFont, size: number, max: number) {
  const linhas: string[] = []
  for (const paragrafo of texto.split('\n')) {
    let atual = ''
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra
      if (font.widthOfTextAtSize(tentativa, size) <= max) atual = tentativa
      else { if (atual) linhas.push(atual); atual = palavra }
    }
    linhas.push(atual)
  }
  return linhas
}

/** Comprovante individual do treinamento concluído: dados, linha do tempo, versão lida (texto), hash e assinatura. */
export async function gerarComprovantePdf(d: DadosComprovante): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(paraWinAnsi(`Comprovante · ${d.titulo} · ${d.funcionario}`))
  pdf.setAuthor('Betinhos Executive Service')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page: PDFPage = pdf.addPage(A4)
  let y = A4[1] - MARGEM

  const espaco = (altura: number) => { if (y - altura < MARGEM) { page = pdf.addPage(A4); y = A4[1] - MARGEM } }
  const texto = (conteudo: string, opts: { size?: number; negrito?: boolean; cor?: typeof COR; depois?: number } = {}) => {
    const size = opts.size ?? 10
    const f = opts.negrito ? bold : font
    for (const linha of quebrar(paraWinAnsi(conteudo), f, size, LARGURA)) {
      espaco(size + 4)
      page.drawText(linha, { x: MARGEM, y: y - size, size, font: f, color: opts.cor ?? COR })
      y -= size + 4
    }
    y -= opts.depois ?? 0
  }
  const campo = (rotulo: string, valor: string) => { if (valor) texto(`${rotulo}: ${valor}`) }

  texto('Comprovante de treinamento', { size: 18, negrito: true, depois: 6 })
  texto(d.titulo, { size: 13, negrito: true, depois: 8 })
  campo('Funcionário', d.funcionario)
  campo('Publicado em', d.publicadoEm)
  campo('Abriu no app', d.abertoEm)
  campo('Confirmou a leitura', d.confirmadoEm)
  campo('Assinou', d.assinadoEm)
  campo('Quiz', d.nota)
  campo('Concluiu', d.concluidoEm)
  y -= 8
  if (d.aviso) texto(d.aviso, { cor: SUAVE, depois: 6 })

  if (d.assinatura.length) {
    texto(`Assinatura${d.nomeAssinante ? ` de ${d.nomeAssinante}` : ''}`, { negrito: true })
    const w = 240, h = 90
    espaco(h + 8)
    const bx = MARGEM, by = y - h
    page.drawRectangle({ x: bx, y: by, width: w, height: h, borderColor: SUAVE, borderWidth: 0.5 })
    for (const traco of d.assinatura) for (let i = 1; i < traco.length; i += 1) {
      const [x0, y0] = traco[i - 1], [x1, y1] = traco[i]
      page.drawLine({ start: { x: bx + x0 * w, y: by + (1 - y0) * h }, end: { x: bx + x1 * w, y: by + (1 - y1) * h }, thickness: 1.2, color: COR })
    }
    y = by - 12
  }

  texto(d.versao === 'lida' ? 'Conteúdo lido' : 'Conteúdo atual', { size: 12, negrito: true, depois: 4 })
  if (d.descricao) texto(d.descricao, { cor: SUAVE, depois: 4 })
  for (const bloco of blocosDoConteudo(d.conteudo)) {
    if (bloco.tipo === 'h') texto(bloco.texto, { negrito: true, size: 11, depois: 2 })
    else if (bloco.tipo === 'ul') bloco.itens.forEach((item) => texto(`• ${item.replace(/\*\*/g, '')}`))
    else texto(bloco.texto.replace(/\*\*/g, ''), { depois: 4 })
  }
  if (d.videoUrl) campo('Vídeo', d.videoUrl)
  if (d.anexos.length) campo('Anexos', d.anexos.join(', '))
  if (d.hash) { y -= 6; texto(`SHA-256 do conteúdo lido: ${d.hash}`, { size: 8, cor: SUAVE }) }
  return pdf.save()
}
```

- [ ] **Passo 4: botão no painel.** No detalhe (`selected`), quando `isConcluida(selected)`:

```tsx
  const baixarComprovante = async (p: Participacao) => {
    setGerando(true)
    try {
      const [{ dadosComprovante }, { gerarComprovantePdf }] = await Promise.all([import('../domain/comprovante'), import('../data/comprovantePdf')])
      const dados = dadosComprovante(item, p, nome(p))
      const url = URL.createObjectURL(new Blob([await gerarComprovantePdf(dados)], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = url
      link.download = dados.arquivo
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      toast({ tone: 'danger', message: erroTexto(error, 'Não foi possível gerar o comprovante.') })
    } finally {
      setGerando(false)
    }
  }
```

  `<Button variant="secondary" icon={<FileDown size={16} />} loading={gerando} onClick={() => void baixarComprovante(selected)}>Baixar comprovante</Button>`. O `import()` dinâmico mantém o pdf-lib fora do bundle inicial. `useToast` do `@betinhos/ui`, e `const [gerando, setGerando] = useState(false)`.
- [ ] **Passo 5: teste da página:** no mock, abrir "Embarque no GRU". Com Carlos selecionado (concluído), o botão "Baixar comprovante" existe. Com Márcio selecionado (reprovado), não existe. Usar `vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })` e conferir que `createObjectURL` foi chamado depois do clique.
- [ ] **Passo 6:** `vitest run src/pages/treinamentos` → PASSA; `pnpm typecheck`; `pnpm --filter @betinhos/shell build` sem aviso novo de chunk. Commit `feat(treinamentos): comprovante individual em PDF da versão lida`.

### Tarefa 18: Verificação e PR da Fase 4

- [ ] **Passo 1:** `verificar-treinamentos`: em Cobre, "snapshot e hash na conclusão (App), comprovante PDF (versão lida; aviso para concluídos antes da mudança)". Roteiro: baixar o PDF no mock e abrir; conferir acentos, assinatura desenhada, várias páginas e hash. No DEV: concluir um treinamento de teste no App, editar o texto no shell e baixar o comprovante; o PDF mostra o texto **anterior** à edição.
- [ ] **Passo 2:** `qualidade-antes-do-pr` + `verificacao-manter` + ux-audit Rápido.
- [ ] **Passo 3:** PR `feat(treinamentos): comprovante em PDF`. Depois do merge: `pnpm push`, commit do bump e atualização da memória `treinamentos-motoristas` (estado e versões no DEV; PROD pendente).

---

## Riscos conhecidos

- **Edição do publicado sem guarda no servidor:** a trava de quiz, assinatura e público fica só no shell (como hoje, ao publicar). Um PATCH direto pela API pode mudar o quiz. Se isso virar risco, um plugin de pré-update no padrão `GuardDispatchedHeader` dos comunicados resolve; fica fora desta revisão.
- **Push depende do e-mail Microsoft do funcionário** (`cr40f_emailmicrosoft`). Sem e-mail, o flow grava Falhou; o painel mostra e o RH corrige o cadastro.
- **Snapshot é gravado pelo app** (mesmo nível de confiança de `cr40f_concluidoem`). O hash prova integridade do texto guardado, não autoria.
- **Fase 3 exige ordem de deploy** (schema → App → shell); fora dela, participações ficam Pendente sem envio.

## Achados da Fase 1

_(preenchido na Tarefa 3)_
