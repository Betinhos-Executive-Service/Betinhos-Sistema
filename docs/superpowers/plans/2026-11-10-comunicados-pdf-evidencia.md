# Plano: Comunicados — PDF de evidência (Fase 1)

Spec: `docs/superpowers/specs/2026-11-10-comunicados-pdf-evidencia-design.md`
Escopo: só `apps/shell`. Sem schema, flow ou plugin. PR para a `develop`.

## Tarefa 1: utilitário de PDF compartilhado

- Criar `apps/shell/src/lib/pdf/texto.ts` com `paraWinAnsi`, `quebrar` e `desenharAssinatura(page, strokes, x, y, w, h, cor)`, extraídos de `pages/treinamentos/data/comprovantePdf.ts`.
- `comprovantePdf.ts` (Treinamentos) passa a importar de lá, sem mudar a saída.
- Verificar: `comprovantePdf.test.ts` e `comprovante.test.ts` continuam verdes.

## Tarefa 2: domínio dos comprovantes

Arquivo `pages/comunicados/domain/comprovante.ts`:
- `type Par = { comunicado: Comunicado; destinatario: Destinatario; motorista: string }`.
- `concluido(par)`: Ciência → `cienteEm`; Informativo → `lidoEm`. Usar `isPendente`.
- `paresDoComunicado(item, rows, nome, selecionados: Set<string>)`: só os concluídos; se a seleção estiver vazia, todos os concluídos.
- `paresDoMotorista(motorista, comunicados, rows, selecionados)`: idem, cruzando `destinatario.comunicadoId` com o comunicado, que precisa estar disparado.
- `hashConteudo(titulo, corpo)`: SHA-256 hex via `crypto.subtle`.
- `nomeArquivo(modo, alvo, n)`: segue o spec e usa `fileSlug`.
- Testes em `domain/comprovante.test.ts`: seleção vazia = todos os concluídos, pendente excluído, Informativo pelo `lidoEm`, nomes de arquivo, hash estável e com acento.

## Tarefa 3: gerador do PDF

Arquivo `pages/comunicados/data/comprovantesPdf.ts`:
- `gerarComprovantesPdf({ modo, alvo, pares, geradoPor, geradoEm, versao }) → Uint8Array`.
- Capa e depois cada par em página nova, com o conteúdo do spec (itens 1 a 8). Rodapé em todas as páginas: "Gerado por … em … · Sistema Betinhos v…" e "Página i/n".
- Informativo: sem o bloco de assinatura e com o título "Comprovante de leitura".
- Assinatura vazia ou inválida na Ciência: o texto "Assinatura não disponível no registro". Nunca falha.
- Testes em `data/comprovantesPdf.test.ts`: número de páginas = 1 + pares, acentos preservados (WinAnsi), Informativo sem assinatura (lido de volta com `PDFDocument.load`).

## Tarefa 4: Source

Em `pages/comunicados/data/source.ts` e `mock.ts`:
- `destinatariosDoMotorista(motoristaId)`: `DESTINATARIO_SELECT` + `$filter=_new_motorista_value eq <id>&$orderby=new_enviadoem desc`.
- `quemSou()`: `WhoAmI` → `usuario(<UserId>)?$select=fullname`, com cache e com nova tentativa depois de erro. No mock, "Usuário de teste".
- O mock ganha um motorista com 2 comunicados concluídos (1 Ciência com traços e 1 Informativo) e 1 pendente.
- Testes no padrão de `treinamentos/data/source.test.ts`, se existir para comunicados; senão, testes do mock.

## Tarefa 5: helper de download

`baixarPdf(bytes, arquivo)`: Blob → `createObjectURL` → `<a download>` → `revokeObjectURL`, no padrão de `TreinamentoPainel.baixarComprovante`. Fica em `lib/pdf/baixar.ts`. Antes de criar, procurar um helper que já exista.

## Tarefa 6: relatório do comunicado

`components/ComunicadoRelatorio.tsx`:
- Caixa (`Checkbox` do `@betinhos/ui`, se existir; senão o `input` nativo estilizado) só nos destinatários concluídos, fora do botão da linha, com um `aria-label` "Selecionar <nome>".
- "Selecionar todos os concluídos" no topo da lista.
- Botão "Gerar PDF (n)" ao lado de "Exportar CSV": `n` = selecionados, ou o total de concluídos sem seleção. Fica desabilitado sem nenhum concluído. Mostra `loading` durante a geração e um toast de erro em caso de falha.
- O CSV e os lembretes continuam como estão.

## Tarefa 7: diálogo "PDF por motorista" na lista

`components/PdfMotoristaDialog.tsx` + botão "Gerar PDF por motorista" no topo de `ComunicadosLista`:
- Passo 1: `SearchBox` + lista de motoristas (`source.motoristas()`, já carregado pela página).
- Passo 2: comunicados concluídos do motorista (`destinatariosDoMotorista` + comunicados da página), todos marcados, e "Gerar PDF (n)".
- Estado vazio: "Este motorista ainda não concluiu nenhum comunicado".
- Clique fora, X e Esc fecham; durante a geração não fecha. Não há alteração não salva, então não pede "Descartar".

## Tarefa 8: aba "Comunicados" na ficha

- `FuncionariosPage` cria a `Source` de comunicados a partir do `host` (já disponível) e passa para a `Ficha` como uma prop opcional `comunicados`.
- `TABS` em `Ficha.tsx` ganha `{ key: 'comunicados', label: 'Comunicados' }`, depois de Anotações.
- `components/ComunicadosTab.tsx` (em `funcionarios`) reaproveita `useLoad`: lista com título, tipo, status (`statusLabel`/`statusTone`) e datas, com caixas nos concluídos e "Gerar PDF (n)". O gerador e o domínio são importados de `pages/comunicados`.
- Sem a prop `comunicados`, a aba não aparece.

## Tarefa 9: qualidade e verificação

- `pnpm typecheck` e `pnpm test` em `apps/shell`.
- `qualidade-antes-do-pr`: `/simplify` + `karpathy-coder` + `/code-review high --fix`.
- `verificacao-manter`: criar `verificar-comunicados` (não existe) cobrindo relatório, diálogo, aba e o PDF gerado.
- Prints no chat (relatório com seleção, diálogo, aba da ficha e a página do PDF renderizada) e `ux-audit` Rápido no mock (porta 36472).
- Abrir o PR para a `develop`. "Não verificado no Dataverse" até o Deploy do DEV: conferir no DEV o filtro por motorista e o `fullname`.

## Riscos

- Comunicado com muitos destinatários (centenas): o PDF é gerado no navegador. Hoje são dezenas, então é aceitável; se passar de ~300 páginas, mostrar o aviso antes.
- Emoji ou caractere fora do WinAnsi no corpo some do PDF. É o mesmo comportamento de Treinamentos; vai documentado no rodapé técnico.
- O `WhoAmI` do shell pode não trazer o nome: o fallback é o e-mail do usuário e, por último, "usuário não identificado". Nunca bloqueia a geração.
