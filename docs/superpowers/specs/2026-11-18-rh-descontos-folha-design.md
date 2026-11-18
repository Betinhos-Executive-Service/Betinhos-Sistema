# RH · Descontos em folha do mês (bloco 1 do módulo de RH)

Data: 18/11/2026. Dono do processo: Júnior (RH e Frota). Substitui a fase 2 de multas ("Desconto do mês e planilha da contabilidade") da spec `2026-11-17-multas-fase1-design.md`.

## 1. Contexto

Hoje o passo "4. Acertar" grava "lancei na folha" com um único mês (`cr40f_competenciadesconto`) e já encerra a multa. Não existe parcelamento, não existe visão do mês e a contabilidade recebe a lista montada à mão.

A tabela `new_parcelamultafolha` ("Parcela de multa em folha") já existe nos dois ambientes, criada para o termo de multa (fase 3). Ela tem `new_termo`, `new_motorista`, `new_numero`, `new_competencia` (DateOnly), `new_valor` (moeda) e `new_status` (Prevista 100000000, Descontada 100000001, Cancelada 100000002). Ainda não tem nenhum registro em uso.

O módulo de RH foi decidido em 18/11/2026 em três blocos, cada um com spec e PR próprios:
1. **Descontos em folha do mês** (esta spec).
2. Ficha do colaborador 360°: multas, descontos, treinamentos, documentos vencendo, advertências e férias num lugar só.
3. Férias, faltas e advertências (schema novo, com histórico por colaborador).

## 2. Objetivo e escopo

O Júnior abre `#/rh-descontos`, escolhe o mês e vê tudo o que vai ser descontado na folha, agrupado por colaborador e com total. Confere, marca "lançado na folha" (um a um ou em lote) e baixa o Excel para mandar à contabilidade.

**Entra:**
- O "Acertar → folha" passa a pedir o número de parcelas (1 a 12, padrão 1) e a primeira competência, e gera as parcelas em `new_parcelamultafolha`.
- A multa continua aberta ("Descontando x/y") até a última parcela ser lançada; aí encerra sozinha.
- A tela do mês, com lançar, desfazer e exportar Excel.
- Item "Descontos em folha" num grupo novo "RH" no menu.

**Fora:**
- Ficha 360°, férias, faltas e advertências (blocos 2 e 3).
- Envio automático do Excel por e-mail.
- Outras fontes de desconto (despesa devolvida, avaria, adiantamento). O modelo da tela já trata "origem" como campo, para elas entrarem depois sem refazer a tela.
- Remarcar parcela para outro mês e cancelar parcela de colaborador desligado (status Cancelada existe, mas a ação fica para depois).
- Multas já encerradas antes da virada (inclusive o legado "Descontado"): não geram parcela.

## 3. Regras

**Parcelas.**
- Valor base: `cr40f_valorpago` da multa. Sem valor pago, o Acertar → folha recusa com "Registre o pagamento antes de lançar na folha."
- Divisão igual, truncada nos centavos; a diferença vai na última parcela. Ex.: R$ 100,00 em 3 → 33,33 · 33,33 · 33,34. A soma das parcelas é sempre igual ao valor pago.
- Competência da parcela *i* = primeira competência + (*i* − 1) meses, sempre no dia 1.
- Primeira competência: do mês anterior ao atual até 12 meses à frente (fuso de Brasília). Fora disso: "Escolha um mês entre <mês anterior> e <mês + 12>."
- `new_motorista` = `cr40f_motorista` da multa. Sem motorista, recusa com "A multa não tem motorista; defina o responsável antes."
- `new_name` = `Multa <auto> · <x>/<y>`.

**Multa.**
- Acertar → folha grava `cr40f_competenciadesconto` (primeira competência) e `cr40f_acertoem` = hoje, e **não** encerra. O status fica em "4. Acertar" (Pago, 202410006) e a situação mostra "Descontando x/y" sem passo pendente: o e-mail diário e o sininho não cobram nada enquanto houver parcela prevista.
- Quando todas as parcelas da multa estão Descontadas, a multa vai para Encerrada com `cr40f_encerradaem` = dia do último lançamento.
- Acertar → empresa assume: sem mudança (encerra na hora, sem parcela).

**Lançar e desfazer.**
- Lançar: parcela Prevista → Descontada, grava `new_lancadoem` (coluna nova). Pode ser em lote.
- Desfazer: parcela Descontada → Prevista, limpa `new_lancadoem`. Se a multa tinha encerrado por causa dela, reabre em "4. Acertar" e limpa `cr40f_encerradaem`.
- Parcelas de termo (fase 3) aparecem na mesma tela; nesta entrega elas não existem na prática.

## 4. Schema (migration)

`packages/deploy/migrations/20261118-HHMM-rh-descontos-parcelas.ps1`, idempotente, em `new_parcelamultafolha`:

| Coluna | Tipo | Uso |
|---|---|---|
| `new_multa` | lookup → `cr40f_multas` | multa de origem (parcelas do Acertar); termo continua por `new_termo` |
| `new_lancadoem` | data (DateOnly) | dia em que o Júnior marcou "lançado na folha" |

Sem mudança em `cr40f_multas`. A tabela já está na BetinhosCore; conferir com `verificar-solucoes` depois do Deploy.

## 5. Servidor (Cr40f.Frota.Plugin)

**Passo `RegistrarAcerto` (cr40f_PassoMulta).** `DadosPasso` ganha `parcelas` (int, 1 a 12; ausente = 1). Na opção `folha`: valida as regras da seção 3, cria as parcelas e grava a multa como descrito. Tudo na mesma transação do passo.

**Custom API nova `cr40f_LancarDescontoFolha`.**
- Entrada: `ParcelaIdsJson` (lista de GUIDs, até 200) e `Acao` (`lancar` | `desfazer`).
- Saída: `ResultadoJson` com, por parcela, `ok` ou a mensagem de recusa, e a lista de multas encerradas ou reabertas.
- Para cada multa afetada, a mudança de status vai por um `Execute` de `cr40f_PassoMulta` com os passos internos `ConcluirDesconto` e `ReabrirDesconto`. Assim a trava (`MultaTravaPlugin`, que confere o `ParentContext`) continua valendo sem exceção nova.
- `ConcluirDesconto` só é aceito com todas as parcelas da multa Descontadas; `ReabrirDesconto`, só com a multa Encerrada e alguma parcela Prevista. Chamados direto pelo cliente, recusam pelas mesmas regras.
- Privilégio: `prvWritecr40f_multas` (como `new_DossieMulta`).
- Registrada pelo registrador da frota (entra no Deploy como as 3 Custom APIs da fase 1).

## 6. Tela `#/rh-descontos`

- **Menu:** grupo novo "RH" (depois de "Cadastros"), item "Descontos em folha", ícone Lucide `HandCoins` (distinto dos atuais, regra do DS §10.1).
- **Cabeçalho:** seletor de mês (padrão: mês atual), botão "Exportar Excel".
- **Resumo:** total do mês, nº de colaboradores, previstas × lançadas (StatCard do DS).
- **Lista** (lista do DS com visões, agrupada por colaborador com subtotal, seleção em lote como em Pagantes e OPs):
  - colunas: colaborador, origem ("Multa <auto> · <placa>"), infração, parcela x/y, valor, situação (Prevista / Lançada em dd/mm);
  - clique na linha abre a multa em `#/frota-multas?registro=multa:<id>`;
  - ações em lote: "Marcar como lançado" e "Desfazer lançamento"; o resultado por linha aparece na própria linha (recusa do servidor como veio; outro erro, texto genérico).
- **Vazio:** "Nenhum desconto para <mês>."
- **Drawer de multa (Frota):** no Acertar → folha, campos "Parcelas" (1 a 12) e "Primeiro mês", com a prévia dos valores ("3× R$ 33,33 · última R$ 33,34"). Na multa descontando, bloco "Descontos em folha" com as parcelas e o status de cada uma.

## 7. Excel

- Gerado no navegador, no padrão de `pagamento-fornecedores/lib/excel.js` (fflate). Se servir aos dois, extrair o gerador comum para um módulo compartilhado do shell.
- Arquivo: `descontos-folha-AAAA-MM.xlsx`, uma aba.
- Colunas: Colaborador, CPF, Competência (mm/aaaa), Nº do auto, Placa, Data da infração, Infração, Parcela (x/y), Valor, Situação.
- Subtotal por colaborador e total geral. Valores numéricos com formato de moeda (não texto).
- Exporta o mês inteiro (previstas e lançadas). Sem coluna de matrícula: `cr40f_funcionarios` não tem esse campo.

## 8. Permissões

- Leitura de `new_parcelamultafolha` e `cr40f_multas` para o papel de quem usa a tela (conferir no DEV o papel do Júnior).
- Escrita só pela Custom API e pelo passo; nenhum `update` direto da tela.

## 9. Verificação

1. **Testes do plugin:** divisão com centavos (100/3, 0,05/2, valor inteiro), competências em virada de ano, recusas (sem valor pago, sem motorista, mês fora da janela, parcelas fora de 1–12), lançar em lote com uma recusa no meio, encerrar na última, desfazer reabrindo.
2. **Testes do shell:** prévia das parcelas no drawer, agrupamento e subtotal da lista, Excel gerado (colunas, subtotal, total, formato numérico).
3. **Mock:** mês com 3 colaboradores, uma multa à vista e uma em 3 parcelas; print da tela, do drawer e do Excel no chat.
4. **DEV** (`verificar-multas` estendida): multa de teste fictícia → Acertar em 2 parcelas → aparece em dois meses seguidos → lança a 1ª (multa segue aberta) → lança a 2ª (encerra) → desfaz a 2ª (reabre) → apaga a multa e as parcelas.
5. **UX:** `ux-audit` modo Fluxo na tela nova.

## 10. Virada

- DEV: merge na `develop`; o Deploy aplica a migration, publica plugin, registrador e tela. Nada manual previsto.
- PROD: pelo "Publicar soluções", junto ou depois da fase 1 de multas (a fase 1 precisa estar no PROD antes).
- Dados reais nunca no repositório (repo público): mock com nomes e CPFs fictícios.
