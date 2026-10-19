---
name: plantao-erros
description: "Plantão de erros do Sistema Betinhos (episódio 4 da série 10x AI native): lê erros novos do app (tabela cr40f_errodosistema) e falhas de flow do PROD (flowrun), agrupa, decide o risco e dispara a correção com entrega-autonoma — sem tocar no PROD. Use quando a tarefa agendada do plantão rodar ou quando pedirem 'roda o plantão', 'tem erro novo?', 'o que quebrou hoje', 'corrige os erros do sistema'."
---

# Plantão de erros — Sistema Betinhos

Objetivo: erro que aparece em produção vira correção verificada em PR sem o Renan precisar notar o erro. O plantão **não publica** e **não escreve no PROD**: termina em PR (e merge só onde o projeto permitir).

## 0. Regras fixas
- PROD (`Dataverse_PROD`) é somente leitura. Escrita só no DEV (`Dataverse_DEV`) e no repositório.
- PROD está congelado até o checklist (memória `prod-espera-checklist`): correções vão para a `main`/DEV; promoção ao PROD é decisão do Renan.
- No máximo **3 correções por rodada**; o resto entra na fila do relatório.
- Estado entre rodadas: `C:\Users\mendo\.claude\plantao\sistema-betinhos.json` (`{ "ultimaRodada": ISO, "tratados": { "<chave>": { "pr": url, "situacao": "...", "em": ISO } } }`). Crie se não existir. Chave: `app:<assinatura>` ou `flow:<workflowid>:<errorcode>`.

## 1. Coletar (somente leitura)
Janela: desde `ultimaRodada` (primeira vez: últimas 24 h).
- **App, DEV** (`Dataverse_DEV`): `cr40f_errodosistema` com `cr40f_situacao = 100000000` (Novo) → agrupe por `cr40f_assinatura`: contagem, primeira/última ocorrência (`createdon`), rotas, versões, mensagem e um `cr40f_detalhe` de exemplo.
- **App, PROD** (`Dataverse_PROD`): a mesma consulta, se a tabela já existir no PROD (se não existir, registre "tabela ainda não promovida" e siga).
- **Flows, PROD**: `SELECT starttime, errorcode, errormessage, triggertype, workflowid FROM flowrun WHERE status = 'Failed' AND starttime > '<janela>'`. Agrupe por `workflowid` + `errorcode`; nome do flow numa consulta separada em `workflow` (`name`, `workflowid`) — join não traz o nome. `errormessage` é JSON; extraia `code`/`message`.
- Ignore o que já está em `tratados` com PR aberto ou mergeado, salvo se a contagem cresceu depois do merge (regressão → trate de novo).

## 2. Triar cada grupo
Para cada grupo novo, decida em uma linha:
- **Ruído/externo** (indisponibilidade de serviço, credencial expirada de conector, limite de API, dado inválido de um usuário isolado): não abre correção; vai para o relatório com a ação humana sugerida (ex.: "reconectar conector Outlook no PROD").
- **Pequeno e local** (um arquivo/uma ação de flow, causa clara, antes/depois verificável): corrige (passo 3).
- **Grande** (mudança de arquitetura, várias telas, schema, dados financeiros, causa incerta): **não** corrige sozinho; abre issue no GitHub (`gh issue create`) com evidência e diagnóstico e pede revisão do Renan.
Ordene por impacto: frequência × gravidade (tela que não abre > ação que falha > aviso).

## 3. Corrigir (até 3 por rodada)
Cada correção segue a skill `entrega-autonoma`, com o erro real como "antes":
- **Erro do app (só código do shell)**: rode em sessão cloud (`agentes-paralelos`, ambiente "Padrão"), uma sessão por erro. Brief com assinatura, mensagem, pilha, rota, versão e ocorrências. Na VM o app roda em modo mock: se o erro depender de dado real, a reprodução é feita localmente (passo abaixo).
- **Erro que depende de dados do Dataverse ou de flow**: worktree local (precisa do `az login` no DEV). Reproduza no DEV com dados equivalentes; nunca reproduza escrevendo no PROD.
  - Flow: o JSON de cada flow fica em `packages/deploy/flows/` e o provisionamento em `packages/deploy/provision-flow-*.ps1`. Corrija ali, aplique no DEV, rode o flow no DEV e prove o sucesso (run com status Succeeded). Faça backup do JSON atual antes (padrão `flows/backup/`).
- Trava de recurso compartilhado (Dataverse DEV): `~/.claude/locks/dataverse-dev.lock`, como na `agentes-paralelos`.
- PR com: chave do plantão, ocorrências, antes/depois, como foi verificado e "não verificado na nuvem" quando for o caso. Revisão Sonnet + Fable. Merge só com `.claude/entrega-autonoma.json` `{"autoMerge": true}`; sem isso, PR pronto e aguardando o Renan.
- Erros do app no DEV: depois do PR, atualize `cr40f_situacao` do grupo para 100000001 (Em correção) e `cr40f_pr` com o link. No PROD nada é escrito.

## 4. Registrar e relatar
- Atualize o arquivo de estado (`ultimaRodada`, `tratados`).
- Relatório curto (no chat da tarefa e via notificação): grupos novos (quantos e quais), correções abertas (links), issues abertas, ruídos com ação humana, fila restante. Sem nada novo: uma linha "Plantão sem erros novos desde <hora>".
