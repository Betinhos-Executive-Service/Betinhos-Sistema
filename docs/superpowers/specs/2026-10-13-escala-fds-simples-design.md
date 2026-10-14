# Escala FDS simplificada — design

**Data:** 13/10/2026 · **App:** `apps/escala-fds` (WebResource `cr40f_EscalaFDS.html`) · **Branch:** `feat/escala-fds-simples` (a partir de `feat/escala-fds-semana`, v0.0.18)

## Objetivo

Deixar a escala extremamente simples e rápida de usar: menos toques e menos informação na tela. Escopo aprovado por Renan em 13/10/2026.

**Fica:** situação de sábado e domingo (Plantão e Trabalha) e ausências em qualquer dia, com horário e motivo.
**Sai:** abas, Padrões (padrão fixo por motorista), Folga como situação marcada, lista da Agenda, contadores e selos (Padrão, Exceção, Terceiro).
**Igual:** salvamento automático, aviso "Descartar alterações?" ao fechar o painel (`escala-fds:dirty`), marca de versão, dados de exemplo fora do Dataverse, painel lateral de 520 px aberto pelo botão "Escala FDS".

## Tela (uma só, sem abas)

- **Cabeçalho:** ‹ `Semana dd/mm a dd/mm` › (segunda a domingo; eyebrow "Esta semana" ou "Semana"), estado do salvamento ("Salvando…", "Salvo às HH:mm", "Não salvo · Tentar de novo") e botão Atualizar.
- **Lista de motoristas** ativos, em ordem alfabética pelo apelido. Cada linha:
  - 1ª linha: nome e botão **Ausência**; 2ª linha: `Sáb [Plantão] [Trabalha]` e `Dom [Plantão] [Trabalha]` (os grupos quebram de linha em telas estreitas);
  - um toque marca; tocar no botão ativo desmarca (sem marcação = folga). Ativo em navy; inativo em `#FCFCFB` com borda;
  - abaixo do nome, chips amarelos com as ausências que tocam a semana: "Ter · dia todo · Médico", "Sáb · até 12h · Pessoal", "Ter a Qui · Médico" e, para registro que passa da semana, "Férias · 16/10 a 25/10". Toque no chip mostra Excluir/Cancelar na própria linha; para registro que ultrapassa a semana, o texto avisa que o período inteiro será excluído;
  - linha com ausência de dia todo em sábado ou domingo recebe o fundo de atenção, como hoje.
- **Formulário de ausência** abre logo abaixo da linha (um por vez; o botão Ausência alterna):
  1. chips Seg…Dom da semana, seleção múltipla; hoje já marcado se estiver na semana, senão nenhum;
  2. "Dia todo" marcado por padrão; desmarcar mostra "Indisponível a partir de" e "Até" (horário, aplicado a cada dia escolhido);
  3. motivo em botões (Médico, Pessoal, Férias, Outro), Médico pré-selecionado;
  4. observação opcional;
  5. **Registrar ausência** (desabilitado sem dia ou com horário inválido) e Cancelar.
  - Link "Outro período" troca os chips por datas De/Até (até 62 dias, sempre dia todo), para férias e afastamentos longos.
- Sem motoristas: estado vazio atual ("Nenhum motorista ativo encontrado."). Erro de carga: alerta atual com "Tentar de novo". Carregando: skeleton.
- Layout funciona de 320 px ao painel de 520 px. Alvos de toque de 44 px nos botões de situação e nos chips de dia do formulário.
- Navegação de semana e Atualizar ficam desabilitados enquanto há gravação pendente (o plano de gravação compara com a semana carregada).

## Dados (sem mudança de schema)

Verificado no DEV em 13/10/2026: 25 motoristas ativos, nenhum com padrão preenchido, nenhum registro de escala a partir de 13/10. O app ainda não existe em PROD.

- **Carga por semana:** `cr40f_escalafds` com `cr40f_data` entre sábado e domingo da semana; `cr40f_compromissofds` que cruza segunda 00:00 a domingo 23:59; motoristas ativos (`cr40f_funcao eq 202410000 and cr40f_status eq 0`) sem os campos de padrão.
- **Situação** (`cr40f_escalafds.cr40f_status`): Trabalha = 100000000, Plantão = 100000001. Marcar cria ou atualiza o registro do dia; desmarcar exclui. Registro existente com Folga (100000002) ou Indisponível (100000003) é exibido como desmarcado; marcar o atualiza, desmarcar o exclui.
- **Padrões:** `cr40f_fdspadraosabado` e `cr40f_fdspadraodomingo` deixam de ser lidos e gravados. As colunas permanecem no Dataverse e no script de schema.
- **Ausência** (`cr40f_compromissofds`):
  - dia todo: dias seguidos viram um registro (Seg+Ter+Qua = 1, `inicio` 00:00 do primeiro, `fim` 23:59 do último, `diainteiro = true`); dias separados viram um registro cada;
  - com horário: um registro por dia escolhido;
  - Outro período: um registro de De a Até;
  - excluir o chip remove o registro inteiro.
- **Salvamento automático:** mantém o lote atual (700 ms após a última alteração, uma operação por vez, recarga após gravar, falha deixa pendente). Operações: criar/atualizar/excluir situação, criar/excluir ausência. Sem operação de padrão.

## Código

- `src/App.tsx`: cabeçalho + `EscalaLista`; sem `Tabs`. Janela de dados = semana.
- `src/components/EscalaLista.tsx` (novo): linhas, botões de situação, chips e confirmação de exclusão.
- `src/components/AusenciaForm.tsx` (novo): chips da semana, Dia todo/horário, motivo, observação, Outro período.
- Removidos: `EscalaTab.tsx`, `SemanaTab.tsx`, `AgendaTab.tsx`, `PadroesTab.tsx`, `CompromissoForm.tsx`.
- `src/domain/escala.ts`: `Situacao = 'plantao' | 'trabalha'`; remove `Padrao`, `padroes` de `Pendencias`/`planSave`/`descontarSalvas`; `situacaoDoDia` só olha registros; novas funções puras `semanaDe(date)` (segunda da semana), `diasDaSemana(segunda)` e `ausenciasDosDias(...)`.
- `src/data/source.ts`: `janelaPara` vira a semana; remove seleção e gravação de padrão; mapeia Folga/Indisponível para `null`; dados de exemplo com ausências em dia útil e no fim de semana.
- `src/styles.css`: remove classes sem uso; só tokens `--bt-*`.
- Sem mudança: `cr40f_escalafds_commands.js`, `schema/provision-escala-fds.ps1`, `@betinhos/ui`.

## Testes e publicação

- Vitest: `ausenciasDosDias` (seguidos, separados, com horário), `semanaDe`/`diasDaSemana` (virada de mês), mapeamento de Folga para desmarcado, desmarcar gerando exclusão em `planSave`, `descontarSalvas` sem padrões.
- `tsc --noEmit`.
- Navegador com dados de exemplo em 520 px e 360 px: marcar/desmarcar, ausência de vários dias, horário, Outro período, excluir chip, trocar de semana, salvamento e aviso de descarte.
- Publicação: `pnpm push` no DEV (v0.0.19) somente com OK do Renan; depois atualizar a cópia em `Tela Gestão FDS`.

## Riscos

- Fim de semana passa a começar em branco: quem dependia de padrão precisa marcar. Mitigado: nenhum padrão preenchido no DEV.
- Excluir chip de férias longas apaga o período inteiro: a confirmação deixa isso explícito.
