---
name: verificar-avaliacao
description: "Verifica o lado Dataverse da avaliação do link de acompanhamento: tabela cr40f_avaliacaoservico (provision-avaliacao-schema.ps1) e flow HTTP 'Link | Registrar avaliação' com a variável new_URLFlowRegistrarAvaliacao (provision-flow-avaliacao.ps1). Use após mudar esses scripts ou o contrato do Worker com o flow."
---
# Verificar avaliação do serviço (Dataverse)

## Cobre
- `packages/deploy/provision-avaliacao-schema.ps1`: tabela `cr40f_avaliacaoservico` (set `cr40f_avaliacaoservicos`), colunas `cr40f_name` (200, obrigatório), `cr40f_nota` (1–5, obrigatório), `cr40f_comentario`, `cr40f_classificacao` (100000000 Elogio, 100000001 Sugestão, 100000002 Reclamação, 100000003 Sem comentário), `cr40f_linkid`, `cr40f_avaliadoem`, lookups `cr40f_reserva`, `cr40f_motorista`, `cr40f_veiculo`, `cr40f_boaideia`, `cr40f_errooperacional` (todos RemoveLink) e chave alternativa `cr40f_linkidunico`.
- `packages/deploy/provision-flow-avaliacao.ps1`: flow `Link | Registrar avaliação`, gatilho `{ linkId, titulo, nota, comentario, classificacao, avaliadoEm }`.
  O flow acha a reserva por `new_linkacompanhamento` terminando em `/<linkId>` e pega dela `cr40f_id`, `_cr40f_motorista_value` e o veículo (`new_veiculoreal`, senão `cr40f_veiculo`).
- `packages/deploy/solucoes/regras.json`: regra `"14"` (chave alternativa) → BetinhosCore.

## Sem gravar (vale em worktree)
```
powershell -File packages/deploy/provision-avaliacao-schema.ps1 -SomenteValidar
powershell -File packages/deploy/provision-flow-avaliacao.ps1 -SomenteValidar
```
O esperado é que os dois terminem com `VALIDAR OK: nada gravado no DEV`. Cada script confere a própria sintaxe (`Parser::ParseFile`) e o BOM. O do flow também confere metadata (entity sets, choices de Boas ideias e Erro operacional, colunas obrigatórias do Erro operacional, navegações dos lookups), connection references e a definição carregando como JSON. Depois que o flow existe, ele também roda `checkFlowErrors` (espera `[]`).
- Antes da tabela existir, o do flow avisa que valida com os nomes previstos. Isso é normal.
- Em `cd packages/deploy && node --test solucoes/classificar.test.mjs`, a regra 14 tem que passar na cobertura de `porTipo`.

## Publicar no DEV (só da main, no checkout principal, depois do merge)
1. `powershell -File packages/deploy/provision-avaliacao-schema.ps1`: termina com "criada, publicada e conferida". A conferência espera a chave ficar `Active` (até 5 min).
2. `powershell -File packages/deploy/provision-flow-avaliacao.ps1`: termina com "URL do gatilho criada e gravada em new_URLFlowRegistrarAvaliacao (valor não exibido)". Nunca imprima a URL (`sig=`).
3. `powershell -File packages/deploy/solucoes/distribuir-solucoes.ps1 -Aplicar` (ou o próximo `pnpm push`), seguido da skill `verificar-solucoes`: a tabela vai para BetinhosCore, o flow para BetinhosAutomacao e a variável para BetinhosCore.

## Prova no DEV (4 casos + duplicado)
Leia a URL da variável sem mostrá-la: guarde em `$u` a partir de `environmentvariablevalues` e nunca escreva o valor no log. Use uma reserva de teste com link gerado: pegue `cr40f_id` e o último segmento de `new_linkacompanhamento` (`$L`). Não use reserva de cliente real em andamento. Para os casos sem reserva, use um linkId inventado com 12 caracteres.
POST `application/json` em `$u`:
1. Elogio: `{ linkId: $L, titulo: "Embarque OS-xxxx", nota: 5, comentario: "Motorista <b>pontual</b> & \"educado\"", classificacao: "elogio", avaliadoEm: <agora ISO> }`.
   - Espera `200 { ok: true, avaliacaoId }`.
   - A avaliação fica com nome `OS-xxxx · nota 5` e reserva, motorista e veículo (se houver) ligados.
   - Chega e-mail "Elogio de cliente · OS-xxxx" em fulano.real@betinhos.com.br, com o comentário escapado (aparece `<b>` literal, sem negrito).
2. Duplicado: o mesmo POST de novo responde `200 { ok: true, duplicada: true }` e nada novo é criado. Dois POSTs simultâneos (`Start-Job`) do mesmo linkId novo: o resultado é uma avaliação só, e o segundo POST responde duplicada (chave alternativa).
3. Sugestão (outro linkId): `classificacao: "sugestao"`, com comentário.
   - Cria `cr40f_boasideias` "Sugestão de cliente · …" com status 100000000 Nova e `cr40f_detalhes` contendo comentário e nota.
   - A avaliação fica com `_cr40f_boaideia_value` preenchido.
4. Reclamação: `classificacao: "reclamacao"`, nota 2, com comentário.
   - Cria `cr40f_errooperacional` "Reclamação de cliente · …" com categoria 100000004, gravidade 100000001, origem 100000002 (Passageiro/Cliente), status 100000000 e `cr40f_dataocorrencia` = avaliadoEm.
   - O Erro fica com os lookups reserva, motorista e veículo, quando houver.
   - A avaliação fica com `_cr40f_errooperacional_value`.
5. Nota baixa sem comentário: `classificacao: "sem_comentario"`, nota 1, `comentario: ""`.
   - Chega e-mail "Nota baixa sem comentário · …".
   - Nenhum Erro operacional é criado.
6. Sem reserva: com o linkId inventado, a avaliação nasce sem lookups e com o título no nome (`Embarque OS-xxxx · nota N`).
7. Inválido: `nota: 9` ou `classificacao: "xyz"` → 400 `{ ok: false }`.
- Confira cada execução no histórico do flow no Power Automate. Nenhuma pode ter falhado, exceto as forçadas.

## Limpeza (obrigatória)
Apague só o que o teste criou, filtrando pelos linkIds usados:
- as `cr40f_avaliacaoservico` com esses `cr40f_linkid`;
- as `cr40f_boasideias` e os `cr40f_errooperacional` ligados a elas (pegue os ids pelos lookups antes de apagar a avaliação).

Mostre a lista ao Renan antes de excluir. Os e-mails de teste ficam na caixa do junior; avise que foram testes.

## Não verificável aqui
- Comportamento com o Worker real (contrato e reenvio) é do lado do Worker.
- PROD: proibido sem pedido explícito.
