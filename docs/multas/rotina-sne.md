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
  feita por fora dos campos de passo com a mensagem "Os campos de passo da multa só mudam pelo passo a passo do Sistema
  Betinhos (...)". O `cr40f_indicado` não tem essa recusa, mas também não é seu: o sistema calcula esse campo a partir
  das etapas.
- **Duplicata:** enquanto a trava estiver em modo "observar" (o modo de partida), o servidor **não** recusa uma multa
  repetida, só registra. A busca pelo número do auto antes de criar (passo 1, item 1) é a única proteção e é obrigatória.
- Toda multa nova começa sozinha na etapa "1. Identificar o responsável" e ganha uma tarefa no Planner para a equipe
  Frota. Não precisa (nem pode) informar a etapa.
- Datas sem hora no formato `AAAA-MM-DD`. Data e hora da infração com o fuso de Brasília (`AAAA-MM-DDTHH:MM:00-03:00`).

## Passo 1: multas novas

Para cada notificação de autuação que aparecer no SNE:

1. **Procure antes de criar (obrigatório).** Consulte `cr40f_multases` com `cr40f_novacoluna eq '<número do auto>'` (sem espaços nas
   pontas). Se voltar alguma linha, a multa já existe: anote "já cadastrada" e passe para a próxima.
2. **Ache a placa.** Consulte `cr40f_veiculoses` com `cr40f_placa eq '<PLACA sem hífen>'`, trazendo `cr40f_veiculosid`.
   Guarde esse GUID. Sem resultado: anote "placa não encontrada" e não crie a multa (sem veículo a multa não tem dono).
3. **Ache a infração.** Consulte `cr40f_infracaodetransitos` com `cr40f_codigodainfracao eq '<código>'`
   (formato `0000-0`), trazendo `cr40f_infracaodetransitoid`. Guarde esse GUID. Sem resultado: **crie a multa mesmo
   assim, sem o campo da infração**, e anote o auto como "sem infração no cadastro" no resumo final.
4. **Crie a multa** com todos estes campos e mais nenhum:
   - `cr40f_novacoluna`: número do auto;
   - `cr40f_codigodoorgaoautuador`: código do órgão autuador;
   - `cr40f_nomedoorgaoautuador`: nome do órgão autuador;
   - placa: o veículo do item 2, como lookup (veja "Como gravar os lookups" abaixo);
   - `cr40f_dataehorario`: data e hora da infração;
   - `cr40f_localdainfracao`: local;
   - infração: a infração do item 3, como lookup (idem). Se não achou no item 3, deixe de fora;
   - `new_valorguia`: valor da multa;
   - `cr40f_dataparaindicar`: data-limite para indicar o condutor (é ela que define o prazo no Sistema Betinhos).
   Se faltar no próprio SNE algum dado obrigatório desta lista (número do auto, órgão autuador, data e hora, local,
   valor ou data para indicar), não invente: anote o que faltou e não crie a multa. A infração fora do cadastro do
   Sistema Betinhos não entra nessa regra: aquela multa é criada.

   **Como gravar os lookups.** Na criação, mande o nome de navegação com `@odata.bind` apontando para o conjunto e o GUID
   achados nas buscas dos itens 2 e 3 (o nome de navegação distingue maiúsculas e minúsculas):
   - placa: `"cr40f_Placa@odata.bind": "/cr40f_veiculoses(<GUID do veículo>)"`;
   - infração: `"cr40f_Codigodainfracao@odata.bind": "/cr40f_infracaodetransitos(<GUID da infração>)"`.
   Exemplo com GUIDs fictícios:
   `"cr40f_Placa@odata.bind": "/cr40f_veiculoses(00000000-0000-4000-8000-000000000001)"`. Não grave
   `cr40f_placa` nem `cr40f_codigodainfracao` com o GUID direto: o lookup só grava pelo `@odata.bind`.
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
- multas criadas "sem infração no cadastro" (auto e código da infração do SNE);
- puladas e por quê (já cadastrada, duplicada, placa não encontrada, dado obrigatório faltando no SNE, outra recusa com a
  mensagem) e PDFs que não subiram.

Lembrete final: "Abra o e-mail Multas de hoje ou a lista Comigo no Sistema Betinhos para dar os próximos passos."
