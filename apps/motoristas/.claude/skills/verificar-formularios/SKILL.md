---
name: verificar-formularios
description: "Verifica os formulários avulsos do App Motoristas: Gastos, Solicitar manutenção, Colisões, Recibo personalizado e Boas ideias, incluindo campos de valor, seletores pesquisáveis e acessibilidade (axe). Use após mudar essas telas, src/shared/ui/FormFields.tsx ou SearchableSelect.tsx, ou quando pedirem para testar esses formulários."
---
# Verificar formulários avulsos

## Cobre
- Código: `src/features/despesas/ExpenseScreen.tsx`, `src/features/manutencao/MaintenanceRequestScreen.tsx` e `useMaintenanceRequestFlow.ts` (rascunho, fotos e envio), `src/features/colisao/CollisionScreen.tsx`, `src/features/colisao/CollisionStartScreen.tsx`, `src/features/colisao/useCollisionFlow.ts` (rascunho, fotos por tipo e envio), `src/features/recibo/ReceiptScreen.tsx`, `src/app/ButtonPreviewScreen.tsx`, `src/features/ideias/IdeasScreen.tsx`, `src/shared/ui/FormFields.tsx`, `src/shared/ui/SearchableSelect.tsx`.
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
7. `#boas-ideias?falharAnexo=1` (pule o tour) → lista com "NOVA IDEIA" e estado vazio; "Nova ideia" abre "1. O que você viu?", "2. Como resolveria? (opcional)" e "3. Fotos ou vídeos (opcional, até 5)" com Tirar foto / Gravar vídeo / Da galeria. Anexar 2 imagens (`setInputFiles` no input da galeria) mostra 2 miniaturas com "Remover" e "2/5". "ENVIAR IDEIA" → 1ª "Enviado", 2ª "Falhou", aviso "Ideia enviada, mas 1 arquivo não foi" e botão "TENTAR DE NOVO" (reenvia só a que falhou). Depois a lista mostra "2 fotos" e os links "Foto 1" e "Foto 2". `?falharAnexo=todos` falha todos; voltar com rascunho pergunta "Descartar a ideia?".

## Rolagem ao voltar da câmera
- Gastos, Solicitar manutenção e Colisões usam `useCameraScroll` (`src/app/cameraScroll.ts`) no `.finalize-scroll`, com `data-scroll-anchor` no bloco de fotos (Colisões: um por tipo de foto e `extra` nas complementares). Roteiro e armadilhas do painel em `verificar-servicos` (seção "Rolagem ao voltar da câmera"): `node scripts/qa/verify-camera-scroll.cjs .verificacao/camera-scroll depois`.

## Casos de borda
- Boas ideias: 6º arquivo é recusado (limite 5); vídeo acima de 120 s ou 70 MB é recusado (`validarVideo`); link de anexo que não seja http(s) não vira `href` (`safeAttachmentLink`); arquivo sem `type` (HEIC da galeria) ganha mime pela extensão; reenvio não repete `cr40f_ordem` já usada (`tests/ideas.test.ts`). Anexos ficam em `cr40f_boasideiaanexo` (migration `20261124-1200-boas-ideias-anexos.ps1`); falha ao ler anexos mostra as ideias sem anexos. O Planner (`#/planner`, Ideias) mostra "N fotos · N vídeos" e a seção "Anexos" no drawer.
- Valor com milhar: "1.250" vira "1250"; mais de 2 casas é cortado (`tests/currencyInput.test.ts`).
- KM "58.230 km" é aceito e enviado como 58230.
- Campo de texto padrão (`.finalize-input-block textarea`, Gastos "Observações" e Manutenção "Descrição"): fundo #fcfcfb, borda rgba(0,26,61,.07), raio 12 px, padding 9px 11px, 600 16px/20px Manrope, placeholder rgba(0,14,35,.42); foco atual = anel navy `0 0 0 2px rgba(0,26,61,.12)` (não é o azul #6c91e8 do Design System). `TextAreaControl` só põe a classe `.form-control-textarea` (tipografia); o resto vem do contêiner, então um textarea fora de `.finalize-input-block` precisa de estilo próprio (ex.: `.checklist-oknok-note`, ver `verificar-checklists-app`). Medir com `getComputedStyle` depois de focar por clique real (`find` + ref).

## Evidência obrigatória
- axe sem Critical/Serious em `#gastos`, `#recibo-personalizado`, `#manutencao`, `#registro-colisao` (o `.build-stamp` é excluído: baixo contraste proposital e `aria-hidden`).
- Prints `formularios-gravidade.png` e `formularios-colisoes.png`; console sem erros.

## Limites
- Envio real de gasto, manutenção, colisão e ideia só em DEV autenticado; nunca em PROD.
- Ligação para 192/190 não é exercitada.
