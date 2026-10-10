# Geral fase 2 — Bloco D (Mostrar como Tabela | Cards) — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development.

**Objetivo:** alternar no desktop entre a tabela e os cards (os do celular, em grade de 2–3 colunas), com a escolha persistida.

**Spec:** `docs/superpowers/specs/2026-10-08-geral-fase2-design.md`, Bloco D. **Base:** HEAD `eecaefc`.

## Restrições globais
As de sempre (tokens `--bt-*`, hover só em ponteiro fino, sem `transition: all`, pt-BR, `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, só `apps/shell/src/pages/geral/**`).

### Tarefa D1: alternador Tabela | Cards
**Arquivos:** `GeralPage.tsx`, `GeralToolbar.tsx`, `components/GeralCards.tsx`, `geral.css`, `domain/viewMode.ts` (+ test), `GeralPage.test.tsx`.
- `domain/viewMode.ts`: `type ViewMode = 'tabela' | 'cards'`; `loadViewMode(kv): ViewMode` (padrão `tabela`, inválido → `tabela`); `saveViewMode(kv, mode)`; chave `betinhos.geral.modo.v1`.
- Toolbar (desktop, não no celular): `SegmentedControl` com "Tabela" e "Cards" (ícones `Table2`/`LayoutGrid`, `aria-label="Mostrar como"`), ao lado do seletor de visão. No celular segue sempre cards.
- `GeralPage`: `mode` state (de `loadViewMode(source.kv)`); desktop + `cards` renderiza `GeralCards` em grade (`.gr-cards--grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--bt-space-3) }`) dentro do contêiner que rola (`.gr-grid`-equivalente com o `LoadMore` e sentinela, `root` = esse contêiner), mantendo seleção por clique no card, Sheet de edição ao tocar "Editar campos", comandos da toolbar como na tabela (não a barra inferior do celular). Colunas/ordenar continuam disponíveis; "Colunas" e redimensionar não se aplicam aos cards (botão Colunas fica, afeta a tabela).
- Testes: `viewMode` (padrão/inválido/persistência); página: alternar para Cards mostra `.gr-card` em desktop e persiste após remontar; voltar para Tabela mostra `[role=grid]`; o alternador não aparece no celular.
- Commit: "Geral: mostrar como Tabela ou Cards no desktop, com escolha lembrada".

### Tarefa D2: verificação
- Navegador 1440×900: alternar, rolar os cards com carga sob demanda, selecionar card, abrir Sheet; recarregar mantém a escolha. Suíte completa verde. Ledger.
