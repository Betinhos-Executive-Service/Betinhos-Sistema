---
name: verificar-comunicados
description: "Verifica o PDF de evidência de ciência dos Comunicados (#/comunicados: seleção no relatório, diálogo Gerar PDF por motorista, aba Comunicados da ficha do funcionário e o gerador de PDF). Use após mudar apps/shell/src/pages/comunicados/**, apps/shell/src/pages/funcionarios/components/ComunicadosTab.tsx, apps/shell/src/lib/pdf/** ou o PDF de comprovante de Treinamentos (compartilha lib/pdf/texto)."
---
# Verificar Comunicados (PDF de evidência)

## Cobre
- Domínio: `pages/comunicados/domain/comprovante.ts` (pares comunicado + destinatário concluídos, hash do conteúdo, nome do arquivo). Gerador: `data/comprovantesPdf.ts` (pdf-lib, import dinâmico). Download: `lib/pdf/baixar.ts` e `data/baixarComprovantes.ts`. Texto e assinatura: `lib/pdf/texto.ts` (usado também por `treinamentos/data/comprovantePdf.ts`, cuja saída não pode mudar).
- Telas: relatório do comunicado (caixas, "Selecionar todos os concluídos", "Gerar PDF (n)"), diálogo "Gerar PDF por motorista" na lista, aba Comunicados na ficha (`funcionarios/components/ComunicadosTab.tsx`, só aparece quando a Ficha recebe `comunicados`).
- Evidência do aparelho (Fase 2): `parseEvidencia` e `Destinatario.evidenciaAbertura/evidenciaCiencia` em `domain/comunicados.ts` (colunas `new_evidenciaaberturajson` e `new_evidenciacienciajson`), `linhasEvidencia` em `domain/comprovante.ts` e a seção "Aparelho e local" do PDF. O plugin que grava é `packages/plugins/Betinhos.DriverRecordSharing/ComunicadoCommandPlugin.cs` (`BuildEvidence`, HMAC do IP com `IP_STAMP_SECRET` na configuração segura dos steps Abrir e Registrar ciência).
- Specs e plano: `docs/superpowers/specs/2026-11-10-comunicados-pdf-evidencia-design.md`, `docs/superpowers/specs/2026-11-10-comunicados-evidencia-aparelho-design.md` e `docs/superpowers/plans/2026-11-10-comunicados-pdf-evidencia.md`.

## Testes e tipos
1. `cd apps/shell && pnpm vitest run src/pages/comunicados src/pages/funcionarios/components/Ficha.test.tsx src/pages/treinamentos src/lib/pdf` → todos passam.
2. Plugin (precisa de `mono` fora do Windows; no CI roda como no job `plugins`): `dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests -p:SignAssembly=false --filter ComunicadoCommandPluginTests` → HMAC válido/inválido, carimbo vencido, sem segredo, JSON inválido e grande, compatibilidade sem evidência, Abrir só na primeira vez e Ciência.
3. `pnpm typecheck` → sem erros. `pnpm test` completo: hoje falha só `inicio/domain/domain.test.ts > indicadores > Gestão…` (formato "R$ 1,0 mil" do ICU da máquina, fora deste módulo).

## Roteiro em mock (`cd apps/shell && npx vite --port 36472 --strictPort`; encerrar depois)
Dados: "Novo procedimento de embarque no GRU" (Ciência, todos): Carlos (evidência completa: IP verificado e GPS) e Márcio (GPS negado e IP não verificado) assinaram, Rafael pendente com push falho. "Feriado" (Informativo): Carlos leu (registro antigo, sem evidência). "Uso obrigatório do crachá" (Ciência): Carlos pendente. No mock da ficha, o funcionário `m1` (Carlos Alberto Teste) corresponde ao Carlos Andrade.
1. `#/comunicados` → abrir o primeiro comunicado: pendente sem caixa, concluídos com caixa; botão "Gerar PDF (2)" já com todos os concluídos; marcar só um → "Gerar PDF (1)"; "Selecionar todos os concluídos" marca os dois. CSV e "Lembrar pendentes" continuam funcionando e clicar na linha ainda abre o detalhe.
2. Voltar → "Gerar PDF por motorista" → escolher Carlos Andrade → 2 comunicados marcados, "Gerar PDF (2)", "Trocar motorista" volta à busca; motorista sem concluídos mostra "Este motorista ainda não concluiu nenhum comunicado."; Esc e clique fora fecham (não durante a geração).
3. `#/funcionarios` → Carlos Alberto Teste → aba Comunicados (entre Equipamentos e Anotações): 2 concluídos marcados; "Gerar PDF (n)".
4. Baixar: o arquivo sai como `comprovante-<comunicado>-<motorista>.pdf` (1 par), `comunicados-<motorista>-<n>.pdf` (por motorista) ou `comunicado-<titulo>-<n>-comprovantes.pdf`. Abrir: capa (tipo, alvo, quantidade, período, autor, data), uma página por par (linha do tempo, seção "Aparelho e local" com blocos Abertura e Ciência, ou só Leitura no Informativo; aparelho, versão do App, IP "(verificado)" ou "(não verificado)", coordenadas com ±precisão e link do mapa, ou "não autorizada"/"indisponível"/"tempo esgotado"; sem coluna: "Não registrado (registro anterior à captura do aparelho)."; assinatura 250×100 ou "Assinatura não disponível no registro.", observação, texto integral, IDs, SHA-256, notas) e rodapé "Gerado por … · Sistema Betinhos v… · Página i/n". Acentos corretos; emoji é descartado sem falhar. Dá para renderizar com `pdftoppm -png -r 80 arquivo.pdf pg`.
5. Console sem `console.error` nem `pageerror`.

## Não verificável no mock
- Leitura real dos destinatários (`new_comunicadodestinatario` filtrado por `_new_motorista_value`) e do nome do usuário (`WhoAmI` + `systemuser.fullname`) no Dataverse; sem nome, o rodapé diz "usuário não identificado".
- Evidência real: IP carimbado pelo Worker e conferido pelo plugin (precisa do segredo na configuração segura dos 2 steps), GPS aceito e negado no aparelho, e as 2 colunas no Dataverse (schema do `app-motoristas-v2`).
- Assinaturas reais gravadas pelo App Motoristas (`new_assinaturajson`) e a coerência do hash com o que o motorista viu.
- Volume: PDF com dezenas de pares (tempo e memória) e motoristas homônimos.
