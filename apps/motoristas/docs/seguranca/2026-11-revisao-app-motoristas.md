# Revisão de segurança do App Motoristas (novembro/2026)

Data: 01/11/2026. Branch `fix/seguranca-app-motoristas` (base `main` em 2c7c97e). Revisão estática do repositório, leitura do repo irmão Sistema Betinhos (plugin Acesso, scripts de privilégio, plano da foto do passageiro) e consultas somente leitura ao Dataverse DEV (`org23b93544`) pelo MCP. Nada foi publicado, nada foi executado contra PROD, nenhum teste externo.

Fora do escopo por decisão do Renan: bloqueio de print/screenshot e empacotamento nativo.

## Resumo

| # | Severidade | Achado | Estado |
|---|---|---|---|
| S1 | Crítico | Segredos (chaves Anthropic, client secrets Graph/Cielo/RD Station, Jev) guardados em variáveis de ambiente tipo String, legíveis por qualquer motorista | Decisão do Renan |
| S2 | Alto | URLs de gatilho HTTP de Flow (SAS `sig=`) entregues ao app e chamadas sem identidade do usuário; não expiram nem são revogadas no encerramento | Decisão do Renan |
| S3 | Médio | Encerrar acesso não revoga sessões do Entra; dados locais ficam no aparelho | Decisão do Renan |
| S4 | Médio | Doze Custom APIs sem *Execute Privilege*; a autorização depende só do plugin | Decisão do Renan |
| S5 | Médio | Equipe dos motoristas carrega o papel `Basic User` (leitura global de tabelas de sistema e de variáveis de ambiente) | Decisão do Renan |
| S6 | Médio | Agenda com nome e telefone de passageiros persistida em `localStorage` sem prazo; fotos e assinaturas de finalização em IndexedDB por 7 dias | Decisão do Renan |
| S7 | Médio | Dependências de desenvolvimento com 13 vulnerabilidades altas (Vite 5, PostCSS, esbuild, ws); produção sem nenhuma | Justificado abaixo |
| S8 | Baixo | SAS expirados e token do here.now em arquivos versionados; scanner de higiene com falso positivo | **Corrigido neste PR** |
| S9 | Baixo | WebResource sem CSP e com fontes do Google carregadas de terceiro | Decisão do Renan |
| S10 | Baixo | `new_OrganizarObservacao` aceita texto de qualquer usuário autenticado e o envia à API Anthropic | Decisão do Renan |
| S11 | Baixo | Motorista tem `prvWrite` em `new_AppMotoristasLog` sem precisar | Decisão do Renan |

`npm audit --omit=dev`: 0 vulnerabilidades (01/11/2026).

## Achados

### S1. Crítico: segredos em variáveis de ambiente tipo String legíveis pelos motoristas

**Evidência (DEV, 01/11/2026, somente leitura):**
- `teamroles`: a equipe `Team-Betinhos-Canvas-DEV` (grupo do Entra dos motoristas, conforme `docs/acesso-motorista-entra.md` do Sistema Betinhos) tem os papéis `Acesso-Motoristas`, `App Opener` e `Basic User`.
- `roleprivileges`: `Basic User` tem `prvReadEnvironmentVariableDefinition` com profundidade 8 (Global). `environmentvariablevalue` é filha de `environmentvariabledefinition` e herda esse acesso.
- O próprio app confirma a leitura como motorista: `src/lib/dataverse.ts:3629-3657` (`getDataverseEnvironmentVariableValue`) consulta `environmentvariabledefinitions` e `environmentvariablevalues` com a sessão do motorista para obter as URLs de Flow, e o `dist/index.html` publicado tem `__APP_FLOW_ENV` vazio, ou seja, sem essa leitura o app não funcionaria.
- `environmentvariabledefinition`: todas as variáveis abaixo são do tipo `String` (100000000), não `Segredo`. `environmentvariablevalue` tem valor preenchido no DEV para: `new_AnthropicApiKey`, `cr40f_GerarPagantesCieloClientSecret`, `cr40f_GerarPagantesGraphClientSecret`, `new_RDStationClientSecret`, `new_RDStationRefreshToken`, `new_JevApiKey` (valores não foram lidos). Há ainda nove definições `new_AnthropicKey*` sem valor no DEV.
- Plugin `OrganizeObservationPlugin.cs:13-26` lê `new_AnthropicKeyObservacaoMotorista` com serviço de sistema, então o plugin em si não exige leitura pelo motorista; a exposição vem do papel, não do plugin.

**Impacto:** qualquer motorista (ou ex-motorista com token ainda válido, ver S3) lê pelo Web API `GET /api/data/v9.2/environmentvariablevalues?$select=schemaname,value` e obtém chaves da Anthropic (custo e abuso), client secret do Graph (acesso a dados do tenant conforme as permissões do app registration), credenciais Cielo (pagamentos) e RD Station. PROD não foi consultado; se os mesmos valores existirem lá, o impacto é o mesmo.

**Correção proposta (decisão):**
1. Migrar os segredos para variável de ambiente do tipo **Segredo** (Azure Key Vault) ou para a **configuração segura do step** do plugin que os usa, padrão já aplicado em `new_CobrancaQR` (chave Stripe) e no plugin Acesso (clientSecret).
2. Rotacionar todas as chaves listadas depois da migração.
3. Revisar S5 (papel `Basic User`).

### S2. Alto: URLs de Flow com SAS no cliente

**Evidência:**
- `src/lib/dataverse.ts:263-278`: cinco Flows HTTP (`new_FlowURLDespesaAsync`, `new_FlowURLFlowGerarVoucherAppMotoristasv2`, `new_FlowURLFlowSalvarArquivosOnedrive`, `new_FlowURLFlowEnviarReciboCliente`, `new_FlowURLDespesaLeituraRapida`) resolvidos por `resolveFlowUrl` (`:3660`) e chamados por `runHttpFlow` (`:3763`) e `readReceiptQuick` (`:3685`) com `fetch` sem credencial de usuário; a autorização é só o `sig=` da URL.
- `src/lib/dataverse.ts:1870-1882`: o Flow de recibo recebe `emailCliente`, `assuntoEmail`, `corpoEmail`, PDF em base64 e `nomeArquivo`, todos definidos pelo cliente.
- `environmentvariablevalue` no DEV também tem `new_FlowUrlGerarContratoMultas`, `new_FlowUrlNotificarMotoristaMultas`, `new_FlowUrlGerarRecibo`, `new_FlowUrlCriarOP`, `new_FlowUrlManutencao`, `new_FlowUrlClassificarManutencao`, `new_FlowURLEnviarDocumentoLoteFornecedor` (Flows do Sistema Betinhos, não usados pelo App Motoristas, mas igualmente legíveis pelos motoristas por S1).
- `EncerrarAcessoHandler.cs` não regenera essas URLs: quem salvou a URL continua chamando o Flow depois de desligado.

**Impacto:** envio de e-mail em nome da Betinhos para qualquer destinatário com anexo arbitrário (phishing), gravação de arquivos no OneDrive, geração de vouchers, criação de OP e contratos de multa, consumo da leitura por IA, por qualquer pessoa que tenha visto a URL, sem rastro de usuário.

**Correção proposta (decisão):**
- Trocar os gatilhos HTTP para "Qualquer usuário do locatário" ou mover a chamada para uma Custom API/plugin que guarda a URL (ou um segredo de HMAC) na configuração segura do step, como `new_CobrancaQR` já faz. O app passa a chamar só a Custom API com a sessão do motorista, e o plugin valida motorista e serviço antes de acionar o Flow.
- Enquanto isso, regenerar as URLs (novo `sig`) sempre que um motorista for desligado e manter a leitura das variáveis restrita (S5).

### S3. Médio: encerramento de acesso e sessão ativa

**Evidência:**
- `packages/plugins/Cr40f.Acesso.Plugin/EncerrarAcessoHandler.cs:15-58`: remove licença, desativa a conta no Entra, tira do grupo e bloqueia o `systemuser` (`isdisabled`). Não há chamada a `revokeSignInSessions` no `GraphGateway.cs`.
- Mitigação existente: com o `systemuser` bloqueado o Dataverse responde 401/403 na próxima chamada, e `src/lib/fetchWebApi.ts:48-51` dispara `app-motoristas:session-expired`, tratado em `src/App.tsx:1235` (pop-up de sessão expirada). O service worker (`src/pwa/sw.js`) guarda só o HTML do app, nunca dados.
- O que permanece no aparelho: `localStorage['app-motoristas-local-v1']` (agenda e histórico com passageiros e telefones, `src/App.tsx:834`), rascunhos de voucher/observação e IndexedDB `app-motoristas-media-drafts` (fotos e assinatura da finalização, até 7 dias, `src/lib/mediaDraftStore.ts:5`). Esses dados só saem na ação de limpeza (`src/App.tsx:1586-1590`).
- Tokens de acesso já emitidos para o Dataverse valem até expirar (até 1 hora); o refresh token do Entra continua válido até revogação explícita, embora a conta desativada não consiga renovar.

**Correção proposta (decisão):**
- No Sistema Betinhos: acrescentar `POST /users/{id}/revokeSignInSessions` ao `EncerrarAcessoHandler` (a permissão `User.ReadWrite.All` já está concedida).
- No App Motoristas: ao receber 401/403 (`SESSION_EXPIRED_EVENT`), limpar `localStorage` e IndexedDB do app (hoje isso só acontece na limpeza manual). Muda comportamento offline, por isso ficou como decisão.

### S4. Médio: Custom APIs sem *Execute Privilege*

**Evidência (`customapi` no DEV):** `executeprivilegename` nulo em `new_AssinarTermoMulta`, `new_BaixarPdfTermoMulta`, `new_CobrancaQR`, `new_ConsultarAditivoMotorista`, `new_ContestarTermoMulta`, `new_ExpenseUploadTransition`, `new_GerarLinkAcompanhamento`, `new_GerarLinkCadastro`, `new_ObterFotoPassageiro`, `new_OrganizarObservacao`, `new_ResolverVeiculoDoServico`, `new_SincronizarVeiculoAtual`. As demais (comunicados, checklists, trocas de carro) exigem um privilégio de tabela.

Verificado no código que filtram pelo usuário iniciador:
- `new_ObterFotoPassageiro`: `ObterFotoPassageiroHandler.cs:31-42` exige status Programado, motorista do serviço igual ao `systemuser` iniciador e passageiro do serviço; nega com motivo genérico.
- `new_CobrancaQR`: `QrChargePlugin.cs:38,435` resolve o funcionário a partir de `InitiatingUserId`; o app nunca envia `motoristaId` (`src/lib/dataverse.ts:3710`).
- Termos de multa: `TermoMultaCommandPlugin.cs:60,85,355` ("Este termo não é seu.").
- `new_GerarLinkAcompanhamento`: `GenerateTrackingLinkPlugin.cs:39` usa serviço no contexto do chamador, então a leitura do serviço respeita o compartilhamento.

Não verificado (fora deste repo ou sem leitura detalhada): `new_ExpenseUploadTransition`, `new_ResolverVeiculoDoServico`, `new_SincronizarVeiculoAtual`, `new_GerarLinkCadastro`, `new_OrganizarObservacao` (ver S10).

**Correção proposta (decisão):** definir `Execute Privilege` nas doze (por exemplo `prvReadcr40f_Reservadeveculos` para as do serviço e `prvReadnew_TermoMulta` para as do termo) como defesa em profundidade, e revisar as cinco não verificadas.

### S5. Médio: papel `Basic User` na equipe dos motoristas

`Basic User` concede leitura global (profundidade 8, confirmada no DEV) de `team`, `businessunit` e das definições de variáveis de ambiente, além de outras tabelas de sistema do papel padrão. Para o motorista isso significa enumerar equipes e unidades de negócio e ler S1/S2. O papel `App Opener` já cobre a abertura do app model-driven.

**Correção proposta (decisão):** criar um papel mínimo a partir do `Basic User` só com o que o app precisa (`prvReadEnvironmentVariableDefinition` restrito a Basic não funciona porque o dono das variáveis é o administrador; por isso S2 precisa sair das variáveis de ambiente antes), ou ao menos remover `Basic User` da equipe depois de S1 e S2. Testar no DEV com um motorista real antes do PROD.

### S6. Médio: dados do passageiro no armazenamento local

| Onde | O que | Prazo | Fonte |
|---|---|---|---|
| `localStorage['app-motoristas-local-v1']` | agenda e histórico, com nome, telefone e link de WhatsApp dos passageiros (sem fotos nem assinaturas) | sem prazo | `src/App.tsx:834`, `src/app/bootstrap.ts:7,30` |
| `localStorage['app-motoristas-voucher-drafts-v1']` e `…-service-observation-drafts-v1` | rascunhos de voucher e observação | sem prazo | `src/App.tsx:335-337,849` |
| IndexedDB `app-motoristas-media-drafts` | fotos e assinatura da finalização, limite 25 MB | 7 dias | `src/lib/mediaDraftStore.ts:4-5` |
| `localStorage['betinhos-error-log-queue-v1:App Motoristas']` | fila de erros já redigida | até enviar | `src/lib/appErrorLogger.ts:47` |
| Memória | foto do passageiro (blob URL revogado ao sair da tela) | sessão | `src/lib/passengerPhoto.ts:105-134` |
| Service worker | só o HTML do app | até trocar `CACHE` | `src/pwa/sw.js:4,27-35` |

A foto do passageiro segue o plano de 23/10/2026: nunca há URL, só bytes em memória. O telefone é necessário para o trabalho (botões Ligar e WhatsApp), mas não precisa sobreviver sem prazo no aparelho.

**Correção proposta (decisão):** prazo de validade para o store local (por exemplo 48 h) e limpeza ao receber 401/403 (S3). Ambas mudam o comportamento offline.

### S7. Médio: dependências de desenvolvimento

`npm audit` em 01/11/2026: produção 0; total 16 (13 altas, 3 moderadas), todas em `devDependencies`: `vite` ≤6.4.3 (path traversal no dev server; correção exige Vite 8, *major*), `postcss`, `browserslist`, `nanoid`, `source-map-js`, `fast-uri`, `ws`, `zod` e a cadeia do Remotion. Afetam só a máquina de build e o dev server local, nunca o WebResource publicado.

**Justificativa para não corrigir neste PR:** `npm audit fix` sem `--force` mexe na cadeia do Remotion/esbuild e a correção do Vite é um *major* do empacotador; ambos mudam o build e pedem verificação própria (`verificar-ambiente-cloud` cobre `package-lock.json`). Recomendado PR dedicado: `npm audit fix` e, separadamente, Vite 5 → 8 com `npm run build` e prévia comparada.

### S8. Baixo: credenciais expiradas em arquivos versionados (corrigido)

**Evidência:**
- `extracted-msapp/References/Resources.json:25`: SAS de blob do Power Apps (`sig=`) expirado em 03/06/2026.
- `backup/code-references-before.txt:1463,2018`: SAS de blob em `msdyn_refreshhistory` de dataflow, expirado em 16/01/2026.
- `.herenow/state.json`: token de reivindicação do here.now expirado em 26/06/2026.
- `scripts/check-repository-hygiene.ps1:17` já procurava esse padrão, mas acusava também as fixtures curtas dos testes (`?sig=abc`), o que impedia usá-lo como bloqueio.

**Correção aplicada:** valores `sig=` redigidos nos dois arquivos; `.herenow/state.json` retirado do índice e `.herenow/` no `.gitignore`; novo `tests/repositoryHygiene.test.ts` passa a ser a única fonte das regras de higiene (URL com credencial de 20+ caracteres via `git grep -I -P`, inclusive com `&amp;`/`\u0026` e assinatura SAS solta como a do dump de dataflow, e lista de caminhos proibidos: `tmp/`, `.tmp/`, `.dev-backups/`, `bin/`, `obj/`, `.herenow/`, `graphify-out/cache/`, `*.zip`) e falha no `npm test` se algo voltar; `scripts/check-repository-hygiene.ps1` (chamado por `push-dev.ps1`) agora só executa esse teste. Os valores continuam no histórico do git, mas estão expirados, então não há rotação pendente.

### S9. Baixo: CSP e recursos de terceiros

O WebResource é servido pelo Dataverse: não há como definir cabeçalhos HTTP, e o build single-file (`vite.config.ts`, `scripts/build-react-singlefile.cjs:100`) usa script e estilo inline, então uma `<meta http-equiv="Content-Security-Policy">` exigiria hashes gerados no build. `src/styles.css:1` importa Manrope e Montserrat de `fonts.googleapis.com`: o Google recebe o IP de cada motorista a cada abertura e o app depende desse terceiro. Não há `dangerouslySetInnerHTML` no app; o HTML de detalhe passa por `parseSafeDetailHtml` (`src/lib/detailHtml.ts:50`, `src/components/details/DetailsField.tsx:173`).

**Correção proposta (decisão):** embutir as fontes no bundle (o `assetsInlineLimit` já cobre) e, depois, gerar CSP por hash no build. Mudança de build, fora do baixo risco deste PR.

### S10. Baixo: `new_OrganizarObservacao`

Sem *Execute Privilege* (S4); `OrganizeObservationPlugin.cs:24-29` envia o texto recebido à `api.anthropic.com` com a chave lida por serviço de sistema. Qualquer usuário autenticado pode usar a API como proxy pago e o texto do motorista (pode citar passageiro) sai para terceiro. Proposta: limitar por privilégio e tamanho do texto; avaliar se o fornecedor atende ao tratamento de dados pessoais previsto.

### S11. Baixo: privilégio de escrita no log

`Acesso-Motoristas` tem `prvCreate`, `prvRead` e `prvWrite` em `new_AppMotoristasLog` (profundidade Basic). O app só cria registros (`@betinhos-executive-service/ui/error-logger.js`). Remover `prvWrite` é um ajuste de papel sem efeito no app.

## O que está bem

- Foto do passageiro só pela Custom API, com validação por chamada e cache apenas em memória (`src/lib/passengerPhoto.ts`), conforme o plano de 23/10/2026.
- Cobrança por QR: chave do Stripe fora do cliente, identidade pelo iniciador, mock só em `localhost` (`src/lib/dataverse.ts:3711-3752`).
- Logger de erros redige e-mail, telefone, base64, `Bearer`, `token=`, query de URL e hosts sensíveis antes de gravar (`src/lib/appErrorLogger.ts:57-89`, coberto por `tests/appErrorLogger.test.ts`).
- Service worker só em `https` no host do Dataverse, cacheia apenas o HTML e nunca respostas redirecionadas de login (`src/lib/pwa.ts:17-19`, `src/pwa/sw.js:27-31`).
- Sem `dangerouslySetInnerHTML`, `innerHTML` ou `eval`; links externos com `rel="noreferrer"`/`noopener`.
- `escapeODataText` nas consultas com texto (`src/lib/dataverse.ts:465`); ids passam por `cleanGuid`.
- `dist/` publicado sem segredos; `.npmrc` lê `NODE_AUTH_TOKEN` do ambiente.
- Segurança de campo em `cr40f_funcionarios` (CPF, CNH, endereço, filiação, logins) só para o perfil Administrador do Sistema.
- Compartilhamento por plugin com revogação ao trocar motorista (`ServiceDriverSharePlugin.cs:227-277`) e passageiro só com `Read` (`PluginConfig.cs:241-242`).

## Correções aplicadas neste PR

| Correção | Prova |
|---|---|
| `sig=` redigidos em `extracted-msapp/References/Resources.json` e `backup/code-references-before.txt` | `tests/repositoryHygiene.test.ts` passa; `rg -c 'sig=[A-Za-z0-9%_-]{20,}'` devolve 0 nos dois arquivos |
| `.herenow/state.json` fora do índice e `.herenow/` no `.gitignore` | `git ls-files .herenow` vazio |
| `tests/repositoryHygiene.test.ts`: bloqueio automático de URL com credencial e de artefato local em arquivo versionado | `npm test`; prova negativa: arquivo temporário com `sig=` de 36 caracteres adicionado com `git add -N` fez o teste falhar listando o arquivo |
| `scripts/check-repository-hygiene.ps1` delega ao teste (sem falso positivo nas fixtures `?sig=abc`) | revisão do diff; execução exige Windows |

## Decisões pendentes (Renan)

1. **S1** Migrar segredos para variável tipo Segredo ou configuração segura de step; rotacionar chaves Anthropic, Graph, Cielo, RD Station e Jev; conferir PROD.
2. **S2** Tirar as URLs de Flow com SAS do alcance do cliente (Custom API/plugin ou gatilho autenticado) e regenerar `sig` nos desligamentos até lá.
3. **S3** `revokeSignInSessions` no `EncerrarAcessoHandler` (Sistema Betinhos) e limpeza local no app ao receber 401/403.
4. **S4** *Execute Privilege* nas doze Custom APIs e revisão das cinco não verificadas.
5. **S5** Substituir `Basic User` por papel mínimo na equipe dos motoristas (depois de S1/S2).
6. **S6** Prazo para o store local e limpeza em sessão expirada.
7. **S7** PR de dependências: `npm audit fix` e Vite 5 → 8.
8. **S9** Fontes embutidas e CSP por hash no build.
9. **S10/S11** Privilégio e limite em `new_OrganizarObservacao`; remover `prvWrite` do log.

## Não verificado

- Comportamento autenticado como motorista (leitura efetiva de `environmentvariablevalue`, resposta das Custom APIs, 401/403 após encerramento): sem credencial de motorista; a conclusão de S1 vem dos papéis e do código do app.
- PROD: não consultado, por regra desta revisão.
- Flows (o que cada gatilho HTTP faz de fato) e os plugins do Sistema Betinhos além dos citados.
- Execução de `scripts/check-repository-hygiene.ps1` (PowerShell/Windows).
- Quem lê `new_AppMotoristasLog` além do próprio motorista (papéis internos).
