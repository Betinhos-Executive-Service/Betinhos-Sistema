# Gestão de documentos e lembretes de vencimento — design

Data: 13/10/2026 · Autor: Renan (decisões) + Claude · Status: aprovado em chat

## 1. Problema

- Funcionários: só `cr40f_validadedacnh`, `cr40f_datadoaso` e uma pasta SharePoint com arquivos sem tipo. PROD (13/10/2026): 45 motoristas ativos, 22 com validade de CNH, 10 com ASO.
- Frota: `cr40f_veiculos` não tem nenhum campo de documento/vencimento (28 ativos: 16 próprios, 8 terceiros, 4 alugados).
- Lembretes: não existem. Só alertas na tela Funcionários (30/60 dias) e card de CNH no Dashboard (90 dias) — regras divergentes.

## 2. Escopo

Dentro:
- Documentos tipados com validade, arquivo e histórico para **Pessoas** (CNH, ASO, Antecedentes criminais, Certidões, RG, CPF, Comprovante de residência, Contrato) e **Frota** (CRLV/Licenciamento, IPVA, Seguro).
- Central `#/documentos`, aba Documentos na ficha do funcionário e nova seção Documentos na ficha do veículo.
- Lembretes: central no Sistema (calculada ao vivo) + e-mail diário por marco + resumo semanal, para destinatários internos por categoria.
- Regra única de vencimento: marcos 60, 30, 7 dias e vencido.

Fora (fases seguintes): WhatsApp, push no App Motoristas, aviso ao próprio motorista, Teams, valor/parcelas de IPVA e seguro, OCR de documento.

## 3. Schema (Dataverse, solução AppBetinhos)

### `cr40f_tipodocumento` — catálogo
| Campo | Tipo | Uso |
|---|---|---|
| `cr40f_name` | texto (primário) | Nome exibido |
| `cr40f_codigo` | texto 40, único por convenção | `CNH`, `ASO`, `ANTECEDENTES`, `CERTIDAO`, `RG`, `CPF`, `RESIDENCIA`, `CONTRATO`, `CRLV`, `IPVA`, `SEGURO`; também nome da subpasta |
| `cr40f_categoria` | choice | Pessoas (100000000) · Frota (100000001) |
| `cr40f_temvalidade` | sim/não | Documento vence? |
| `cr40f_validadepadraomeses` | inteiro, opcional | Sugere validade = emissão + N meses (ASO = 12) |
| `cr40f_obrigatoriopara` | multi-choice | Motorista (100000000) · Administrativo (100000001) · Próprio (100000002) · Terceiro (100000003) · Aluguel (100000004) |
| `cr40f_ordem` | inteiro | Ordem no checklist |

Seed: CNH (validade, obrig. Motorista), ASO (validade, 12 meses, obrig. Motorista+Administrativo), Antecedentes (validade digitada, obrig. Motorista), Certidões (validade digitada), RG/CPF/Residência/Contrato (sem validade, obrig. Motorista+Administrativo), CRLV (validade, obrig. Próprio+Terceiro+Aluguel), IPVA (validade, obrig. Próprio), Seguro (validade, obrig. Próprio+Terceiro+Aluguel).

### `cr40f_documento` — uma linha por documento emitido
| Campo | Tipo | Uso |
|---|---|---|
| `cr40f_name` | texto (primário) | `"<Tipo> · <apelido ou placa>"`, montado pelo app |
| `cr40f_tipo` | lookup → `cr40f_tipodocumento` | obrigatório |
| `cr40f_funcionario` | lookup → `cr40f_funcionarios` | exatamente um entre funcionário e veículo |
| `cr40f_veiculo` | lookup → `cr40f_veiculos` | idem |
| `cr40f_numero` | texto 100 | opcional |
| `cr40f_emissao` | data | opcional |
| `cr40f_validade` | data | obrigatória quando o tipo tem validade |
| `cr40f_situacao` | choice | Vigente (100000000) · Substituído (100000001) |
| `cr40f_pasta` | texto 400 | Caminho SharePoint da pasta do documento |
| `cr40f_observacao` | texto multilinha | valor de IPVA, seguradora etc. |
| `cr40f_ultimomarcoavisado` | choice, opcional | 60 (100000000) · 30 (100000001) · 7 (100000002) · Vencido (100000003) |
| `cr40f_ultimoavisoem` | data/hora | último e-mail enviado |

Status vencido/vencendo é **calculado**, nunca gravado.

### `cr40f_avisodestinatario`
| Campo | Tipo |
|---|---|
| `cr40f_name` | texto (primário, apelido do funcionário) |
| `cr40f_categoria` | choice Pessoas · Frota |
| `cr40f_funcionario` | lookup → `cr40f_funcionarios` (e-mail = `cr40f_emailbetinhos`) |
| `statecode` | ativo/inativo nativo |

### Arquivos
SharePoint (site Gestão Interna, flows `new_URLFlow*SharePoint` existentes):
- `Funcionarios/[DEV/]<funcionarioId>/Documentos/<codigo>/`
- `Veiculos/[DEV/]<veiculoId>/Documentos/<codigo>/`

Nome do arquivo: `<codigo>_<validade ou emissão aaaa-mm-dd>_<nome original saneado>`. Tipos aceitos PDF, JPG, PNG; 10 MB.
Reaproveita `createSharePointDocs` de `pages/funcionarios/data/sharepoint.ts` (como Currículos já faz), com raiz `Funcionarios` ou `Veiculos`; `listar` ganha `subpasta` opcional. A cópia da Frota (`frota/data/sharepoint.ts`, só fotos) não é mexida.

### Migração e compatibilidade
- Script cria um `cr40f_documento` Vigente para cada funcionário com `cr40f_validadedacnh` (CNH) e com `cr40f_datadoaso` (ASO: emissão = data do ASO, validade = +12 meses). Idempotente: não cria se já existir Vigente do tipo. Arquivos existentes não são movidos.
- Dual-write na transição: salvar CNH/ASO Vigente também atualiza `cr40f_validadedacnh` / `cr40f_datadoaso` do funcionário (Dashboard, App Motoristas e flows antigos continuam corretos).

## 4. Regras de domínio (`apps/shell/src/pages/documentos/domain/`)

- `diasPara(validade, hoje)`: dias inteiros em America/Sao_Paulo.
- `marcoDe(dias)`: `vencido` se < 0; `7` se 0–7; `30` se 8–30; `60` se 31–60; `null` acima de 60.
- `statusDe`: `vencido | vence7 | vence30 | vence60 | ok | semValidade` (KPIs em faixas exclusivas: vencidos, até 7, 8–30, 31–60, faltando).
- Faltantes (em `montarPendencias`): para cada funcionário com `cr40f_status` Ativo ou Afastado (não Desligado) e veículo não Vendido (`cr40f_statusdoveiculo` ≠ 202410000; terceiros sem status contam como ativos), tipos cuja `obrigatoriopara` contém a função/categoria e que não têm documento Vigente.
- `validadeSugerida(tipo, emissao)`: emissão + `validadepadraomeses`.
- `deveAvisar(marcoAtual, ultimoMarco)`: só quando o marco atual é mais grave (ordem 60 < 30 < 7 < vencido).
- Renovar: cria novo Vigente e muda o anterior do mesmo dono+tipo para Substituído. Tipos sem validade também usam o fluxo (substituir arquivo).

Alertas de CNH/ASO da tela Funcionários e o card de CNH do Dashboard passam a usar `JANELA_DIAS` (60) deste módulo.

## 5. Telas (Design System Betinhos; `DESIGN_SYSTEM.md` lido antes de editar)

### Central `#/documentos`
- Menu: grupo Cadastros, item "Documentos", com badge = vencidos + vencem em ≤ 7 dias.
- KPIs clicáveis: Vencidos · ≤ 7 dias · ≤ 30 · ≤ 60 · Faltando.
- Abas Pessoas | Frota; lista por urgência (dono, tipo, validade, "vence em X dias"/"vencido há X dias", status); busca e filtro por tipo; estado na URL (`?aba=&kpi=&tipo=&q=`).
- Ações por linha: Renovar (drawer) e Abrir ficha (`#/funcionarios?ficha=<id>&secao=documentos` / `#/frota?ficha=<id>`).
- Botão Configurações → drawer com abas Tipos de documento (CRUD sem excluir) e Destinatários (adicionar/remover por categoria).

### Ficha do funcionário — aba Documentos
Checklist por tipo (Pessoas, ordenado por `ordem`): status, validade, arquivos do Vigente, histórico (Substituídos) recolhido; botões Adicionar/Renovar. Seção "Outros arquivos" mantém o `DocumentosArquivos` atual e o link da pasta antiga do OneDrive.

### Ficha do veículo — seção Documentos (nova)
A ficha da Frota não tem abas: nova seção "Documentos" entre "Dados" e "Custo de manutenção", com o mesmo componente e os tipos de Frota.

### Drawer Renovar/Adicionar
Número, emissão, validade (sugerida), observação, arquivos. Salvar: cria documento → envia arquivos → marca anterior Substituído → dual-write CNH/ASO. Falha de upload mantém o documento e mostra "Tentar enviar de novo". Overlay fecha ao clicar fora/X/Esc; com alteração não salva pede "Descartar alterações?"; durante salvamento não fecha.

Versão `vX.Y.Z · dd/mm/aaaa HH:mm` segue o rodapé do shell.

## 6. Lembretes (Power Automate, solução AppBetinhos)

### Flow "Documentos | Aviso diário"
- Recorrência diária 07:00 (E. South America Standard Time).
- Lista `cr40f_documento` Vigentes com `cr40f_validade` ≤ hoje+60, expand tipo/dono.
- Calcula marco; filtra `deveAvisar`.
- Agrupa por categoria; para cada destinatário ativo da categoria, um e-mail HTML (Office 365 Outlook, caixa noreply) com tabela (dono, tipo, validade, marco) e link `<URL do Sistema>#/documentos?aba=<categoria>`.
- Após envio com sucesso, atualiza `cr40f_ultimomarcoavisado` e `cr40f_ultimoavisoem` de cada documento incluído; se o envio falhar, não atualiza (entra no dia seguinte).
- Sem itens: não envia nada.

### Flow "Documentos | Resumo semanal"
- Segunda-feira 07:00. Por categoria: vencidos, vencem em ≤ 60 dias e faltantes obrigatórios. Envia mesmo com tudo em dia ("Nenhuma pendência").

### Configuração
- Variável de ambiente `new_URLSistemaBetinhos` (link usado nos e-mails).
- Escopo Try/Catch: falha da execução envia e-mail ao administrador (variável `new_EmailAdminAvisos`).

## 7. Erros e segurança
- Leitura falhou: estado de erro com "Tentar de novo"; nada fictício fora do mock.
- LGPD: Antecedentes é dado sensível; a central e as abas ficam visíveis apenas a quem já acessa Funcionários; pastas SharePoint herdam as permissões atuais. Tabelas novas com privilégios dos mesmos papéis de `cr40f_funcionarios`.
- PROD só leitura até pedido explícito; tudo começa no DEV.

## 8. Testes
1. Unitários de domínio: marcos (limites −1, 0, 7, 8, 30, 31, 60, 61), faltantes, validade sugerida, `deveAvisar`, montagem de nome/pasta.
2. Componentes com mock: central (KPIs, filtros, URL), checklist, drawer (validação, descarte, falha de upload).
3. DEV: documentos de teste vencendo em 60/30/7/−1 dias; rodar o flow manualmente duas vezes e conferir que cada marco gera um único e-mail.
4. PROD após ok do Renan.

## 9. Entregas
1. Documentos: schema + seed + migração, domínio, central, abas nas fichas, unificação dos alertas.
2. Lembretes: variáveis e os dois flows — plano próprio, escrito ao concluir a Entrega 1 (destinatários e sua tela já entram na Entrega 1).
3. Depois: WhatsApp, push App Motoristas.
