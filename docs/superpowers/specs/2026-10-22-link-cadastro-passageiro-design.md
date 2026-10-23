# Link de cadastro do passageiro (foto, telefone, e-mail)

Data: 22/10/2026 · Status: spec aprovada nas decisões de negócio, aguardando plano de implementação.

## Objetivo

A operação gera, no Formulário Geral, um link público para a solicitante preencher **foto, telefone e e-mail** dos passageiros de um serviço. Ao abrir o link, a solicitante não precisa de login. O motorista vê a foto no App Motoristas.

## Decisões (Renan, 22/10/2026)

| Tema | Decisão |
|---|---|
| Validade | 36 horas a partir da geração |
| Sobrescrita | Permitida. Ao gerar, quem gerou recebe um aviso de que o passageiro já tem foto, telefone ou e-mail e vê esses dados antes de enviar o link |
| Envio automático | Fora de escopo agora (pode vir no futuro). O envio é manual: copiar ou compartilhar |
| Abrangência | Qualquer tipo de serviço |
| LGPD/aceite | Sem tela de aceite |
| Hospedagem | Página estática no Cloudflare Pages + Worker + flow HTTP |

## Escopo

1. **Dois modos de link**
   - *Por passageiro*: o link mostra só aquele passageiro.
   - *Por serviço*: o link mostra todos os passageiros do serviço (`cr40f_servicosporpassageiro`, com fallback para os lookups `passageiro1..4`).
2. **Geração no Formulário Geral** (shell, `apps/shell/src/pages/geral`): ação "Link de cadastro" no serviço e no item de passageiro. Antes de mostrar o link, o painel exibe para cada passageiro os dados atuais (foto, telefone e e-mail) e o aviso "será possível sobrescrever". Ações: Copiar e Compartilhar (WhatsApp `wa.me` sem número fixo).
3. **Registro do link**: tabela nova `cr40f_linkcadastro` com os campos serviço, passageiro (opcional), token (≥ 32 bytes aleatórios, só o hash SHA-256 fica gravado), expira em (+36 h), status (Ativo, Usado parcialmente, Expirado, Revogado), gerado por e último uso. A geração passa por uma Custom API, seguindo o padrão de `new_LinkJson` / `parseLinkJson` em `geral/domain/link.ts`.
4. **Página pública estática** (app novo `apps/cadastro-passageiro`, Vite, mobile-first, Design System Betinhos e versão de build no canto):
   - Lê o token da URL (`#t=` no fragmento, para o token não ir a logs de servidor).
   - GET no flow → nomes e primeiro nome dos passageiros, a data do serviço e se já existe foto (sem mostrar dados atuais à solicitante).
   - Por passageiro: foto (câmera ou galeria, comprimida no navegador para ≤ 1600 px em JPEG ≈ 80%, com HEIC convertido via canvas quando o navegador suportar), telefone (máscara BR e +DDI) e e-mail. Salvamento por passageiro, que permite preencher em etapas.
   - Estados: carregando, link expirado ou inválido, enviado com sucesso e erro com nova tentativa.
5. **Flow HTTP "Cadastro de passageiro – link público"** (solução BetinhosAutomacao):
   - Valida o hash do token, a validade, o status e se o passageiro pertence ao serviço do link.
   - Grava a foto no SharePoint (biblioteca de passageiros, nome `<passageiroid>.jpg`) e atualiza `new_linkdafoto`, o telefone e o e-mail do passageiro.
   - Atualiza o último uso no link. Responde só com códigos genéricos (400/410/500), sem vazar detalhes.
6. **Motorista**: a foto aparece grande no card e no detalhe do serviço do App Motoristas (toque para ampliar). Sem foto, aparece a inicial. O app já lê `new_linkdafoto`; falta só a exibição.

## Riscos e mitigação

- **Hospedagem: Cloudflare (decisão 22/10/2026)**. Cloudflare Pages para a página e um Worker na mesma origem (`/api/*`). O Worker guarda como secret a URL do flow (assinatura SAS); assim, a assinatura nunca chega ao navegador. Ele também aplica limite de taxa por IP e por token, valida o tamanho do payload (foto ≤ 3 MB após compressão, até 30 envios por token) e repassa a requisição ao flow. Domínio sugerido: `cadastro.betinhos.com.br`, se o DNS do domínio estiver no Cloudflare; caso contrário, `*.pages.dev`. É o primeiro uso do Cloudflare no repo, e o deploy usa `wrangler` com a conta e o token da Betinhos.
- **Acesso à foto pelo motorista**: a URL do SharePoint exige permissão. Confirmar se o App Motoristas exibe via link de compartilhamento ou via proxy; decidir no plano.

## Verificação

- Link expirado (> 36 h), revogado, token adulterado e passageiro que não pertence ao serviço retornam erro amigável.
- Passageiro removido do serviço depois da geração some do link.
- Foto grande, HEIC, retrato ou paisagem; telefone com e sem DDI; e-mail inválido bloqueado no cliente e no flow.
- Preenchimento em duas etapas no mesmo link.
- Aviso de sobrescrita aparece ao gerar quando o passageiro já tem dados.
- A foto aparece no App Motoristas no 4G (teste no dispositivo).
- Camadas: testes unitários (token, validação, compressão), mock local da página, flow no DEV e uso autenticado no App Motoristas.

## Fora de escopo

Envio automático (WhatsApp/e-mail), lembretes, tela de aceite LGPD, edição de outros campos do passageiro.
