# Padrões na Gestão de Checklists (entrega 3 de 3)

Data: 20/10/2026 · Depende das entregas 1 (itens OK / Não OK com problemas estruturados) e 2 (checklist de troca com "entregue por").

## Objetivo

Mostrar à operação os padrões que aparecem com o tempo, por exemplo: "6 de 8 carros entregues pelo Fulano chegaram sujos por dentro" ou "o ABC1D23 teve pneu com problema em 3 checklists seguidos". Sem IA nesta entrega: são contagens simples, explicáveis e conferíveis.

## Aba "Padrões" (Gestão de Checklists)

Período: últimos 90 dias (seletor 30/90/180). Dados: checklists concluídos (`new_estado` Concluído) com `new_respostasjson`, `new_origem`, `new_entreguepor`, `new_temproblema`.

1. **Por quem entregou** (só checklists de origem Troca): tabela com a pessoa que entregou, o número de trocas, quantas tiveram problema e o % com problema, além dos 2 problemas mais frequentes com a contagem. Só aparece quem tiver **≥ 3 trocas** no período, para não marcar ninguém por um caso isolado. Ordenada pelo % com problema.
2. **Por veículo**: o mesmo item Não OK em **≥ 2 dos últimos 3** checklists do veículo, com o selo "Recorrente". Exemplo: "Pneus — Murcho (3 de 3)".
3. **Problemas mais comuns da frota**: os 10 pares item + problema mais frequentes no período.

Cada linha abre a lista dos checklists que formam o número, para conferir com as fotos.

## Destaques no topo

Até 3 frases geradas por regra, não por IA. Por exemplo: "Fulano: 6 de 8 carros entregues com 'Limpeza interna: Sujo' (90 dias)". A regra é ≥ 3 ocorrências e ≥ 50% das trocas daquela pessoa.

## Cálculo

Feito no navegador, em uma função pura `calcularPadroes(checklists, periodo)` em `src/lib/padroesChecklists.ts` do repositório da Gestão, com testes. O volume esperado é baixo (poucas centenas de checklists em 180 dias). A leitura usa `retrieveMultipleRecords` paginado, com `$select` só das colunas necessárias.

## Futuro (fora do escopo)

Resumo em linguagem natural pelo Claude ("o que mudou este mês"), quando houver volume e as regras simples deixarem de bastar.

## Riscos

- Expor motorista com poucos dados: mitigado pelo mínimo de 3 trocas e pelo % junto do número absoluto.
- O entregador não identificado na entrega 2 entra como "Não identificado", em linha separada, e não é atribuído a ninguém.

## Testes

- Unidade: `calcularPadroes` (mínimo de trocas, recorrência 2 de 3, período, entregador vazio, checklists antigos sem `okNok`).
- Navegador: aba Padrões no Sistema Betinhos (Frota → Checklists de Veículos) com dados de DEV e axe sem falhas graves.
