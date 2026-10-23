# Termo de multa com assinatura eletrônica — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** gestor envia o termo de acordo de uma multa; motorista assina no App Motoristas v2 com selfie, GPS e assinatura; servidor gera PDF com SHA-256, trava o registro, cria parcelas do DP e envia cópia.

**Architecture:** schema e tela do gestor no Sistema Betinhos; Custom APIs, plugin, PDF e tela do motorista no App Motoristas v2 (assembly `Betinhos.DriverRecordSharing`, mesmo padrão de `ComunicadoCommandPlugin`). Flows de cópia e expiração provisionados pelo Sistema Betinhos.

**Tech Stack:** React 19 + Vite + Vitest (dois repos), C# net462 plugin (Microsoft.CrmSdk 9.0.2.59, MSTest/xUnit do projeto `.Tests`), PowerShell 5.1 + Web API para schema e flows.

**Spec:** `docs/superpowers/specs/2026-10-22-termo-multa-assinatura-design.md`

## Global Constraints

- Tudo no DEV. Scripts recusam PROD (`orgf261ae8e.crm2.dynamics.com` + `DV_BLOCKED_HOSTS`), como `provision-equipamentos.ps1`.
- Prefixo `new_`; choices começam em 100000000; rótulos pt-BR com acento (scripts .ps1 salvos com BOM).
- Data/hora de assinatura e envio vêm sempre do servidor (`DateTime.UtcNow` no plugin), nunca do dispositivo.
- Máximo 3 parcelas; nenhuma parcela se contestado ou `new_recursopendente = true`.
- Design System Betinhos (`DESIGN_SYSTEM.md` do diretório pai): sem gradiente, só tema claro, `#FCFCFB` em listas/campos neutros, azul só para foco/seleção/status/ações. Animações seguem `emil-design-eng`/`animate`: entrada ≤ 200 ms ease-out, sem animar layout, respeitar `prefers-reduced-motion`.
- Versão de build visível em todas as telas (já existe nos dois apps; não regredir).
- `pnpm push` / publicação só da `main` no checkout principal; a partir de worktree só PR.
- Antes de cada PR: `qualidade-antes-do-pr` + `verificacao-manter`; mudança de UI: `ux-audit` modo Fluxo.

---

## Parte A — Sistema Betinhos (este repo)

### Task A1: Schema no DEV

**Files:**
- Create: `packages/deploy/provision-termo-multa.ps1` (cópia do esqueleto de `provision-equipamentos.ps1`: .env, bloqueio de PROD, token, DRY RUN sem `-Apply`)
- Modify: `packages/deploy/solucoes/regras.json` (tabelas novas → `BetinhosMotoristas`; colunas novas de multa/funcionário → `BetinhosCore`)

**Produces:** as tabelas e colunas da seção "Modelo de dados" do spec, com os nomes lógicos exatos dali; seed de `new_textotermomulta` versão `v0-placeholder` (Termo) e `v0-placeholder` (Aditivo), `new_vigente = true`.

- [ ] Escrever o script idempotente: `Ensure-Table`, `Ensure-Column` (String, Memo, Money, Integer, Decimal, DateOnly, DateTime UserLocal, Boolean, Picklist local, Image `CanStoreFullImage=true`, File `MaxSizeInKB=10240`), `Ensure-Lookup`, seed por `new_versao`. Habilitar auditoria: `PUT EntityDefinitions(LogicalName='x')` com `IsAuditEnabled.Value=true` nas 3 tabelas + `cr40f_multas`; ler `organizations?$select=isauditenabled` e só avisar se a org estiver desligada (ligar a org é decisão do Renan).
- [ ] Rodar DRY RUN (`powershell.exe -File packages/deploy/provision-termo-multa.ps1`) e conferir a lista "criaria".
- [ ] Rodar com `-Apply` no DEV (checkout principal tem `.env`; ver memória "Publicar a partir de worktree"). Conferir via `EntityDefinitions(LogicalName='new_termomulta')/Attributes?$select=LogicalName` que todas as colunas existem e via `RetrieveSolutionComponents` que estão na solução.
- [ ] Commit: `feat(termo-multa): schema do termo, parcelas, textos e colunas novas de multa e funcionário no DEV`

### Task A2: Privilégios e column security

**Files:**
- Create: `packages/deploy/conceder-privilegios-termo-multa.ps1` (mesmo padrão de `conceder-privilegios-equipamentos.ps1`, `AddPrivilegesRole`)

- [ ] Gestão de frota / DEV - Usuário: Read/Create/Write org nas 3 tabelas (a trava real é o plugin); Delete só em `new_textotermomulta`.
- [ ] Motorista (role do App v2): Read em `new_termomulta` e `new_parcelamultafolha` com nível **usuário** + compartilhamento feito pelo plugin ao enviar (mesmo modelo de `DriverRecordSharing`); nada de Write/Create/Delete.
- [ ] Field security profile "Termo de multa - leitura": `IsSecured=true` em `new_selfie`, `new_latitude`, `new_longitude`; membros = equipe de gestão de frota e DP.
- [ ] Verificar com `RetrieveUserPrivileges` de um usuário motorista de teste e um gestor.
- [ ] Commit.

### Task A3: Domínio do acordo (puro, testado)

**Files:**
- Create: `apps/shell/src/pages/frota/domain/termoMulta.ts`, `termoMulta.test.ts`

**Produces:**
```ts
export type FormaPagamento = 'guia' | 'folha'
export type Acordo = { forma: FormaPagamento; parcelas: 1 | 2 | 3; valorTotal: number; primeiraCompetencia: string /* 'YYYY-MM-01' */ }
export type Parcela = { numero: number; competencia: string; valor: number }
export function calcularParcelas(a: Acordo): Parcela[]
export function validarAcordo(a: Acordo, ctx: { temAditivo: boolean; recursoPendente: boolean; temMotorista: boolean; termoPendente: boolean }): string | null
```

- [ ] Testes primeiro: `calcularParcelas({forma:'folha',parcelas:3,valorTotal:195.23,primeiraCompetencia:'2026-11-01'})` → valores `[65.08, 65.08, 65.07]` (centavos que sobram vão nas primeiras; soma exata), competências `2026-11-01, 2026-12-01, 2027-01-01`; forma `guia` → `[]`; validar: sem aditivo → "O motorista ainda não tem o aditivo de assinatura eletrônica registrado."; sem motorista; `folha` com recurso pendente → "Há recurso pendente: o desconto só pode ser acordado depois do resultado."; valor ≤ 0; termo já pendente.
- [ ] `pnpm --filter shell test termoMulta` falha → implementar → passa.
- [ ] Commit.

### Task A4: Tela do gestor — preparar e enviar termo

**Files:**
- Modify: `apps/shell/src/pages/frota/data/schema.ts`, `mappers.ts`, `types.ts` (multa ganha `valorGuia`, `recursoPendente`, `termoVigente`; funcionário ganha `temAditivo`)
- Modify: `apps/shell/src/pages/frota/data/dataverse.ts` (+ `mock.ts`, `source.ts`): `enviarTermoMulta(multaId, acordo)` → `POST new_EnviarTermoMulta`; `cancelarTermoMulta(termoId)`; `listarTermos(multaId)`
- Create: `apps/shell/src/pages/frota/components/TermoMultaPanel.tsx` (+ `.test.tsx`)
- Modify: `apps/shell/src/pages/frota/components/RegistroDrawer.tsx` (seção "Termo de acordo" para multas)

**Interfaces:** Custom API `new_EnviarTermoMulta` (Task B2): entrada `new_MultaId` (Guid), `new_FormaPagamento` (int), `new_Parcelas` (int), `new_ValorTotal` (decimal), `new_PrimeiraCompetencia` (DateTime); saída `new_TermoId` (Guid).

- [ ] Testes (RTL) primeiro: sem aditivo → aviso e botão desabilitado; `folha` mostra prévia de parcelas de `calcularParcelas`; enviar chama `enviarTermoMulta` com o payload; termo Pendente mostra "Aguardando assinatura desde dd/mm" + "Cancelar envio"; Assinado mostra data do servidor, hash (8 primeiros + copiar) e "Baixar PDF"; Contestado mostra o motivo.
- [ ] Implementar com os componentes de `components/Ui.tsx`; seção aparece com transição de altura via `grid-template-rows` 0fr→1fr 180 ms ease-out (sem animar `height`), desligada em `prefers-reduced-motion`.
- [ ] Campo "Valor da guia" no drawer, pré-preenchido com o valor do catálogo quando vazio.
- [ ] Campo "Recurso pendente" (toggle) no drawer; a transição "Entrar com recurso" marca-o como true.
- [ ] `pnpm typecheck && pnpm test`; commit.

### Task A5: Aditivo em Funcionários

**Files:**
- Modify: `apps/shell/src/pages/funcionarios/data/schema.ts` e o formulário/drawer do funcionário (seção "Assinatura eletrônica": data + upload do PDF via a mesma rotina de arquivo já usada em Documentos)
- Test: o teste do formulário de funcionários existente

- [ ] Teste: salvar com data e arquivo grava `new_aditivoassinaturaem` e faz upload em `new_aditivoassinatura`; selo "Aditivo assinado em dd/mm/aaaa" no cabeçalho.
- [ ] Implementar, rodar testes, commit.

### Task A6: Parcelas para o DP

**Files:**
- Create: visão salva "Parcelas de multa previstas" em `provision-visoes.ps1` (filtro status Prevista, ordenada por competência) e item de menu em `apps/shell/src/nav/menu.ts` → `table('new_parcelamultafolha')` (grade genérica com `useListView`; DP marca Descontada pela própria grade)

- [ ] Teste do menu (snapshot do item); rodar provisionamento de visões em DRY RUN e `-Apply` no DEV; commit.

### Task A7: Flows de cópia e expiração

**Files:**
- Create: `packages/deploy/provision-flow-termo-multa.ps1` (padrão de `provision-flow-documentos-resumo.ps1`)

- [ ] Flow "Termo de multa | Cópia ao motorista": gatilho Dataverse quando `new_termomulta` muda `new_status`/`new_pdf`, condição Assinado e `new_copiaenviadaem` vazio → baixa `new_pdf` → Outlook "Enviar e-mail (V2)" para `cr40f_emailmicrosoft` (fallback `cr40f_emailbetinhos`) com anexo `Termo-<placa>-<data>.pdf` e corpo com hash → atualiza `new_copiaenviadaem = utcNow()` e `new_copiacanal = "E-mail"`. Falha de e-mail não muda o termo.
- [ ] Flow "Termo de multa | Expirar pendentes": diário 07:00 America/Sao_Paulo, termos Pendente com `new_enviadoem` < hoje-15 → status Expirado (via Custom API `new_ExpirarTermoMulta` para respeitar a trava).
- [ ] Provisionar no DEV, rodar o de cópia com um termo de teste e conferir o e-mail recebido; commit.

---

## Parte B — App Motoristas v2 (`C:\Users\mendo\Desktop\vscode\App Motoristas`, worktree própria)

### Task B1: MiniPdf + SHA-256 (sem dependências)

**Files:**
- Create: `plugins/DriverRecordSharing/MiniPdf.cs`, `plugins/DriverRecordSharing.Tests/MiniPdfTests.cs`

**Produces:**
```csharp
public sealed class MiniPdf {
  public MiniPdf();                                   // A4, margem 40pt, Helvetica WinAnsi (acentos pt-BR)
  public void Heading(string text);                    // 14pt bold
  public void Paragraph(string text, float size = 10); // quebra de linha e de página automáticas
  public void KeyValue(string key, string value);
  public void Jpeg(byte[] jpeg, float maxWidth, float maxHeight); // DCTDecode, lê largura/altura do SOF
  public void Strokes(IReadOnlyList<IReadOnlyList<double[]>> strokes, float width, float height); // assinatura vetorial, pontos 0..1
  public byte[] ToBytes();
}
public static class Sha256Hex { public static string Of(byte[] data); } // minúsculo, 64 chars
```

- [ ] Testes: PDF começa com `%PDF-1.4` e termina com `%%EOF`; xref com offsets corretos (parse simples no teste); texto "Ação" sai em WinAnsi (`0xE7 0xE3`); JPEG de teste 2×2 embutido com `/Width 2 /Height 2`; 120 parágrafos geram > 1 página; `Sha256Hex.Of("abc")` = `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`; mesmo input → mesmos bytes (sem data no PDF além da passada pelo chamador).
- [ ] `dotnet test plugins/DriverRecordSharing.Tests --filter MiniPdf` falha → implementar → passa. Commit.

### Task B2: TermoMultaCommandPlugin (Custom APIs + trava)

**Files:**
- Create: `plugins/DriverRecordSharing/TermoMultaCommandPlugin.cs`, `TermoMultaDocumento.cs` (monta o PDF), `plugins/DriverRecordSharing.Tests/TermoMultaCommandPluginTests.cs`
- Modify: script de registro dos Custom APIs do repo (o mesmo usado para `new_RegistrarCienciaComunicado`)

**Custom APIs (não-função, POST, bound none):**
- `new_EnviarTermoMulta` (gestor; ver contrato na Task A4) — valida como `validarAcordo` (mesmas mensagens), lê texto vigente e substitui marcadores, congela `new_evidenciasjson` (multa + catálogo + InFleet via `InfleetGateway`: posição/trajeto ±30 min do horário da infração; se o InFleet falhar grava `"infleet": {"erro": "..."}` e segue), cria termo Pendente, `new_enviadoem = UtcNow`, compartilha Read com o usuário do motorista, aponta `cr40f_multas.new_termovigente`, dispara push com o mesmo serviço de push dos comunicados.
- `new_AssinarTermoMulta` (motorista): entrada `new_TermoId`, `new_SelfieBase64` (JPEG ≤ 1,5 MB), `new_AssinaturaJson` (≤ 100.000 chars, ≥ 1 traço com ≥ 2 pontos), `new_Latitude`, `new_Longitude`, `new_PrecisaoGps`, `new_Dispositivo`; saída `new_HashPdf`.
  1. `DriverResolver.ResolveFromUser(InitiatingUserId)` deve ser o `new_motorista` do termo, senão "Este termo não é seu."
  2. Termo precisa estar Pendente; funcionário precisa ter `new_aditivoassinaturaem`.
  3. `agora = DateTime.UtcNow`; grava selfie, assinatura JSON, PNG da assinatura (opcional: pular se não houver encoder no sandbox; o PDF já tem a vetorial), GPS, dispositivo, `new_assinadoem = agora`.
  4. PDF (`TermoMultaDocumento.Build`): título, texto do termo, dados da multa e InFleet, acordo e parcelas, selfie, assinatura, GPS, data/hora em America/Sao_Paulo ("E. South America Standard Time") e UTC, telefone corporativo mascarado (`(11) 9****-1234`), ID do termo e versão do texto.
  5. `hash = Sha256Hex.Of(pdf)`; upload em `new_pdf` (InitializeFileBlocksUpload/UploadBlock/CommitFileBlocksUpload); grava `new_hashpdf`; status Assinado.
  6. Multa → `cr40f_status = 202410001` (Indicada). Se folha e `!new_recursopendente`: cria `new_parcelamultafolha` 1..N (mesma regra de centavos da Task A3).
- `new_ContestarTermoMulta` (motorista): `new_TermoId`, `new_Motivo` (10–2.000 chars) → Contestado, `new_assinadoem = UtcNow` (data da manifestação), multa → Recurso (202410002) + `new_recursopendente = true`, sem parcelas.
- `new_CancelarTermoMulta` (gestor) e `new_ExpirarTermoMulta` (flow): só de Pendente.
- Steps pre-operation Update/Delete em `new_termomulta` e `new_parcelamultafolha`: bloqueia se status ≠ Pendente, exceto quando `context.SharedVariables["termo_server_write"]` (gravações do próprio plugin) ou quando as únicas colunas alteradas são `new_copiaenviadaem`/`new_copiacanal` (termo) ou `new_status` Prevista→Descontada/Cancelada (parcela). Mensagem: "Termo assinado não pode ser alterado nem excluído."

- [ ] Testes com o fake de `IOrganizationService` usado em `ComunicadoCommandPluginTests`: assinar termo de outro motorista → erro; sem aditivo → erro; termo já assinado → erro; assinatura vazia → erro; sucesso grava `new_assinadoem` do relógio injetado (não do payload), hash = SHA do PDF enviado ao upload, multa Indicada, 3 parcelas somando o total; folha com recurso pendente → 0 parcelas; contestar → Contestado + Recurso; Update de termo Assinado por usuário → bloqueado; Update só de `new_copiaenviadaem` → permitido; Delete → bloqueado.
- [ ] Implementar, `dotnet test`, registrar as Custom APIs e steps no DEV pelo script do repo, conferir com `customapis?$filter=startswith(uniquename,'new_') and contains(uniquename,'TermoMulta')`. Commit.

### Task B3: Dados e tela "Multas" no App v2

**Files:**
- Create: `src/lib/termosMulta.ts` (+ `.test.ts`), `src/screens/TermosMultaScreen.tsx`, `src/screens/TermoMultaDetalheScreen.tsx`, `src/components/termos/SelfieCapture.tsx`, `src/termos.css`
- Modify: `src/app/navigation.ts` (rota + badge de pendentes), `src/App.tsx`
- Reuse: `components/comunicados/SignaturePad.tsx` (sem copiar), `lib/cameraConstraints.ts` e `lib/cameraErrors.ts` com `facingMode: "user"`, `executeComunicadoAction`-like helper (extrair para `lib/customApi.ts` se for o mesmo código)

**Produces:** `listarTermosPendentes()`, `obterTermo(id)`, `assinarTermo(id, {selfieJpegBase64, strokes, gps, dispositivo})`, `contestarTermo(id, motivo)`, `baixarPdf(id)` (GET `new_termomultas(id)/new_pdf/$value`), mocks para `localhost`.

Fluxo da tela (uma decisão por passo, botão principal fixo no rodapé):
1. Lista "Multas para assinar" (vazia: "Nenhum termo pendente."). Card: placa, data, infração, valor, "Aguardando sua assinatura".
2. Detalhe: evidências (dados + mapa estático/linha do trajeto InFleet se houver), acordo em destaque ("Desconto em folha em 3x de R$ 65,08 — nov/26, dez/26, jan/27" ou "Você paga a guia"), texto do termo rolável. Botões: **Assinar** (primário) e **Não concordo** (texto).
3. Assinar → passo Selfie (câmera frontal, prévia, "Tirar de novo") → passo Localização (pede GPS; recusado/negado: explica como liberar e não deixa seguir; precisão > 200 m mostra aviso mas segue) → passo Assinatura (SignaturePad) → "Confirmar assinatura". Enviando: botão com spinner, sem duplo envio.
4. Sucesso: "Termo assinado em dd/mm/aaaa HH:mm" (hora vinda do servidor no retorno), "Baixar PDF" e "A cópia também vai para o seu e-mail".
5. Sem aditivo (termo existe mas API recusa): "Para assinar pelo app, procure o escritório e assine o aditivo de assinatura eletrônica."
6. Não concordo → campo de motivo (mín. 10 caracteres) → "Enviar". Sucesso: "Sua contestação foi registrada. O gestor de frota vai entrar em contato."

Motion: troca de passo com slide horizontal 12 px + opacidade 160 ms ease-out; botão com `scale(0.97)` no `:active`; sucesso com check desenhado (stroke-dashoffset 300 ms); tudo desligado em `prefers-reduced-motion`.

- [ ] Testes (Vitest + RTL) primeiro: selfie JPEG gerada do vídeo com `canvas.toBlob('image/jpeg', 0.8)` e reduzida a no máx. 1280 px; GPS negado bloqueia o avanço; assinatura vazia bloqueia; payload de `assinarTermo` tem `new_Latitude` etc. e **não** tem data/hora; erro da API mostra a mensagem do servidor e preserva selfie/assinatura; duplo clique envia uma vez; contestar com 5 caracteres bloqueia.
- [ ] Implementar, `npm test`, `tsc`, `npm run build`; commit.

### Task B4: Push ao motorista

- [ ] O plugin (B2) reusa o envio de push dos comunicados com título "Multa para assinar" e deep link para a rota do termo. Teste no plugin: envio chama o serviço de push com o usuário do motorista. Verificar no DEV num dispositivo real.

---

## Parte C — Verificação ponta a ponta no DEV e entrega

### Task C1: Roteiro E2E (DEV)

- [ ] Funcionário de teste com aditivo registrado; outro sem.
- [ ] Multa de teste com motorista e valor da guia → gestor envia termo folha 3x → push chega → motorista assina no celular (câmera frontal, GPS real) → PDF baixado tem selfie, assinatura, GPS, hora do servidor, telefone mascarado → `Get-FileHash -Algorithm SHA256` do PDF baixado = `new_hashpdf` → e-mail com anexo chegou → 3 parcelas Previstas → multa Indicada.
- [ ] Tentar editar e excluir o termo como administrador pelo model-driven → bloqueado.
- [ ] Contestação → multa Recurso, sem parcelas. Funcionário sem aditivo → gestor bloqueado e app mostra a orientação.
- [ ] Auditoria mostra as mudanças em multa e termo.
- [ ] `ux-audit` modo Fluxo nas duas telas (gestor e motorista, viewport mobile 375 px) com evidências.

### Task C2: PRs e checklist de PROD

- [ ] PR no Sistema Betinhos (A1–A7) e PR no App Motoristas (B1–B4), cada um com `qualidade-antes-do-pr` e `verificacao-manter` (`verificar-` de frota e do app).
- [ ] Checklist de PROD (só após validação do Junior): org com auditoria ligada; schema pela solução (AppBetinhos/BetinhosMotoristas); field security profile e membros; roles; Custom APIs e steps do plugin; flows com conexões do PROD; texto definitivo do termo e do aditivo cadastrados como versão `v1`; aditivos em papel digitalizados e registrados; PROD congelado até o checklist (memória "PROD espera checklist").
