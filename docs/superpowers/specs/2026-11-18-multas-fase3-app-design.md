# Multas, fase 3: o motorista resolve no app

Data: 18/11/2026. Decisões do Renan em 18/11/2026.
Base: fase 1 (`2026-11-17-multas-fase1-design.md`), RH bloco 1 (`2026-11-18-rh-descontos-folha-design.md`, que substituiu a fase 2) e o termo de multa de outubro (`2026-10-22-termo-multa-assinatura-design.md`, `2026-10-23-termo-multa-ux-v2-brief.md`).

## 1. Contexto

O termo de multa com assinatura no App Motoristas existe desde 23/10/2026 e nunca foi usado:
- nenhum motorista tem o aditivo registrado;
- o texto vigente ainda é o rascunho `v0-placeholder`;
- na fase 1 o painel do termo (`TermoMultaPanel`) ficou escondido.

O termo foi feito antes do processo novo e não conversa com ele:
- **Status gravado direto.** `new_AssinarTermoMulta` grava `cr40f_status` = Indicada e `new_ContestarTermoMulta` grava Recurso direto na multa (`TermoMultaCommandPlugin.cs`). A trava da fase 1 (`MultaTravaPlugin`) aceita só o que vem da `cr40f_PassoMulta`; em `travar`, a assinatura seria recusada.
- **Etapa pulada.** A assinatura pula a etapa 2: o aviso e a indicação no órgão nunca são registrados.
- **Parcelas sobre a guia.** A assinatura cria as parcelas sobre o valor da guia (1 a 3). O bloco 1 do RH cria as parcelas no Acertar sobre o valor pago (1 a 12), que já tem o desconto de 40%.

Hoje o motorista fica sabendo da multa pelo WhatsApp. Na indicação pela Senatran, ele precisa aceitar na CNH Digital, e o Júnior só confere esse aceite depois.

## 2. Objetivo e escopo

O motorista recebe a multa no app, reconhece e aceita o desconto por lá, e acompanha a multa até a última parcela. O Júnior não precisa mais do WhatsApp para quem tem o aditivo.

**Entra:**
- O termo substitui o aviso na etapa 2. Quem não tem aditivo continua sendo avisado pelo WhatsApp.
- O termo grava o acordo: desconto em folha e número de parcelas. As parcelas nascem no Acertar.
- O "Não concordo" do motorista devolve a multa ao Júnior, na etapa 1.
- O aceite da CNH Digital pelo app: o motorista declara e o Júnior confere.
- "Minhas multas" no app, com a etapa e as parcelas.
- Lembretes por push.
- O aditivo assinado pelo gov.br.
- O texto v1 do termo e do aditivo, aprovado pelo Júnior.

**Fica fora:**
- A sugestão automática do condutor pelo Infleet (fica para depois).
- A forma "paga a guia" no termo. Assumi: a fase 1 já faz a empresa pagar a guia com 40%, e o motorista só acerta em folha. A opção sai do envio, e os termos antigos dela continuam legíveis.
- O aditivo em papel e o aceite do aditivo no próprio app. Decisão: só gov.br.
- O e-Frotas (fase 4), a reincidência e o Dashboard (fase 5).
- DSV e prefeituras continuam no papel.

## 3. Processo

### 3.1 Etapa 2, passo "Avisar o motorista"

O passo `AvisarMotorista` passa a ter dois caminhos. O drawer escolhe o caminho sozinho, pelo aditivo do motorista.

| Motorista | O que o Júnior faz | Quando o passo conta como feito |
|---|---|---|
| Com aditivo | "Enviar termo": número de parcelas (1 a 12, padrão 1) e primeiro mês | Quando o motorista assina |
| Sem aditivo | "Copiar mensagem" e depois "Avisei", como na fase 1 | No "Avisei" |

**Termo pendente.** No drawer, o passo mostra "Termo enviado em dd/mm, aguardando o motorista", com três ações:
- Lembrar;
- Cancelar termo;
- Avisar pelo WhatsApp, que cancela o termo e cai no caminho sem aditivo.

**Indicação.** Com termo pendente, `RegistrarIndicacao` recusa com a mensagem "Aguarde a assinatura do termo ou cancele o termo." O `PrazoVencido` continua tomando o passo quando o prazo vence, e responder a ele cancela o termo pendente.

**Assinatura.** A assinatura grava:
- `cr40f_datadeavisoaocondutor` = data da assinatura;
- o termo como vigente (`new_termovigente`).

A multa segue para `RegistrarIndicacao`. A assinatura não grava status direto: a mudança vai por um `Execute` de `cr40f_PassoMulta` com o passo interno `TermoAssinado`. Esse passo tem a mesma regra do `AvisarMotorista` e só é aceito dentro da API do termo, que o `ParentContext` comprova.

**Expiração.** O termo pendente expira no que vier primeiro:
- 7 dias depois do envio (como o flow "Expirar pendentes" já faz);
- 3 dias antes de `cr40f_dataparaindicar`.

Expirado, o passo volta a oferecer os dois caminhos. O flow "Expirar pendentes" é ligado nesta fase.

### 3.2 "Não concordo"

`new_ContestarTermoMulta` grava o termo como Contestado, com o motivo, e chama `cr40f_PassoMulta` com o passo interno `TermoContestado`. Esse passo:
- leva a multa para a etapa 1 (202410000);
- grava `cr40f_contestadaem` (coluna nova) = hoje;
- não apaga o motorista.

Na etapa 1, com `cr40f_contestadaem` preenchida, o passo `DefinirResponsavel` é obrigatório mesmo com motorista. O drawer mostra o motivo do motorista e o dossiê (`new_DossieMulta`). As saídas são as de sempre:
- outro motorista;
- Empresa, com motivo;
- o mesmo motorista, que volta à etapa 2 e é avisado pelo WhatsApp (o Júnior resolve fora do app).

`DefinirResponsavel` limpa `cr40f_contestadaem`. O e-mail "Multas de hoje" ganha a seção "Contestadas pelo motorista", logo depois de "Prazo vencido". Sai o `new_recursopendente = true` que a contestação gravava.

### 3.3 Acordo e parcelas

- **Envio do termo.** Só desconto em folha, de 1 a 12 parcelas. O primeiro mês segue a mesma janela do RH (do mês anterior até 12 meses à frente).
- **Valor no texto.** O texto diz "até R$ {valor}", com o valor da guia (`new_valorguia`, sugerido pelo catálogo). O valor descontado é o que a empresa pagou (`cr40f_valorpago`), que nunca é maior que o da guia.
- **Assinatura.** Não cria mais parcela.
- **Acertar → folha com termo vigente assinado.** O passo vem preenchido com as parcelas e o primeiro mês do termo e trava esses dois campos, porque o motorista assinou esses números. Se o primeiro mês já tiver saído da janela, o passo usa o mês atual e mostra "O primeiro mês do termo (mm/aaaa) já passou; as parcelas começam em <mês>". As parcelas ganham `new_termo` além de `new_multa`.
- **Acertar → empresa assume.** Continua livre. O termo fica vigente, só como registro.
- **Teto.** Se o valor pago for maior que o valor do termo, o Acertar → folha recusa com "O valor pago passou do valor do termo; envie um termo novo ou registre como empresa assume."

### 3.4 Aceite na CNH Digital

Na multa indicada pela Senatran, com a regra `AceitePendente` de `MultaEtapas`:
- o app mostra o cartão "Aceite a indicação na CNH Digital", com o passo a passo curto e o botão "Já aceitei";
- "Já aceitei" chama `new_DeclararAceiteMulta`, que grava `cr40f_aceitedeclaradoem` (coluna nova);
- no Sistema, o passo `RegistrarAceite` continua com o Júnior, com o rótulo "Conferir o aceite na CNH Digital (motorista declarou em dd/mm)";
- no e-mail diário, a multa sobe para o topo da seção "Aceite pendente".

O que conta é a conferência do Júnior: a declaração do motorista não avança a etapa.

### 3.5 Minhas multas

A tela "Multas" do app passa a listar as multas do motorista, e não só os termos. Fica uma lista só, com dois grupos.

**"Precisa de você":**
- termo pendente, que abre o termo como hoje;
- aceite pendente na CNH Digital.

**"Em andamento" e "Encerradas"** (as encerradas dos últimos 12 meses), com, em cada multa:
- placa, data e infração;
- a etapa em texto simples: "Aguardando a indicação no órgão", "Aguardando o pagamento", "Descontando 1 de 3", "Encerrada", "Cancelada" ou "Empresa assumiu";
- as parcelas com mês, valor e situação (Prevista ou Descontada);
- o PDF do termo assinado ("Baixar PDF", como já existe).

Dados: a Custom API nova `new_MinhasMultas`, só leitura. Ela roda como sistema e filtra pelo motorista do login (`DriverResolver`), no mesmo padrão de `new_ConsultarAditivoMotorista`. O motorista não ganha privilégio de leitura em `cr40f_multas` nem em `new_parcelamultafolha`.

A lista não devolve valor da guia, responsável Empresa com motivo nem dados de outro motorista. O badge do início conta só "Precisa de você".

### 3.6 Lembretes por push

Os lembretes usam o push que já existe (`new_LembrarTermoMulta`, flow "Termo de multa | Lembrete diário"):
- **Termo pendente:** um lembrete quando o termo faz 2 dias pendente (hoje é D-3), e outro na véspera da expiração.
- **Aceite pendente:** um push 2 dias depois da indicação, e de novo 2 dias depois, enquanto o aceite não for declarado nem conferido. São no máximo 3 pushes por multa.

Os lembretes do aceite usam a Custom API nova `new_LembrarAceiteMulta`, chamada pelo mesmo flow diário, e gravam `cr40f_ultimolembreteaceiteem` (coluna nova). O texto do push não leva valor nem infração; ele diz "Você tem uma multa para resolver no app".

### 3.7 Aditivo pelo gov.br

**Na ficha do funcionário (Sistema),** o bloco "Aditivo de assinatura eletrônica" tem três ações:
1. **Gerar aditivo.** Gera o PDF do texto vigente do tipo Aditivo, já preenchido com o nome e o CPF, pela Custom API nova `new_GerarAditivoMotorista` (reaproveita o `MiniPdf` do termo).
2. **O motorista assina no gov.br.** O Júnior manda o PDF ao motorista, que assina no assinador do gov.br (conta prata ou ouro) e devolve o arquivo assinado. Essa parte é fora do sistema.
3. **Anexar aditivo assinado.** O Júnior sobe o PDF e o sistema grava `new_aditivoassinatura`, com `new_aditivoassinaturaem` = data da assinatura informada.

**Conferência ao anexar.** A Custom API `new_RegistrarAditivoMotorista` confere:
- se o PDF tem um dicionário de assinatura (`/Type /Sig` com `/ByteRange`). Sem ele: "Este PDF não tem assinatura digital. Assine no gov.br e envie o arquivo que o gov.br devolveu.";
- se o hash do conteúdo antes da assinatura bate com o do aditivo gerado. Essa conferência é só de integridade: a validade jurídica fica para o Júnior conferir em validar.iti.gov.br, e o drawer leva o link.

O `TemAditivo` continua igual: data e PDF.

### 3.8 Textos v1

Ficam versionados em `docs/multas/termo-v1.md` e `docs/multas/aditivo-v1.md`, com os rascunhos do Apêndice A. O Júnior aprova o texto no PR do plano.

Um script novo, `packages/deploy/gravar-texto-termo.ps1 -EnvironmentUrl <url> -Versao v1`, grava os dois registros de `new_textotermomulta`, marca como vigentes e desmarca o `v0-placeholder`. O PR do plano mapeia o script no Deploy do DEV; no PROD ele roda à mão na virada, porque os registros não vão nas soluções.

Termo enviado com `v0-placeholder` depois da virada é recusado com "O texto do termo ainda é provisório."

## 4. Dados (uma migration)

`packages/deploy/migrations/AAAAMMDD-HHMM-multas-fase3.ps1`, idempotente.

| Tabela | Coluna | Tipo | Uso |
|---|---|---|---|
| `cr40f_multas` | `cr40f_contestadaem` | data | "Não concordo" pendente de decisão |
| `cr40f_multas` | `cr40f_aceitedeclaradoem` | data | motorista declarou o aceite na CNH Digital |
| `cr40f_multas` | `cr40f_ultimolembreteaceiteem` | data | controle do push de aceite |
| `new_termomulta` | `new_parcelas` | int | o limite passa de 1–3 para 1–12 (só altera o `MaxValue`) |

As três colunas novas de `cr40f_multas` entram como campos de passo na trava (seção 5.3 da fase 1). Elas só mudam pela `cr40f_PassoMulta` ou pelas APIs do termo.

## 5. Servidor

**`Cr40f.Frota.Plugin`:**
- **`MultaEtapas` (C# e o espelho em TS, com paridade):**
  - passos internos `TermoAssinado` e `TermoContestado`;
  - recusa de `RegistrarIndicacao` com termo pendente (o estado ganha `TermoPendente`);
  - `DefinirResponsavel` obrigatório com `ContestadaEm`;
  - rótulo do aceite declarado;
  - teto do Acertar pelo termo;
  - preenchimento do Acertar pelo termo vigente.
- **`cr40f_MultasDoDia`:** ganha a seção "Contestadas pelo motorista" e a ordem nova do aceite.

**`Betinhos.DriverRecordSharing` (`TermoMultaCommandPlugin`):**
- **`Enviar`:** exige multa na etapa 2 com `AvisarMotorista` pendente, aceita só a forma Folha e de 1 a 12 parcelas, e recusa o texto `v0-placeholder`.
- **`Assinar`:** não cria parcela e não grava status; chama `cr40f_PassoMulta`/`TermoAssinado`.
- **`Contestar`:** chama `cr40f_PassoMulta`/`TermoContestado`.
- **`Expirar`:** prazo novo (seção 3.1).
- **APIs novas:** `new_MinhasMultas`, `new_DeclararAceiteMulta`, `new_LembrarAceiteMulta`, `new_GerarAditivoMotorista` e `new_RegistrarAditivoMotorista`. Entram na lista `Apis` (gravação do servidor) as que gravam.
- **Chamada entre assemblies.** O `Execute` de `cr40f_PassoMulta` vem de dentro da API do termo, então a trava aceita pelo `ParentContext`. O teste cobre os dois modos da trava.

## 6. Sistema (shell)

- **Drawer da multa:** o `TermoMultaPanel` sai do esconderijo e vira o caminho "com aditivo" do passo `AvisarMotorista`, sem painel separado. Também ganha o motivo da contestação na etapa 1 e o "motorista declarou em dd/mm" no aceite.
- **Acertar → folha:** preenchido e travado pelo termo (seção 3.3).
- **Ficha do funcionário:** o bloco do aditivo (seção 3.7).
- **Mock:**
  - motorista com e sem aditivo;
  - termo pendente, assinado e contestado;
  - aceite declarado;
  - Acertar com termo.

## 7. App Motoristas

- **Tela "Multas":** a seção 3.5, que substitui a lista de termos (`TermosMultaScreen`). O detalhe do termo (`TermoMultaDetalheScreen`) continua.
- **Cartão do aceite na CNH Digital:** o texto curto e o "Já aceitei", com confirmação.
- **Badge do início:** "Precisa de você".
- **Tour (`tourChapters.ts`):** o capítulo das multas é atualizado.
- **Offline:** a tela lê do cache da última carga. "Já aceitei" e "Assinar" exigem conexão e mostram "Sem conexão, tente de novo"; eles não entram na fila offline.

## 8. Virada

**DEV:**
- um PR para a `develop`;
- o Deploy aplica a migration, os dois assemblies, as Custom APIs, a tela e o App;
- `gravar-texto-termo.ps1` grava o v1;
- o flow "Expirar pendentes" é ligado e o "Lembrete diário" é atualizado pelo Deploy (flow que já existe).

**PROD:**
- pelo "Publicar soluções", depois da fase 1 e do RH bloco 1;
- `gravar-texto-termo.ps1` roda no PROD;
- os flows do termo são conferidos.

**Antes de ligar:**
- o Júnior aprova os textos v1;
- um motorista piloto assina o aditivo pelo gov.br;
- uma multa real passa pelo termo do começo ao fim.

**Volta atrás:** os motoristas voltam ao WhatsApp. Basta cancelar os termos pendentes: sem termo, o passo cai no caminho sem aditivo.

## 9. Testes e verificação

**Plugins:**
- envio fora da etapa 2, sem aditivo e com `v0-placeholder`;
- assinatura avançando pelo `TermoAssinado`, com a trava em `travar`;
- contestação voltando à etapa 1;
- `RegistrarIndicacao` recusado com termo pendente;
- `PrazoVencido` cancelando o termo;
- os dois limites da expiração;
- Acertar preenchido, mês fora da janela e teto do termo;
- `new_MinhasMultas` sem dado de outro motorista;
- os pushes de aceite, no máximo 3;
- `new_RegistrarAditivoMotorista` com PDF sem assinatura e com hash diferente.

**Paridade C#/TS** de `MultaEtapas` com os passos novos.

**Shell (vitest):**
- os dois caminhos do aviso;
- o termo pendente com as três ações;
- a contestação na etapa 1;
- o Acertar travado;
- o bloco do aditivo.

**App (vitest):**
- os grupos da tela "Multas";
- a etapa em texto simples;
- as parcelas;
- o "Já aceitei" offline.

**Skills:**
- `verificar-multas`, no DEV: uma multa fictícia com termo assinado até a última parcela, e outra contestada;
- `verificar-termo-multa` e `verificar-app-termo-multa`: saem do "escondido" da fase 1.

**Prints:** drawer, ficha, tela "Multas" do app e cartão do aceite. `ux-audit` no modo Fluxo nas duas pontas.

## 10. Pontos a confirmar no plano

- **Assinatura do gov.br:** o formato do PDF que o gov.br devolve (conferir com um arquivo real no DEV) e se o hash do conteúdo original é recuperável pelo `/ByteRange`. Se não for, fica só a conferência do dicionário de assinatura.
- **Aviso ao gestor:** se o e-mail "Termo de multa | Aviso ao gestor" continua, agora que a assinatura e a contestação também aparecem no e-mail diário.
- **Prazo após contestação:** como fica o prazo de indicação de uma multa que foi contestada perto do vencimento (o `PrazoVencido` assume no dia seguinte ao prazo).

## Apêndice A. Rascunhos v1 (para o Júnior aprovar)

Marcadores: `{motorista}`, `{cpf}`, `{placa}`, `{datahora}`, `{local}`, `{infracao}`, `{auto}`, `{valor}`, `{parcelas}` e `{primeiromes}`.

### Termo de reconhecimento de infração e autorização de desconto (v1)

> Eu, {motorista}, CPF {cpf}, declaro que conduzia o veículo de placa {placa} em {datahora}, no local {local}, quando foi registrada a infração {infracao} (auto nº {auto}).
>
> Reconheço minha responsabilidade pela infração e concordo com a minha indicação como condutor junto ao órgão autuador.
>
> Autorizo a Betinhos Executive Service a descontar do meu salário o valor que ela efetivamente pagar por esta multa, limitado a {valor}, em {parcelas} parcela(s) mensal(is) e iguais, a partir da folha de {primeiromes}, conforme o aditivo de assinatura eletrônica e desconto que assinei.
>
> Se meu contrato de trabalho terminar antes da última parcela, o saldo restante poderá ser descontado nas verbas rescisórias, dentro dos limites da lei.
>
> Assino este termo pelo App Motoristas, com meu login, selfie, localização e assinatura desenhada, e recebo uma cópia em PDF no meu e-mail.

### Aditivo ao contrato de trabalho: assinatura eletrônica e desconto de multas (v1)

> Eu, {motorista}, CPF {cpf}, empregado da Betinhos Executive Service, concordo que:
>
> 1. Termos ligados a multas de trânsito ocorridas comigo na condução de veículos da empresa podem ser assinados por mim no App Motoristas, com meu login corporativo, selfie, localização e assinatura desenhada. Essa assinatura tem para mim a mesma validade da assinatura em papel, nos termos do art. 10, § 2º, da MP 2.200-2/2001.
> 2. Em cada multa sob minha responsabilidade, o desconto em folha só acontece depois de eu assinar o termo daquela multa, com o valor e as parcelas que constarem nele, conforme o art. 462, § 1º, da CLT.
> 3. Posso recusar um termo no próprio app ("Não concordo"), informando o motivo, e a empresa vai analisar a recusa antes de qualquer desconto.
> 4. Recebo uma cópia em PDF de cada termo que eu assinar.
>
> Este aditivo é assinado por mim no assinador do gov.br.
