# Acesso ao App Motoristas em minutos — cadastro e encerramento pela Tela Funcionários

Data: 22/10/2026 · Aprovado por Renan (brainstorm desta data).

## 1. Objetivo

Colocar um motorista novo (fixo ou terceiro esporádico) para usar o App Motoristas em poucos minutos, sem a operação ter que criar e-mail no Microsoft 365, atribuir licença, entrar no Entra e colocar no grupo à mão. O motorista abre o app pela URL no navegador do celular; não precisa instalar o Power Apps Mobile.

- Botão **Cadastrar acesso** na Tela Funcionários: nome, celular e e-mail pessoal (opcional) → conta Microsoft, licença, grupo, funcionário e credenciais prontas para mandar no WhatsApp.
- Botão **Encerrar acesso** na ficha de qualquer funcionário com conta: remove do grupo, tira a licença, bloqueia o login, inativa o funcionário. Com dupla confirmação.
- Vale para todos os funcionários (colaborador ou terceiro), não só para terceiros.

Fora do escopo: link por serviço sem login (descartado), convidado B2B com e-mail próprio (descartado), envio automático de WhatsApp (hoje só há links `wa.me`), MFA (o tenant não exige), autocadastro pelo próprio motorista, publicação no PROD (segue o congelamento do checklist).

## 2. Estado atual (conferido em 22/10/2026)

- App Motoristas (repo `App Motoristas`, webresource `new_app-motoristas-v2`): identidade = login Microsoft → `systemuser.internalemailaddress` → `cr40f_funcionarios.cr40f_emailmicrosoft` (`src/lib/dataverse.ts` ~l.580-615). O plugin `DriverRecordSharing` compartilha os serviços com o usuário e faz backfill de 45 dias quando `cr40f_emailmicrosoft` é criado ou alterado. Custom APIs (troca de carro, QR Stripe) identificam o motorista pelo chamador. Qualquer outro modelo de identidade teria que refazer essa cadeia.
- No PROD, o acesso dos motoristas vem do grupo de segurança do Entra `Team-Betinhos-Canvas` (equipe tipo "Grupo de Segurança", `azureactivedirectoryobjectid` `ad099f47-77d1-4739-8aff-01b1950e43c0`). Há também `Team-Betinhos-MDA` para o model-driven. Adicionar ao grupo basta: o Dataverse cria o usuário e aplica a função da equipe. No DEV não existem equipes de grupo; o script de provisão cria/aponta uma para o teste (seção 6).
- Licença atual atribuída aos motoristas: Power Apps Developer (decisão do Renan; ressalva registrada: é plano de desenvolvimento, não de uso produtivo). O SKU fica configurável.
- Tela Funcionários: `apps/shell/src/pages/funcionarios/` (`FuncionariosPage.tsx`, `components/Ficha.tsx`, `FieldInput.tsx`, `data/schema.ts` com `FUNCAO` 202410000 = Motorista e `VINCULO` 0 = Colaborador / 1 = Terceiro, `data/mock.ts`, `data/dataverse.ts`). WhatsApp: `whatsappHref` em `pages/operacional/domain/phone`.
- Plugins do repo: `packages/plugins/Cr40f.{Financeiro,Documentos,Frota}.Plugin` (+ `.Tests`), um `IPlugin` por Custom API, registrados por `packages/plugins/scripts/push-<area>-plugin.ps1` (`pnpm push:plugin:<area>:dev`). Nenhum usa configuração segura ainda; o molde com secure config é o `App Motoristas/plugins/DriverRecordSharing` (`GenerateTrackingLinkPlugin`, `HandoverChecklistPlugin`) e a checagem `Get-StepsWithoutSecureConfig` em `App Motoristas/scripts/deploy-prod.ps1`.
- Verificação concluída em 22/10/2026: o app funciona pela URL direta `https://org23b93544.crm2.dynamics.com/WebResources/new_app-motoristas-v2` no Chrome Android com o roteiro completo (receber, foto, assinatura, QR, gasto, voucher, troca, Voltar, rotação, modo avião, atalho na tela inicial). Correções no PR #61 do App Motoristas. Única diferença para o Power Apps Mobile: push. iPhone ainda não testado.

## 3. Decisões

1. Backend em plugin C# (Custom APIs), não em Flow: o segredo do Graph fica na configuração segura do step, legível só por administrador.
2. E-mail Microsoft gerado: `primeiro.ultimo@betinhos.com.br`, minúsculo, sem acentos; se já existir, sufixo numérico (`primeiro.ultimo2`). A tela mostra a prévia antes de confirmar e permite editar o prefixo.
3. Senha temporária gerada pelo plugin (12+ caracteres, letras, números e símbolo), com troca obrigatória no primeiro login. Nunca gravada no Dataverse nem no trace; aparece uma vez na tela.
4. Licença: SKU vem do unsecure config do step (`{"licenseSkuId":"...","groupId":"...","appUrl":"..."}`), para trocar de Developer para outro plano sem recompilar.
5. Idempotência: cada passo consulta antes de agir (usuário existe? licença atribuída? membro do grupo? funcionário com esse e-mail?). Reexecutar completa o que faltou.
6. Vínculo com `cr40f_funcionarios`: se vier `funcionarioId`, o plugin só preenche `cr40f_emailmicrosoft` (e celular se vazio); senão cria o registro com `cr40f_funcao` Motorista, `cr40f_tipodevinculo` informado na tela (padrão Terceiro), `cr40f_status` ativo. O backfill de compartilhamento é do `DriverRecordSharing`, já existente.
7. Encerrar acesso nunca exclui nada: remove do grupo, remove a licença, `accountEnabled=false` no Entra, `cr40f_status` = Desligado (1; o choice é 0 Ativo, 2 Afastado, 1 Desligado) e `cr40f_datadedemissao` = hoje se vazia. O e-mail Microsoft fica no funcionário para histórico.
8. Dupla confirmação no encerramento: (1) diálogo "Encerrar acesso de <nome>?" com o que vai acontecer; (2) campo onde o usuário digita o primeiro nome do funcionário e botão "Encerrar acesso" habilitado só com o nome igual. Durante a chamada o overlay não fecha.
9. Quem pode: função de segurança nova **Acesso - Gestão de Motoristas**, com privilégio nas duas Custom APIs (`cr40f_` privilégio próprio por API) e leitura/escrita em `cr40f_funcionarios`. Administrador do Sistema também pode. A tela não consulta privilégios antes: tenta a chamada e trata 403 (ver 4.3).
10. Entrega no DEV. PROD depois do congelamento do checklist, junto com a AppBetinhos.

## 4. Componentes

### 4.1 Custom APIs (globais, síncronas, `cr40f_` na solução AppBetinhos)

**`cr40f_CadastrarAcessoMotorista`**
- Entrada: `NomeCompleto` (string, obrigatório), `Celular` (string, obrigatório, E.164 ou BR), `EmailPessoal` (string, opcional), `PrefixoEmail` (string, opcional: sobrescreve o gerado), `TipoVinculo` (int, 0/1, padrão 1), `FuncionarioId` (guid, opcional).
- Saída: `EmailMicrosoft`, `SenhaTemporaria`, `FuncionarioId`, `UsuarioEntraId`, `LinkApp`, `Etapas` (JSON: cada etapa com `feita|pulada|erro` e mensagem).
- Erros de domínio (mensagem `CODIGO: texto`): `NOME_INVALIDO`, `CELULAR_INVALIDO`, `EMAIL_EM_USO_POR_OUTRO_FUNCIONARIO`, `SEM_LICENCA_DISPONIVEL`, `GRAPH_INDISPONIVEL`, `CONFIG_AUSENTE`.

**`cr40f_EncerrarAcessoMotorista`**
- Entrada: `FuncionarioId` (guid, obrigatório), `Confirmacao` (string: primeiro nome digitado; o plugin confere de novo).
- Saída: `Etapas` (JSON). Erros: `FUNCIONARIO_SEM_EMAIL`, `CONFIRMACAO_INVALIDA`, `GRAPH_INDISPONIVEL`.

### 4.2 Plugin `packages/plugins/Cr40f.Acesso.Plugin` (+ `.Tests`)

- `CadastrarAcessoMotoristaPlugin` e `EncerrarAcessoMotoristaPlugin`: só orquestram. Construtor `(string unsecureConfig, string secureConfig)`.
- `AcessoConfig`: parse do unsecure (`licenseSkuId`, `groupId`, `appUrl`, `dominio` padrão `betinhos.com.br`) e do secure (`tenantId`, `clientId`, `clientSecret`). Falta → `CONFIG_AUSENTE`.
- `AcessoRules` (puro, sem Dataverse/HTTP): normalização do nome e geração do prefixo de e-mail, sufixo numérico, validação do celular, geração de senha, ordem das etapas e decisão "pular/fazer" por etapa a partir do estado lido. Tudo testado em `AcessoRulesTests`.
- `GraphGateway` (interface `IGraphGateway` + implementação HTTP com `HttpClient`, token client credentials em cache por execução): `UsuarioPorEmail`, `CriarUsuario`, `DefinirAccountEnabled`, `LicencasDoUsuario`, `AtribuirLicenca`, `RemoverLicenca`, `EhMembro`, `AdicionarAoGrupo`, `RemoverDoGrupo`, `SkusDisponiveis`. Testes com gateway fake (`FakeGraphGateway`) cobrindo cada etapa pulada/feita/erro.
- `FuncionarioRepository`: busca por id, por `cr40f_emailmicrosoft`, por celular; cria/atualiza com o serviço do sistema (`CreateOrganizationService(null)`) para não exigir privilégio de escrita direta do chamador em campos sensíveis. O chamador precisa do privilégio da Custom API.
- Trace: nunca registra senha nem segredo; registra e-mail e etapas.
- Permissões do app registration no Entra (criado pelo Renan, passo a passo em `docs/acesso-motorista-entra.md`): `User.ReadWrite.All` (criar, desabilitar e `assignLicense`), `GroupMember.ReadWrite.All` (grupo) e `Organization.Read.All` (SKUs disponíveis), com consentimento de administrador. O secret é digitado no script de provisão (seção 6), nunca versionado.

### 4.3 Tela (shell React, `apps/shell/src/pages/funcionarios/`)

- `components/CadastroAcessoDrawer.tsx`: aberto por "Cadastrar acesso" (cabeçalho da lista: cria funcionário novo) ou pela ficha de um funcionário sem `cr40f_emailmicrosoft` (preenche nome e celular, envia `FuncionarioId`). Campos: nome, celular, e-mail pessoal, vínculo (Colaborador/Terceiro, padrão Terceiro), prévia do e-mail Microsoft editável no prefixo. Estados: preenchendo → criando (overlay não fecha; botão desabilitado) → resultado → erro. Resultado: e-mail, senha com "copiar" e aviso "aparece só agora", botão "Enviar no WhatsApp" (`whatsappHref(celular, mensagem)`), "Abrir ficha". Erro: código traduzido, lista de etapas feitas, "Tentar de novo" (idempotente). Fechar com dado digitado e não enviado → "Descartar alterações?".
- `components/EncerrarAcessoDialog.tsx`: duas etapas (decisão 8). Depois do sucesso, a ficha mostra "Acesso encerrado" (derivado de `cr40f_status` = Desligado + e-mail presente; Afastado conta como ativo).
- Ficha: na aba Dados, bloco "Acesso ao app": e-mail Microsoft, estado (sem acesso / ativo / encerrado) e o botão correspondente. 403 na chamada → toast "Você não tem permissão para gerir acessos" e o botão some na sessão.
- Mensagem do WhatsApp (pt-BR, sem introdução): link do app, e-mail, senha temporária, "troque a senha no primeiro acesso", "abra pelo navegador do celular e, se quiser, adicione à tela inicial".
- `data/acesso.ts`: `cadastrarAcesso(input)` / `encerrarAcesso(input)` chamando `Xrm.WebApi.online.execute`; mock em `data/mock.ts` com um caso feliz, um e-mail em uso e um `GRAPH_INDISPONIVEL` (controlado pelo nome digitado, p.ex. "Erro Graph").
- Design System: `#FCFCFB` nos campos, azul só em foco/ação, sem gradiente; segue `FieldInput`/`Ficha` existentes.

## 5. Fluxo de dados

Cadastrar: tela valida → `cr40f_CadastrarAcessoMotorista` → plugin lê config → gera e-mail (consulta Graph e `cr40f_funcionarios` para sufixo) → cria/obtém usuário Entra (senha nova só quando cria) → atribui licença se faltar → adiciona ao grupo se faltar → cria/atualiza funcionário → devolve credenciais + etapas. Usuário já existente e ativo sem `FuncionarioId` com o mesmo e-mail em outro funcionário → `EMAIL_EM_USO_POR_OUTRO_FUNCIONARIO` (não sobrescreve).

Encerrar: tela confirma duas vezes → `cr40f_EncerrarAcessoMotorista` → plugin confere nome → remove do grupo, remove licença, desabilita conta, inativa funcionário → etapas.

Falha parcial: o plugin não desfaz o que já fez (criar usuário e falhar na licença é recuperável por nova chamada); a saída `Etapas` diz o que ficou.

## 6. Deploy e provisão (DEV)

- `packages/plugins/scripts/push-acesso-plugin.ps1` (`pnpm push:plugin:acesso:dev`): build, testes, registra assembly, Custom APIs, parâmetros e steps, no molde do `push-frota-plugin.ps1`.
- `packages/deploy/provision-acesso.ps1` (idempotente, `-Apply`, PROD bloqueado como `provision-equipamentos.ps1`): pede `clientSecret` via `Read-Host -AsSecureString` e grava a secure config do step; grava o unsecure config (`licenseSkuId`, `groupId`, `appUrl`); cria a função de segurança **Acesso - Gestão de Motoristas** com os privilégios das duas Custom APIs e inclui tudo na solução `DV_SOLUTION`. No DEV, `groupId` aponta para um grupo de teste do Entra criado pelo Renan (não o `Team-Betinhos-Canvas` do PROD).
- Checagem de "step sem secure config" copiada para `packages/deploy` (mesma ideia do `deploy-prod.ps1` do App Motoristas) e chamada pelo `pnpm push`.

## 7. Testes e verificação

- .NET: `AcessoRulesTests` (e-mail, sufixos, celular, senha, etapas), `CadastrarAcessoMotoristaPluginTests` e `EncerrarAcessoMotoristaPluginTests` com `FakeGraphGateway` e serviço fake (caminho feliz, cada etapa já feita, falha em cada etapa, confirmação inválida).
- Vitest: drawer (prévia do e-mail, estados, erro parcial com "Tentar de novo", descarte com confirmação), diálogo de encerramento (botão só habilita com o nome certo), `data/acesso.ts` com mock.
- DEV: cadastrar um terceiro de teste com celular do Renan, abrir o link no navegador do celular com a conta criada, ver um serviço compartilhado, depois encerrar o acesso e confirmar no Entra (conta desabilitada, sem licença, fora do grupo). Evidências na skill `verificar-acesso-motorista` (`.claude/skills/`), criada no mesmo PR.
- `ux-audit` modo Fluxo no drawer e no diálogo antes de dizer pronto.

## 8. Riscos

- Licença Developer em uso produtivo fora dos termos: decisão do Renan; o SKU é configurável para migrar sem código.
- Sincronização Entra → Dataverse pode levar alguns minutos no primeiro login; a mensagem do WhatsApp avisa "se der erro de acesso, tente de novo em 5 minutos".
- Sem licença disponível no SKU: `SEM_LICENCA_DISPONIVEL` com a contagem de `SkusDisponiveis`.
- Segredo do Graph: só na secure config; nunca em Flow, variável de ambiente ou repo.
