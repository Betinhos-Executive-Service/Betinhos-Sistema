# Acesso ao App Motoristas — preparação no Entra (feita pelo Renan)

## 1. App registration do Graph (uma vez por tenant)
1. Entra admin center → Aplicativos → Registros de aplicativo → Novo registro: nome `Betinhos - Acesso Motoristas`, conta única (este tenant), sem redirect URI.
2. Permissões de API → Adicionar → Microsoft Graph → Permissões de aplicativo: `User.ReadWrite.All`, `GroupMember.ReadWrite.All`, `Organization.Read.All`. Clique em "Conceder consentimento de administrador".
3. Certificados e segredos → Novo segredo do cliente (validade 12 meses). Copie o **valor** agora; ele só aparece uma vez.
4. Anote `Application (client) ID` e `Directory (tenant) ID`.
5. Para `assignLicense`, o app precisa também estar fora de políticas de acesso condicional que bloqueiem fluxos sem usuário (padrão: não há).

## 2. Grupo de teste no DEV
1. Entra → Grupos → Novo grupo: Segurança, nome `Team-Betinhos-Canvas-DEV`, sem membros.
2. No Power Platform admin center → ambiente DEV → Configurações → Usuários + permissões → Equipes → Nova equipe do tipo "Grupo do Entra" apontando para esse grupo; função de segurança igual à do `Team-Betinhos-Canvas` do PROD (a que os motoristas usam).
3. Anote o Object ID do grupo.

## 3. SKU da licença
`Get-MgSubscribedSku | Select SkuPartNumber, SkuId` (PowerShell com `Microsoft.Graph`) ou Entra → Cobrança → Licenças. Use o `SkuId` do plano escolhido (hoje `POWERAPPS_DEV`, "Power Apps for Developer"). Ressalva registrada no spec: esse plano é de desenvolvimento; trocar o SKU é só editar o `.env` e rodar `pnpm push:plugin:acesso:dev`.

## 3b. Registrar o app como app de gerenciamento do Power Platform (uma vez por tenant)
O plugin cria o `systemuser` pelo `addUser` da API de administração do Power Platform, o mesmo que o "Adicionar usuário" do Power Platform admin center faz. Só essa sincronização oficial deixa o usuário habilitado e licenciado; `Create` de `systemuser` pelo SDK nasce desabilitado e, mesmo habilitado depois, fica `IsLicensed=False`, e o `DriverRecordSharing` do App Motoristas recusa compartilhar com ele (diagnóstico no DEV em 22/10/2026). Para chamar essa API com client credentials, o app registration precisa estar registrado como app de gerenciamento:
```
pac admin application register --application-id <ACESSO_CLIENT_ID>
```
Alternativa: `New-PowerAppManagementApp -ApplicationId <ACESSO_CLIENT_ID>` (módulo `Microsoft.PowerApps.Administration.PowerShell`, com `Add-PowerAppsAccount` de um administrador). Sem esse registro o `addUser` devolve 401/403 e o cadastro para em `systemuser` com `GRAPH_INDISPONIVEL`.

## 4. `.env` da raiz (não versionado)
```
ACESSO_TENANT_ID=<tenant>
ACESSO_CLIENT_ID=<client id>
ACESSO_LICENSE_SKU_ID=<sku id>
ACESSO_GROUP_ID=<object id do grupo>
ACESSO_APP_URL=https://org23b93544.crm2.dynamics.com/WebResources/new_app-motoristas-v2
ACESSO_ENVIRONMENT_ID=25a2ab78-cf07-ee41-a124-457aa2c29aea
```
`ACESSO_ENVIRONMENT_ID` é o id do ambiente no Power Platform (o valor acima é o DEV); o plugin o usa no `addUser`.
O `ACESSO_APP_URL` é o link direto do App Motoristas no DEV e exige o App Motoristas ≥ 2.1.760 (PR #61) publicado no DEV.

O `clientSecret` não vai no `.env`: o script de provisão pede a digitação (entrada oculta) e o grava só na configuração segura dos steps.

## 5. Ordem de publicação (da `main`, checkout principal)
1. `pnpm push:plugin:acesso:dev`
2. `powershell -File packages/deploy/provision-acesso.ps1 -Apply` (digita o clientSecret)
3. Atribuir a função "Acesso - Gestão de Motoristas" aos usuários da operação.
4. `pnpm push` (shell)
