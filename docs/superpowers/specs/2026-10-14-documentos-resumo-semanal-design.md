# Documentos — Resumo semanal por e-mail (Entrega 2)

Data: 14/10/2026 · Aprovado por: Renan · Base: `2026-10-13-gestao-documentos-design.md` (§6 substituída por esta spec)

## 1. Decisões

- Só **resumo semanal**. O aviso diário por marco da spec original foi descartado.
- Provisionamento **por script versionado** (`packages/deploy`), sem montagem manual no designer.
- E-mail sai da **caixa compartilhada noreply** ("Enviar e-mail de uma caixa compartilhada"); a conexão do Outlook precisa de "Enviar como" na noreply.
- Conteúdo: **contagens por estado + lista detalhada só do urgente** (vencidos, até 7 dias, faltantes).
- A regra fica numa **Custom API em C#** que monta o resumo inteiro; o flow só agenda, chama, formata e envia.
- Campos `cr40f_ultimomarcoavisado` e `cr40f_ultimoavisoem` ficam **sem uso**; não são excluídos.

## 2. Plugin e Custom API

### Projeto
- `packages/plugins/Betinhos.Documentos/` — .NET Framework 4.6.2, `Microsoft.CrmSdk.CoreAssemblies` 9.0.2.59, assembly assinado com `Betinhos.Documentos.snk`, gerado por `generate-strong-name-key.ps1` e ignorado no git (`*.snk` no `.gitignore` do projeto), como no DriverRecordSharing; a chave fica guardada fora do repo.
- `packages/plugins/Betinhos.Documentos.Tests/` — xUnit, referencia o projeto principal.
- Molde: `App Motoristas/plugins/DriverRecordSharing` (estrutura, assinatura, padrão de erro).

### Custom API `cr40f_DocumentosResumoSemanal`
- Function, sem entidade vinculada, sem efeitos colaterais (somente leitura).
- Entrada: `Hoje` (DateTime, opcional). Ausente → data atual em America/Sao_Paulo.
- Saída: `ResumoJson` (String).
- Privilégio: executa no contexto do chamador (o dono da conexão do flow), que precisa ler as tabelas de documentos, funcionários e veículos.

### Componentes
- `DocumentosResumoPlugin` — ponto de entrada; lê `Hoje`, chama repositório e builder, serializa.
- `DocumentosRepository` — consultas:
  - `cr40f_tipodocumento` ativos (categoria, obrigatório para, tem validade, ordem, nome).
  - `cr40f_documento` com situação Vigente (dono, tipo, validade, emissão, modificado em).
  - `cr40f_funcionarios` ativos (não desligados): nome, função.
  - `cr40f_veiculos` não vendidos: placa, categoria do veículo.
- `ResumoBuilder` — puro, sem SDK; porta `montarPendencias`, `indexarVigentes`, `statusDe` e os códigos de `domain/codes.ts` do shell.

### Regra (igual ao shell)
- Dono ativo × tipo ativo da mesma categoria.
- Sem documento vigente: **faltando** se o tipo é obrigatório para o perfil do dono (função para pessoas; categoria do veículo para frota).
- Com vigente: estado pela validade em dias de calendário (`vencido` < 0; `vence7` 0–7; `vence30` 8–30; `vence60` 31–60; acima disso ou tipo sem validade → sem alerta).
- Dois vigentes para o mesmo dono+tipo: vale o mais recente (validade, depois emissão, depois modificado em).
- Ordem: vencido, vence7, faltando, vence30, vence60; depois dias, nome do dono, ordem do tipo.

### Contrato de saída
```json
{
  "hoje": "2026-10-19",
  "categorias": [
    {
      "categoria": "pessoas",
      "contagens": { "vencido": 0, "vence7": 0, "vence30": 0, "vence60": 0, "faltando": 0 },
      "urgentes": [
        { "dono": "Nome", "detalhe": "Motorista", "tipo": "CNH", "validade": "2026-10-15", "estado": "vencido", "dias": -4, "quantidade": 1 }
      ]
    }
  ]
}
```
`urgentes` contém só `vencido`, `vence7` e `faltando`, já ordenados. `vencido` e `vence7` saem um por documento (`quantidade` 1); os faltantes são agrupados por dono (uma linha por dono: `tipo` lista os nomes separados por ", " e `quantidade` é o número de documentos faltando). `validade` e `dias` são `null` para faltantes. As duas categorias (`pessoas`, `frota`) sempre aparecem.

## 3. Flow "Documentos | Resumo semanal"

- Gatilho: recorrência semanal, segunda-feira 07:00, fuso E. South America Standard Time.
- Passos: chama a Custom API (Dataverse "Executar ação não associada") → Parse JSON → para cada categoria, lista os destinatários ativos de `cr40f_avisodestinatario` dessa categoria → para cada destinatário, envia o e-mail.
- E-mail HTML: assunto `Documentos | <Pessoas|Frota> | semana de dd/mm/aaaa`; blocos com as cinco contagens; tabela dos urgentes (dono, detalhe, documento, validade em dd/mm/aaaa, situação); botão/link para `<new_URLSistemaBetinhos>#/documentos?aba=<categoria>`. Sem pendências: "Nenhuma pendência nesta semana."
- Categoria sem destinatário ativo: não envia nada para ela.
- Try/Catch: falha em qualquer passo envia e-mail para `new_EmailAdminAvisos` com o nome do passo e a mensagem de erro.
- Sem retentativa própria; a execução seguinte é a da semana seguinte (o admin pode rodar manualmente).

## 4. Provisionamento

Script `packages/deploy/provision-documentos-resumo.ps1` (PowerShell 5.1, device code, bloqueio fixo do host de PROD, no molde de `provision-flow-consultar-onedrive.ps1`):
1. Compila o plugin em Release e registra/atualiza o assembly.
2. Cria ou atualiza a Custom API, seus parâmetros e o vínculo com o tipo de plugin.
3. Cria as variáveis de ambiente `new_URLSistemaBetinhos` e `new_EmailAdminAvisos` (valores por parâmetro do script; não versionados).
4. Importa/atualiza o flow a partir de `packages/deploy/flows/documentos-resumo-semanal.json`, usando as connection references existentes de Dataverse e Office 365 Outlook.
5. Adiciona tudo à solução AppBetinhos e publica as personalizações.
6. Falha explicitamente se faltar connection reference, permissão ou o build.

## 5. Testes

1. **Unitários C#** (`ResumoBuilder`): limites −1, 0, 7, 8, 30, 31, 60, 61; tipo sem validade; dono inativo; tipo inativo; tipo de outra categoria; obrigatoriedade por perfil (motorista × administrativo; próprio × terceiro × aluguel); dois vigentes; ordenação; categoria vazia.
2. **Paridade com o shell**: o mock de documentos do shell é exportado para um fixture JSON; um teste C# e um teste Vitest calculam as contagens do mesmo fixture com o mesmo `hoje` e devem coincidir.
3. **DEV**: chamar a Custom API com `Hoje` fixo e conferir o JSON; criar documentos de teste em −1, 3, 20 e 45 dias e um faltante; rodar o flow manualmente e conferir o e-mail recebido; forçar erro (variável inválida) e conferir o aviso ao admin.
4. **PROD**: só após ok explícito do Renan.

## 6. Riscos e pontos de atenção

- **Repo público**: nenhuma URL de ambiente, e-mail, ID de conexão ou chave no repo. O `.snk` não é versionado (mesma política do DriverRecordSharing); perder a chave obriga a registrar o assembly de novo com chave nova.
- **Duas implementações da regra** (TypeScript e C#): mitigado pelo teste de paridade no mesmo fixture.
- **Limite de 2 minutos do plugin síncrono**: volume atual (~45 motoristas, frota pequena) fica muito abaixo; consultas paginadas com `PagingInfo`.
- **"Enviar como" na noreply**: sem essa permissão o envio falha; o Try/Catch avisa o admin.
- **LGPD**: o e-mail lista nomes e tipos de documento (inclusive antecedentes); vai só para destinatários internos cadastrados por categoria.

## 7. Fora do escopo

Aviso diário por marco, WhatsApp, push no App Motoristas, exclusão dos campos de marco sem uso.

## 8. Ajustes de implementação (15/10/2026)

- **Padrão de plugin da main:** projeto `packages/plugins/Cr40f.Documentos.Plugin` (+ `.Tests`) e registrador `packages/plugins/tools/Cr40f.Documentos.Registrar`, no molde do `Cr40f.Financeiro.Plugin`. A chave fica em `%USERPROFILE%\.codex\keys\Cr40f.Documentos.Plugin.snk`, criada pelo script de push; substitui o `generate-strong-name-key.ps1` citado na §2.
- **Ação, não função:** a Custom API é uma ação global (`isfunction` false). O conector Dataverse do Power Automate só executa ações não associadas. Continua sem efeitos colaterais.
- **Envio:** "Enviar um email (V2)" com "De (Enviar como)" = noreply, o padrão dos flows existentes. O e-mail ao administrador sai sem "De", para não depender da mesma permissão que pode ter causado a falha.
- **Provisionamento:** plugin e Custom API pelo registrador (login interativo do Dataverse); variáveis e flow por `provision-flow-documentos-resumo.ps1` com `az login`. E-mail da noreply, URL do Sistema e e-mail do admin entram por parâmetro.
- **Paridade:** o fixture `Fixtures/paridade.json` é escrito à mão, cobrindo os limites e casos da §5, em vez de exportar o mock do shell.

- **Faltantes agrupados por dono (15/10/2026):** com dados reais do DEV a lista teria ~450 linhas; o Renan escolheu uma linha por dono com a quantidade. As contagens continuam por documento.
- **Validação no DEV (15/10/2026):** plugin publicado com os faltantes agrupados; `--testar 2026-10-19` devolveu Pessoas 14 vencidos e 435 faltando (46 linhas) e Frota 51 faltando (18 linhas). Flow "Documentos | Resumo semanal" provisionado e ativo, com as conexões mais usadas do DEV (Dataverse `new_sharedcommondataserviceforapps_5696d`, Outlook `new_sharedoffice365_f87d5`). Execução manual enviou o e-mail pela noreply, confirmado pelo Renan. O teste de falha forçada (aviso ao admin) ficou para depois.
- **Falha forçada (15/10/2026):** com remetente sem permissão, o envio falhou, o Catch avisou o admin e a execução ficou como Falha; remetente noreply restaurado em seguida.
