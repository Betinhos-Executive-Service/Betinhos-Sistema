---
name: verificar-formularios
description: "Verifica os formulários avulsos do App Motoristas: Gastos, Solicitar manutenção, Colisões, Recibo personalizado e Boas ideias, incluindo campos de valor, seletores pesquisáveis e acessibilidade (axe). Use após mudar essas telas, src/components/common/FormFields.tsx ou SearchableSelect.tsx, ou quando pedirem para testar esses formulários."
---
# Verificar formulários avulsos

## Cobre
- Código: `src/screens/ExpenseScreen.tsx`, `MaintenanceRequestScreen.tsx`, `CollisionScreen.tsx`, `CollisionStartScreen.tsx`, `ReceiptScreen.tsx`, `IdeasScreen.tsx`, `ButtonPreviewScreen.tsx`, `src/components/common/FormFields.tsx`, `src/components/common/SearchableSelect.tsx`.
- Rotas: `#gastos`, `#manutencao`, `#colisoes`, `#registro-colisao`, `#recibo-personalizado`, `#boas-ideias`.

## Preparar ambiente
- Igual a `verificar-servicos`: dev server em `http://localhost:31877`, modo mock, `localStorage.clear()` antes, `git checkout -- dist/` ao terminar.
- No mock as listas de veículos e cidades vêm vazias (dependem do Dataverse); Gastos e Boas ideias mostram "Visualização local" e não gravam.

## Roteiro automatizado (preferido)
`node scripts/qa/verify-ux-flows.cjs .verificacao/<data>-<branch> formularios` — todas as linhas `OK`.

## Roteiro manual (viewport 375×812)
1. `#manutencao` → "Selecionar gravidade" lista Baixa/Média/Alta/Urgente, cada uma com critério ("Resolver nesta semana", "O carro não deve rodar"…). Com KM e gravidade preenchidos, "ENVIAR" mostra "Revise 3 campo(s)" (veículo, descrição, fotos).
2. `#colisoes` → bloco "Alguém se feriu?" com botões "SAMU 192" e "Polícia 190" antes das opções. "Bateram em mim" → placa "abc-1d23x" vira "ABC1D23"; voltar e entrar de novo mantém o rascunho.
3. `#gastos` → campo "Valor" ignora letras ("45abc,5" → "45,50" ao sair); "REGISTRAR" vazio lista 5 campos.
4. `#recibo-personalizado` → "Observações" começa vazio (o PDF/prévia mostram "-"); "Total" aceita só número; "Gerar" vazio pede pagante e cliente.
5. Em qualquer campo de texto/valor, `input.labels[0]` é o rótulo visível (ligado por `htmlFor`); o erro fica em `aria-describedby`.
6. Seletor com valor: o "×" de limpar é um botão separado do gatilho (32×32) e "Nenhuma opção encontrada." aparece fora do `listbox`.

## Casos de borda
- Valor com milhar: "1.250" vira "1250"; mais de 2 casas é cortado (`tests/currencyInput.test.ts`).
- KM "58.230 km" é aceito e enviado como 58230.

## Evidência obrigatória
- axe sem Critical/Serious em `#gastos`, `#recibo-personalizado`, `#manutencao`, `#registro-colisao` (o `.build-stamp` é excluído: baixo contraste proposital e `aria-hidden`).
- Prints `formularios-gravidade.png` e `formularios-colisoes.png`; console sem erros.

## Limites
- Envio real de gasto, manutenção, colisão e ideia só em DEV autenticado; nunca em PROD.
- Ligação para 192/190 não é exercitada.
