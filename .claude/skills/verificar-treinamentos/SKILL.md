---
name: verificar-treinamentos
description: "Verifica o módulo de Treinamentos do shell (#/treinamentos: lista, editor com quiz e anexos, painel de participação), a pendência TreinamentoPendente do Assistente de Pessoas e os scripts de schema/privilégios no Dataverse DEV. Use após mudar apps/shell/src/pages/treinamentos/**, packages/agentes-ia/src/pessoas.ts, packages/deploy/provision-treinamentos.ps1, packages/deploy/conceder-privilegios-treinamentos.ps1 ou o ramo Pessoas de provision-flow-agentes-executar.ps1."
---
# Verificar Treinamentos

## Cobre
- Código: `apps/shell/src/pages/treinamentos/**` (domínio em `domain/treinamentos.ts` e `domain/lista.ts`; Dataverse e SharePoint em `data/source.ts` via `funcionarios/data/sharepoint.ts`, pasta `Treinamentos/<id>` (DEV: `Treinamentos/DEV/<id>`); mock em `data/mock.ts`), rota `treinamentos` em `app/routes.tsx`, item do menu em `nav/menu.ts` (Cadastros) e ícone `GraduationCap` em `app/AppShell.tsx`.
- Agente Pessoas: `packages/agentes-ia/src/{tipos,pessoas,constantes}.ts` (tipo `TreinamentoPendente`, sempre o último de `TODOS_OS_TIPOS`).
- Schema e privilégios no DEV: `packages/deploy/provision-treinamentos.ps1`, `packages/deploy/conceder-privilegios-treinamentos.ps1`, `provision-agentes-schema.ps1` (opção nova do choice) e `provision-flow-agentes-executar.ps1` (ramo Pessoas lista treinamentos e participações).
- Spec: `docs/superpowers/specs/2026-11-01-treinamentos-design.md`.

## Testes e tipos
1. `cd apps/shell && pnpm exec vitest run src/pages/treinamentos src/nav src/app/AppShell.icons.test.tsx` → todos passam. `domain/domain.test.ts` cobre validação (vídeo sem https, quiz sem correta, nota fora de 0–100, público vazio, anexo > 25 MB), público-alvo (desligado fora), payload/mapeamento, status por participação, vencido e marcação do conteúdo; `TreinamentosPage.test.tsx` cobre painel, vencido/desligado, criação com quiz de 3 perguntas e publicação, público selecionado vazio.
2. `cd packages/agentes-ia && pnpm exec vitest run` → contexto com `treinamentos` (validade vencida ou em até 7 dias) e `pendentes` (contagem pronta de participações abertas de funcionários ativos); `TreinamentoPendente` no índice 21.
3. `pnpm typecheck` na raiz → sem erros.

## Dados do mock (`pnpm dev`; nesta sessão porta 36484)
- "Embarque no GRU: novo procedimento": publicado hoje, todos os motoristas, assinatura + quiz (3 perguntas, mínimo 70%), vídeo, 2 anexos, validade em 15 dias. Carlos concluído (assinatura desenhada, 100%), Márcio reprovado 33%, Rafael só abriu.
- "Direção defensiva: revisão anual": publicado ontem para Carlos, Márcio e Gustavo (desligado), validade vencida há 3 dias → selo "Vencido"; Carlos concluído, Márcio não aberto, Gustavo aberto com selo "Desligado".
- "Atendimento a passageiros com mobilidade reduzida": rascunho, público por função sem função marcada.
- Funcionários: Carlos, Márcio, Rafael (motoristas ativos), Bruna (administrativo), Gustavo (desligado). Anexos enviados no mock só existem em memória.

## Roteiro em mock (navegador, desktop 1366×800 e 375 px)
1. `#/treinamentos` → "Dados de exemplo", tabela com Treinamento, Situação, Público-alvo, Exige, Validade (com "Vencido" na Direção defensiva), Publicado em; visões prontas Rascunhos e Publicados; busca "direcao" acha a Direção defensiva.
2. Novo treinamento → preencher título, texto com `# Regras`, `- item` e `**negrito**` (a prévia à direita mostra título, lista e negrito), vídeo `youtube.com/x` → Publicar mostra "O vídeo precisa de um link https:// válido."; corrigir para `https://…`.
3. Ligar "Exige quiz", adicionar 3 perguntas com 2 alternativas cada; Salvar sem marcar a correta → "Marque a alternativa correta da pergunta 1."; marcar as corretas; nota mínima 120 → "A nota mínima vai de 0 a 100."; voltar a 70.
4. Público "Selecionar" sem ninguém → Publicar mostra "Selecione pelo menos um funcionário." e não abre o diálogo; "Por função" sem função → "Escolha pelo menos uma função."; "Motoristas" → "3 funcionários recebem" (Gustavo desligado e Bruna administrativo fora).
5. Salvar rascunho → toast "Rascunho salvo." e o editor reabre com o id (`?ver=`); "Adicionar foto ou arquivo" habilita; enviar PNG → aparece como "Foto"; arquivo > 25 MB ou .mp4 → toast de recusa; excluir anexo.
6. Publicar → diálogo "Publicar para 3 funcionários?" → "Publicar agora" → toast, painel com 3 "Não aberto", KPIs Participantes 3 / Abriram 0 de 3 / Assinaram 0 de 3 / Concluíram 0 de 3 / Reprovados 0.
7. Abrir "Embarque no GRU" → painel: Carlos "Concluído" com assinatura desenhada, Márcio "Reprovado · 33%", Rafael "Aberto"; filtro Reprovados · 1; clicar em Márcio → linha do tempo com "33% · reprovado · 1 tentativa"; "O que foi publicado" com vídeo, texto formatado e os 2 anexos (abrir baixa o arquivo).
8. Voltar com alteração não salva no editor → "Descartar alterações?" (Continuar editando / Descartar); Esc fora de campo faz o mesmo.
9. 375 px: lista em cards, editor em uma coluna, painel com lista acima do detalhe; sem rolagem horizontal.
10. Console sem `console.error` nem `pageerror`.

## Rodar no Linux/macOS (sem Windows)
Pré-requisitos: `pwsh` 7 (PATH ou `~/.local/powershell/pwsh`) e Node. Login uma vez: `node packages/deploy/dv-token.mjs login` (código de dispositivo; o refresh token fica em `~/.cache/betinhos-dv/refresh.json`, modo 600, e se renova a cada uso; `logout` apaga). Depois: `packages/deploy/rodar-linux.sh provision-treinamentos.ps1 [-Apply]` (idem `conceder-privilegios-treinamentos.ps1`, `provision-agentes-schema.ps1`, `provision-flow-agentes-executar.ps1 [-SomenteValidar]`). O wrapper exporta `DV_ENVIRONMENT_URL` do DEV, `DV_SOLUTION=AppBetinhos`, `DV_BLOCKED_HOSTS` do PROD e os tokens; os scripts continuam recusando PROD.

## Verificação no DEV (só depois do merge, na `main` do checkout principal; nunca em worktree, sessão cloud ou PROD)
1. `powershell.exe -File packages/deploy/provision-treinamentos.ps1` (dry run) → "DRY RUN criaria a tabela cr40f_treinamento" e "… cr40f_treinamentoparticipacao". Depois `-Apply` → `SCHEMA OK`; conferências: `cr40f_validade` DateOnly, relacionamentos (treinamento → participação Cascade, funcionário → participação Restrict), `cr40f_name` 200/ApplicationRequired, tabelas na solução.
2. `powershell.exe -File packages/deploy/conceder-privilegios-treinamentos.ps1` (dry run, depois `-Apply`) → `PRIVILEGIOS OK`; `prvRead*` das duas tabelas Global.
3. `pnpm --filter @betinhos/agentes-ia constantes` e `provision-agentes-schema.ps1` → "cr40f_tipo ganhou 100000021 (TreinamentoPendente)"; `provision-flow-agentes-executar.ps1` → ramo Pessoas com os passos Treinamentos e Participacoes; rodar o agente Pessoas manualmente e conferir uma proposta `TreinamentoPendente` com a contagem correta para um treinamento vencido de teste. Se o flow falhar na consulta de treinamentos, suspeitar do `$filter` com `cr40f_Funcionario/cr40f_status` dentro do `$expand` (não testado fora do DEV): a alternativa é expandir sem esse filtro e aceitar desligados na contagem.
4. `pnpm push` e commit do bump. No DEV autenticado (`…/cr40f_SistemaBetinhos.html#/treinamentos`): criar, anexar (na aba Rede: POST no flow Salvar com `caminhoCompleto: "Treinamentos/DEV/<id>"` e PATCH `cr40f_anexosjson`; nada de base64 no Dataverse), publicar (um POST em `cr40f_treinamentoparticipacaos` por funcionário com `cr40f_Treinamento@odata.bind` e `cr40f_Funcionario@odata.bind`, depois PATCH `cr40f_estado` 100000001 e `cr40f_publicadoem`); repetir a publicação não duplica. Apagar os registros de teste depois (a cascata apaga as participações; os arquivos no SharePoint saem à mão).

## Casos de borda
- Publicado não aceita edição: `salvar` consulta o estado no Dataverse e recusa se já foi publicado (aba desatualizada); só os anexos (`salvarAnexos`) mudam.
- Falha no meio da publicação: as participações já criadas ficam; publicar de novo cria só as que faltam e remove as órfãs (fora do público e sem atividade).
- Excluir no Dataverse um funcionário com participação é recusado (Restrict); o caminho é marcá-lo como Desligado.
- Funcionário desligado depois de publicado: continua no painel com selo "Desligado"; nunca entra em publicação nova.
- Tabela ausente (antes do provision): a página mostra "Tabela cr40f_treinamento não encontrada na metadata." sem cair em mock.

## Limites
- Sem Dataverse na VM/worktree: só mock, typecheck e testes. Leitura, assinatura e quiz pelo motorista dependem do App Motoristas (outra sessão); o campo `cr40f_concluidoem` só será gravado por ele.

## Estado no DEV (02/11/2026)
Schema, privilégios (MDA e DEV - Usuário), opção `TreinamentoPendente` (100000021) e flow `Flow Agentes | Executar` aplicados; `checkFlowErrors` vazio. Teste de dados ponta a ponta (criar, publicar, participação com binds, consulta do agente com `$expand` filtrado por status do funcionário, conclusão tirando da contagem, limpeza em cascata) passou. Falta: execução real do agente Pessoas (chave Anthropic do agente) e o uso pelo App Motoristas.
