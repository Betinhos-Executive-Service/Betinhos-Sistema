# Treinamentos para motoristas — design (schema + gestão no shell)

Data: 01/11/2026. Escopo desta entrega: tabelas, tela `#/treinamentos` no Sistema Betinhos e pendência no Assistente de Pessoas. O consumo no App Motoristas (leitura, assinatura, quiz, push) é de outra sessão.

## Decisões
- **Modelo igual ao de comunicados**: rascunho editável → publicado imutável (`salvar` recusa; a lista de anexos tem gravação própria, `salvarAnexos`). A publicação cria uma `cr40f_treinamentoparticipacao` por funcionário do público-alvo (pelo shell, idempotente; sem Custom API por enquanto).
- **Público-alvo**: Todos os motoristas (`cr40f_funcao` = 202410000), Por função (valores de `cr40f_funcao`) ou Selecionados (ids). Só funcionários ativos (`cr40f_status` ≠ 1 Desligado); desligado nunca entra e, se saiu depois, aparece no painel com selo "Desligado".
- **Conteúdo**: texto com marcação simples (`# título`, `- item`, `**negrito**`), vídeo por URL https, fotos e arquivos no SharePoint BetinhosGestoInterna (`Documentos Compartilhados › Treinamentos/<id>`, no DEV `Treinamentos/DEV/<id>`) pelos flows Salvar/Consultar/Excluir já usados por Funcionários e Equipamentos. Nunca OneDrive. Até 25 MB por arquivo; PDF, imagem, Word, PowerPoint. A lista `[{nome, caminho, tamanho, mime}]` fica em `cr40f_anexosjson`.
- **Assinatura**: como no termo de multa e nos comunicados (traços 0–1 em `cr40f_assinaturajson` + `cr40f_nomeassinante` + `cr40f_assinadoem` gravados pelo servidor/app), sem ZapSign.
- **Quiz** em `cr40f_quizjson` (`{perguntas: [{id, texto, alternativas: [{id, texto}], corretaId}]}`), nota mínima em percentual; o app grava `cr40f_nota`, `cr40f_aprovado`, `cr40f_tentativas`, `cr40f_respostasjson`.
- **Conclusão**: `cr40f_concluidoem` é gravado pelo app quando tudo que o treinamento exige foi cumprido. O painel e o agente usam só esse campo para "pendente".
- **Validade** (`cr40f_validade`, DateOnly) = prazo para concluir. Publicado com validade passada e alguém pendente = "Vencido" na lista e no painel; o Assistente de Pessoas recebe os treinamentos com validade vencida ou até 7 dias à frente e os pares treinamento/funcionário pendentes, e propõe `TreinamentoPendente` (ação `CriarPendencia`, alvo `cr40f_treinamento`).

## Schema (`packages/deploy/provision-treinamentos.ps1`, DEV, solução do `.env`)
`cr40f_treinamento` (UserOwned; `cr40f_name` = título, 200, obrigatório): `cr40f_descricao` memo 1000, `cr40f_conteudo` memo 100000, `cr40f_videourl` texto 500, `cr40f_anexosjson` memo, `cr40f_publicotipo` choice (100000000 Todos os motoristas, 100000001 Por função, 100000002 Selecionados), `cr40f_publicojson` memo, `cr40f_exigeassinatura` e `cr40f_exigequiz` sim/não, `cr40f_notaminima` inteiro 0–100, `cr40f_quizjson` memo, `cr40f_validade` DateOnly, `cr40f_estado` choice (100000000 Rascunho, 100000001 Publicado), `cr40f_publicadoem` data/hora.

`cr40f_treinamentoparticipacao` (UserOwned; `cr40f_name` = "título · funcionário"): lookups `cr40f_treinamento` → `cr40f_treinamento` e `cr40f_funcionario` → `cr40f_funcionarios` (ambos Cascade na exclusão, obrigatórios), `cr40f_abertoem`, `cr40f_confirmadoem`, `cr40f_assinadoem`, `cr40f_nomeassinante` 200, `cr40f_assinaturajson` memo, `cr40f_nota` 0–100, `cr40f_aprovado`, `cr40f_tentativas`, `cr40f_respostasjson` memo, `cr40f_concluidoem`.

Privilégios: `conceder-privilegios-treinamentos.ps1` copia dos papéis o acesso de `cr40f_funcionarios` (MDA e DEV - Usuário); o papel do App Motoristas entra por `-Roles` quando a sessão do app definir.

Agente: `constantes.json` passa a trazer `tiposOrdem` (ordem do choice, `TODOS_OS_TIPOS`); `provision-agentes-schema.ps1` lê essa ordem e acrescenta `TreinamentoPendente` (100000021) e `provision-flow-agentes-executar.ps1` lista no ramo Pessoas os treinamentos publicados com validade até 7 dias e as participações sem conclusão.

## Tela `#/treinamentos` (grupo Cadastros, ícone GraduationCap)
- Lista com `useListView` (visões Rascunhos/Publicados, filtros, colunas extras), busca em `q`, cards abaixo de 820 px.
- Editor: conteúdo (título, descrição, texto, vídeo, anexos), confirmação (assinatura, quiz com editor de perguntas e nota mínima), público-alvo com contagem de quem recebe, validade, prévia como o motorista lê. Salvar rascunho / Publicar (diálogo com a contagem) / Excluir rascunho; "Descartar alterações?" ao sair com mudança; Esc volta.
- Painel do publicado: KPIs, lista por funcionário com status (Não aberto, Aberto, Confirmado, Assinado, Aprovado/Reprovado · nota, Concluído), filtros Todos/Pendentes/Concluídos/Reprovados, detalhe com linha do tempo, assinatura e o conteúdo publicado.

## Fora desta entrega
App Motoristas (consumo, assinatura, quiz, push), lembrete por push, exportação CSV, publicação no DEV (Renan, pela `main`).
