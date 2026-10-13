# Validação de despesas operacionais com IA (API do Claude)

Data: 13/10/2026 · Decisões de Renan nesta data.

## Objetivo
Cada despesa enviada pelo App Motoristas é analisada pela IA assim que o comprovante termina de subir: a IA lê a foto, confere com o lançamento e **decide** se a despesa fica `Validado` ou `Precisa corrigir`, vincula a OS e aponta possível duplicidade. O financeiro passa a tratar só as exceções.

Motivação (PROD, 13/10/2026): 1.100 despesas (R$ 121,4 mil) desde 01/07 paradas em `Enviado`, nenhuma validada, nenhuma vinculada a OS; 92,8% têm comprovante anexado.

## Decisões
| Tema | Decisão |
|---|---|
| Autonomia | A IA decide (`validar` ou `precisa_corrigir`). Abordagem B: o flow só monta o contexto e trava falhas técnicas; não aplica regra de negócio própria. |
| Motorista | Não é avisado nesta versão. Só o financeiro vê o resultado. App Motoristas sem mudança. |
| Despesas antigas | Fora do escopo. Só despesas criadas após a implantação. |
| Hospedagem | Power Automate (gatilho Dataverse + conector HTTP premium) na solução AppBetinhos. |
| Tolerância de valor | Valor lido x lançado: diferença de até R$ 0,50 é aceitável. Critério passado no prompt. |
| Teto de valor | Nenhum. |
| Resultado | Colunas novas em `cr40f_despesaoperacional`. |
| Conta API | Conta Anthropic existente; workspace próprio ("Despesas") com limite de gasto mensal. |
| Modelo | `claude-opus-5-5`, effort `medium`, structured outputs. Custo estimado: ~R$ 0,10 por despesa, R$ 30–40/mês (~310 despesas/mês). |
| Armazenamento | Comprovantes novos de despesa passam a ser salvos no SharePoint (mesmo site e biblioteca usados pelo "Flow - Consultar Arquivos Sharepoint"), pasta `Despesas/AAAA/MM`, e não mais no OneDrive da conta `noreply`. Arquivos antigos ficam onde estão. |

## Armazenamento dos comprovantes
- O upload de comprovante de despesa (hoje via "Flow Salvar Arquivos Onedrive" ou o fluxo que o App Motoristas chamar para despesas; confirmar no plano) grava no SharePoint em `Despesas/AAAA/MM/<protocolo ou id da despesa>-<ordem>.<ext>`.
- O upload preenche no anexo: `cr40f_driveitemid` (id do item no SharePoint), `cr40f_urlsharepoint`, `cr40f_sharelink` (link interno da organização), `cr40f_mimetype` e `cr40f_tamanhobytes`.
- Contrato com o App Motoristas preservado: mesma chamada, mesmos parâmetros e mesma resposta; só muda o destino. Se o flow for compartilhado com outros usos (não despesa), apenas o ramo de despesa muda.
- O flow de análise lê o arquivo pelo id do item no SharePoint (conector SharePoint, "Obter conteúdo do arquivo").

## Fluxo
1. **Gatilho**: linha modificada em `cr40f_despesaoperacional`, coluna `cr40f_statusanexo` = Completo, `cr40f_origem` = App Motoristas (100000000) e `cr40f_iastatusanalise` vazio ou Pendente. Primeira ação: gravar `Processando` (evita execução dupla).
2. **Contexto** (o flow coleta, não decide):
   - Comprovantes: anexos `cr40f_tipo` = Comprovante e `cr40f_status` = Enviado, até 3, por `cr40f_ordem`. Imagem (JPEG/PNG/WebP) vai como bloco `image`; PDF como `document`.
   - Lançamento: valor, data do gasto, categoria, forma de pagamento, estabelecimento, litros, km, observação.
   - OS do motorista no dia do gasto (America/Sao_Paulo): id, número, saída, destino, cliente, status.
   - Possíveis duplicatas: despesas com comprovante de mesmo `cr40f_tamanhobytes` e mesmo tipo de arquivo (mesma foto reenviada), ou mesmo valor e data em ±7 dias.
   - Referência da categoria: mediana e máximo de `cr40f_valor` nos últimos 90 dias (despesas validadas ou, enquanto não houver, todas).
3. **Chamada**: `POST https://api.anthropic.com/v1/messages`, `anthropic-version: 2023-06-01`, `max_tokens` 4000, `output_config.format` com o schema abaixo. Chave em variável de ambiente secreta (Key Vault) ou, sem Key Vault, variável de ambiente com entradas/saídas seguras na ação HTTP.
4. **Gravação**:
   - `decisao = validar` → `cr40f_statusoperacional` = Validado.
   - `decisao = precisa_corrigir` → Precisa corrigir.
   - `cr40f_reserva` = OS indicada (só se o id estiver entre as OS enviadas no contexto).
   - `cr40f_possivelduplicidade` = valor devolvido.
   - Colunas `cr40f_ia*` preenchidas; `cr40f_iastatusanalise` = Concluída.
5. **Travas técnicas** (não são regra de negócio): erro HTTP, timeout, `stop_reason` ≠ `end_turn`, JSON inválido, comprovante ausente ou ilegível para download, OS indicada fora do contexto → `cr40f_iastatusanalise` = Erro, motivo em `cr40f_iamotivos`, status operacional permanece `Enviado`. Nunca grava `Validado` nesses casos. Até 2 tentativas automáticas com espera (429/5xx).

## Saída da IA (structured output)
```json
{
  "comprovante_legivel": true,
  "tipo_comprovante": "cupom_fiscal | nfce | pedagio | estacionamento | recibo | outro",
  "valor_lido": 85.40,
  "data_lida": "2026-10-12",
  "hora_lida": "14:32",
  "cnpj_lido": "00.000.000/0000-00",
  "estabelecimento_lido": "Posto X",
  "litros_lidos": 32.5,
  "decisao": "validar | precisa_corrigir",
  "motivos": ["texto curto por motivo"],
  "reserva_id": "guid ou null",
  "possivel_duplicidade": false,
  "confianca": 0.0
}
```
Campos ausentes no comprovante voltam `null`. `motivos` é obrigatório quando `decisao = precisa_corrigir`.

## Critérios passados no prompt
- Validar só se: comprovante legível e coerente com a categoria; valor lido igual ao lançado com diferença ≤ R$ 0,50; data lida igual à data do gasto (±1 dia); sem indício de duplicidade; valor plausível frente à referência da categoria.
- Em dúvida, `precisa_corrigir`. Nunca inventar valor ou data que não esteja legível.
- Vínculo com OS: escolher só entre as OS enviadas; se nenhuma for coerente, `null` (não impede validar).

## Colunas novas em `cr40f_despesaoperacional`
| Coluna | Tipo |
|---|---|
| `cr40f_iastatusanalise` | Choice: Pendente, Processando, Concluída, Erro |
| `cr40f_iadecisao` | Choice: Validar, Precisa corrigir |
| `cr40f_iamotivos` | Texto multilinha |
| `cr40f_iavalorlido` | Moeda |
| `cr40f_iadatalida` | Data (somente data) |
| `cr40f_iacnpjlido` | Texto (20) |
| `cr40f_iaestabelecimentolido` | Texto (200) |
| `cr40f_iaconfianca` | Decimal (0–1, 2 casas) |
| `cr40f_iajson` | Texto multilinha (resposta bruta) |
| `cr40f_iadataanalise` | Data e hora |
| `cr40f_iamodelo` | Texto (60) |

Criadas no DEV, incluídas na solução AppBetinhos e publicadas; PROD via solução.

## Fora do escopo
Mudanças no App Motoristas, migração dos arquivos antigos do OneDrive, despesas anteriores à implantação, tela React de Despesas (pode exibir as colunas `cr40f_ia*` depois), status financeiro e pagamento.

## Pontos a confirmar na implementação
- Qual flow o App Motoristas chama para subir o comprovante de despesa, se ele é compartilhado com outros uploads, e o site/biblioteca exatos usados pelo "Flow - Consultar Arquivos Sharepoint".
- Hoje (PROD, 13/10) `cr40f_driveitemid`, `cr40f_mimetype`, `cr40f_tamanhobytes` e `cr40f_hasharquivo` estão vazios; o novo upload passa a preencher os três primeiros.
- Limite de 5 MB por imagem na API: medir o tamanho real das fotos no DEV; se necessário, a análise cai em Erro com motivo "arquivo acima de 5 MB".
- No PROD já há comprovantes com o mesmo link de arquivo em despesas diferentes (amostra de 13/10): indica reenvio ou duplicação no upload; investigar no plano.

## Verificação
1. Conjunto de ~30 despesas reais copiadas para o DEV (fotos boas, ruins, PDF, duplicadas, valor divergente) com a decisão esperada anotada.
2. Meta antes de ligar no PROD: 0 validações indevidas e ≥ 80% de acerto geral no conjunto.
3. DEV autenticado: gatilho dispara uma vez, colunas gravadas, erro técnico não valida.
4. PROD: primeira semana com relatório diário de decisões para conferência do financeiro.
