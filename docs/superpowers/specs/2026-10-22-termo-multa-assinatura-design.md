# Termo de multa com assinatura eletrônica — design

Data: 22/10/2026. Decisões do Renan/Junior na conversa de 22/10.

## Objetivo

Dar prova trabalhista (CLT art. 462 §1º; MP 2.200-2/2001 art. 10 §2º) do acordo de pagamento de cada multa, sem o motorista ir ao escritório.

## Decisões fechadas

- **Sem OTP.** Identidade = login Microsoft do motorista no App Motoristas v2 + selfie + GPS + assinatura desenhada.
- **A negociação é com o gestor de frota, fora do app.** O gestor registra o acordo no Sistema Betinhos (Frota → multa) e envia o termo. O app só mostra o termo pronto: **Assinar** ou **Não concordo** (com motivo). Assinar é o reconhecimento.
- **Valor:** nova coluna "Valor da guia" na multa, sugerida pelo valor do catálogo de infrações e editável pelo gestor. Termo e parcelas usam esse valor.
- **Evidências na tela:** multa (placa, data/hora, local, infração, valor) + evidências do InFleet (posição/trajeto na hora). Sem vínculo com reserva.
- **Parcelas:** tabela própria do DP (1 a 3 parcelas, competência e valor).
- **Contrato de indicação (Detran):** continua separado e como está. Não muda neste escopo.
- **Aditivo:** o motorista assina uma vez em papel o aceite do app como meio de assinatura; o gestor registra (data + PDF digitalizado). Sem aditivo, o gestor não consegue enviar termo e o app mostra "procure o escritório".

## Fluxo

1. Gestor abre a multa (status Notificar o Condutor ou Condutor Notificado, com motorista) → "Preparar termo": forma (paga a guia / desconto em folha), parcelas (1–3), 1ª competência, valor da guia. Sistema mostra a prévia das parcelas e a versão vigente do texto. "Enviar para assinatura" chama `new_EnviarTermoMulta`.
2. Servidor valida (aditivo, motorista, sem recurso pendente se for desconto, sem outro termo pendente), congela texto e acordo no termo (status Pendente) e manda push.
3. Motorista, no App v2 → "Multas" (badge de pendências) → termo: evidências, acordo, texto. **Assinar**: selfie (câmera frontal), GPS (lat/long/precisão), assinatura. Chama `new_AssinarTermoMulta`. **Não concordo**: motivo → `new_ContestarTermoMulta`.
4. Servidor (assinatura): grava data/hora do servidor, gera o PDF, calcula SHA-256, salva PDF e hash, status Assinado, multa → Indicada; se desconto e sem recurso pendente, cria as parcelas. Contestação: status Contestado, multa → Recurso, sem parcelas.
5. Flow "Termo de multa | Cópia" (gatilho: termo Assinado com PDF) envia o PDF ao e-mail do motorista e grava data/canal do envio. O app também oferece "Baixar PDF".
6. Termo Pendente há mais de 15 dias → Expirado (flow agendado diário); o gestor pode reenviar.

## Modelo de dados (prefixo `new_`, solução DEV do .env; distribuição pela regras.json)

`new_termomulta` (Termo de multa) — dono usuário:
- `new_name` (texto, "TM-<placa>-<data>"), `new_multa` (lookup cr40f_multas), `new_motorista` (lookup cr40f_funcionarios)
- `new_status` choice: Pendente 100000000, Assinado 100000001, Contestado 100000002, Expirado 100000003, Cancelado 100000004
- `new_formapagamento` choice: Paga a guia 100000000, Desconto em folha 100000001
- `new_parcelas` (int 1–3), `new_valortotal` (money), `new_valorparcela` (money), `new_primeiracompetencia` (DateOnly, dia 1)
- `new_versaotexto` (texto 20), `new_textotermo` (multilinha 20.000, texto exato exibido)
- `new_evidenciasjson` (multilinha 20.000: placa, data/hora, local, infração, valor, InFleet — congelado no envio)
- `new_selfie` (imagem, full), `new_assinaturajson` (multilinha 100.000), `new_assinatura` (imagem PNG gerada no servidor)
- `new_latitude`, `new_longitude` (decimal 6 casas), `new_precisaogps` (decimal, metros)
- `new_dispositivo` (texto 500: user agent, plataforma, versão do app)
- `new_enviadoem`, `new_assinadoem` (data/hora do servidor), `new_motivocontestacao` (multilinha 2.000)
- `new_pdf` (arquivo, 10 MB), `new_hashpdf` (texto 64), `new_copiaenviadaem` (data/hora), `new_copiacanal` (texto 50)

`new_parcelamultafolha` (Parcela de multa em folha): `new_termo`, `new_motorista`, `new_numero` (1–3), `new_competencia` (DateOnly), `new_valor` (money), `new_status` (Prevista 100000000, Descontada 100000001, Cancelada 100000002).

`new_textotermomulta` (Texto do termo): `new_versao`, `new_texto`, `new_tipo` (Termo / Aditivo), `new_vigente` (bool). Seed: versão `v0-placeholder` com marcadores `{motorista}`, `{cpf}`, `{placa}`, `{infracao}`, `{valor}`, `{forma}`, `{parcelas}`.

Em `cr40f_funcionarios`: `new_aditivoassinaturaem` (DateOnly), `new_aditivoassinatura` (arquivo PDF).
Em `cr40f_multas`: `new_valorguia` (money), `new_recursopendente` (bool), `new_termovigente` (lookup new_termomulta).

## Imutabilidade e auditoria

- Plugin pre-operation Update/Delete em `new_termomulta` e `new_parcelamultafolha`: termo Assinado/Contestado não muda nem é excluído, por ninguém; só o próprio plugin escreve (gravações do servidor usam a flag shared variable `termo_server_write`). Exceção: as colunas `new_copiaenviadaem`/`new_copiacanal` e `new_status` da parcela (DP marca Descontada).
- Motorista: sem privilégio de escrita nas tabelas novas; tudo passa pelas Custom APIs (rodam como sistema com o motorista resolvido pelo `DriverResolver.ResolveFromUser`).
- Auditoria do Dataverse ligada na organização (se já não estiver), em `new_termomulta`, `new_parcelamultafolha` e `cr40f_multas`.
- Column security em `new_selfie`, `new_latitude`, `new_longitude`: perfil "Termo de multa - leitura" (gestão de frota e DP).

## Onde fica cada peça

- **Sistema Betinhos:** schema (`provision-termo-multa.ps1`), privilégios, tela do gestor em Frota, tela das parcelas para o DP, flows de cópia e expiração.
- **App Motoristas v2:** tela Multas, Custom APIs e plugin `TermoMultaCommandPlugin` (assembly `Betinhos.DriverRecordSharing`, que já tem `DriverResolver`, push e o padrão de Comunicados), gerador de PDF sem dependências (`MiniPdf`) e SHA-256 (`System.Security.Cryptography`).

## Licenças

Custom API/plugin não exigem premium. O flow de cópia usa Dataverse + Office 365 Outlook (padrão). Não há conector HTTP novo.

## Fora do escopo

OTP, contrato de indicação do Detran, integração com folha externa, PROD (só depois da validação no DEV).
