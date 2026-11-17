# Rotina do SNE: roteiro da skill de multas (versão da fase 1, 17/11/2026)

Este é o texto que o Júnior copia para a skill dele no claude.ai (Claude in Chrome com o conector Dataverse PROD).
Mudou aqui, copie de novo para a skill. Spec: `docs/superpowers/specs/2026-11-17-multas-fase1-design.md`, §8.

---

## Para que serve

Uma ou duas vezes por semana, olhar as multas no portal da Senatran (SNE) e deixar o Sistema Betinhos em dia:
1. cadastrar as multas novas;
2. completar as multas abertas que ganharam penalidade (vencimento, valor com 40% e PDF).

O resto (quem é o responsável, aviso ao motorista, indicação, pagamento e acerto) é feito no passo a passo do Sistema
Betinhos, nunca por esta rotina.

## Regras que não mudam

- Tabela: `cr40f_multas` (no conector, o conjunto se chama `cr40f_multases`).
- **Nunca gravar** estes campos: `cr40f_status`, `cr40f_responsavel`, `cr40f_motivoempresa`, `cr40f_canalindicacao`,
  `cr40f_datadeavisoaocondutor`, `cr40f_datadeindicacao`, `cr40f_aceiteem`, `cr40f_pagaem`, `cr40f_valorpago`,
  `cr40f_competenciadesconto`, `cr40f_acertoem`, `cr40f_encerradaem`, `cr40f_canceladaem`, `cr40f_motivocancelamento`,
  `cr40f_indicado`. Eles são do passo a passo. O servidor registra (e, quando a trava estiver ligada, recusa) a gravação
  feita por fora com a mensagem "Os campos de passo da multa só mudam pelo passo a passo do Sistema Betinhos (...)".
- Toda multa nova começa sozinha na etapa "1. Identificar o responsável" e ganha uma tarefa no Planner para a equipe
  Frota. Não precisa (nem pode) informar a etapa.
- Datas sem hora no formato `AAAA-MM-DD`. Data e hora da infração com o fuso de Brasília (`AAAA-MM-DDTHH:MM:00-03:00`).

## Passo 1: multas novas

Para cada notificação de autuação que aparecer no SNE:

1. **Procure antes de criar.** Consulte `cr40f_multases` com `cr40f_novacoluna eq '<número do auto>'` (sem espaços nas
   pontas). Se voltar alguma linha, a multa já existe: anote "já cadastrada" e passe para a próxima.
2. **Ache a placa.** Consulte `cr40f_veiculoses` com `cr40f_placa eq '<PLACA sem hífen>'`. Sem resultado: anote
   "placa não encontrada" e não crie a multa.
3. **Ache a infração.** Consulte `cr40f_infracaodetransitos` com `cr40f_codigodainfracao eq '<código>'`
   (formato `0000-0`). Sem resultado: crie a multa sem a infração e anote "infração sem cadastro".
4. **Crie a multa** com todos estes campos e mais nenhum:
   - `cr40f_novacoluna`: número do auto;
   - `cr40f_codigodoorgaoautuador`: código do órgão autuador;
   - `cr40f_nomedoorgaoautuador`: nome do órgão autuador;
   - `cr40f_placa`: o veículo do item 2 (lookup para `cr40f_veiculos`);
   - `cr40f_dataehorario`: data e hora da infração;
   - `cr40f_localdainfracao`: local;
   - `cr40f_codigodainfracao`: a infração do item 3 (lookup para `cr40f_infracaodetransito`);
   - `new_valorguia`: valor da multa;
   - `cr40f_dataparaindicar`: data-limite para indicar o condutor (é ela que define o prazo no Sistema Betinhos).
   Faça os lookups do mesmo jeito que a rotina já fazia antes desta versão.
   Se faltar algum destes dados no SNE, não invente: anote o que faltou e não crie a multa.
5. **Anexe o PDF** da notificação de autuação na coluna de arquivo `cr40f_autodainfracao` da multa criada
   (upload de arquivo do conector: iniciar, enviar e confirmar). Multa sem o PDF fica incompleta: se o envio falhar,
   anote o auto para anexar depois.
6. **Se a criação for recusada** com "Já existe multa com o auto ...": a multa já estava lá. Anote "duplicada" e siga
   para a próxima. Se for recusada com "Informe o número do auto de infração.", o auto veio vazio: anote e siga.
   Qualquer outra recusa: anote a mensagem inteira e siga.

## Passo 2: penalidades das multas abertas

1. Consulte `cr40f_multases` com
   `statecode eq 0 and cr40f_vencimento eq null and (cr40f_status eq 202410000 or cr40f_status eq 202410004 or cr40f_status eq 202410001)`
   (etapas 1, 2 e 3), trazendo `cr40f_multasid`, `cr40f_novacoluna` e `_cr40f_placa_value`.
2. Para cada uma, procure no SNE a notificação de penalidade do mesmo auto. Se ainda não saiu, pule.
3. Se saiu, **atualize só estes campos**:
   - `cr40f_vencimento`: vencimento da guia;
   - `cr40f_valorcomdesconto`: valor com os 40% do SNE;
   - e anexe o PDF da penalidade na coluna de arquivo `cr40f_pdfpenalidade`.
   Não mexa em `new_valorguia`, nem na etapa, nem em nenhuma data de passo.

## No fim, responda ao Júnior

Um resumo curto, nesta ordem:
- multas novas cadastradas (auto, placa, data para indicar);
- penalidades gravadas (auto, vencimento, valor com desconto);
- puladas e por quê (já cadastrada, duplicada, placa não encontrada, infração sem cadastro, dado faltando, PDF que não
  subiu, outra recusa com a mensagem).

Lembrete final: "Abra o e-mail Multas de hoje ou a lista Comigo no Sistema Betinhos para dar os próximos passos."
