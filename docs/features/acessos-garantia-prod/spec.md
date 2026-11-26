# Garantia de acesso no corte do PROD

## Objetivo
Quando o corte dos acessos rodar no PROD, toda pessoa administrativa continua com acesso a tudo o que tinha nas tabelas da Betinhos, agora pelos perfis, e o Renan segmenta depois. O corte não aplica nada se alguém administrativo perder leitura ou escrita.

## Fora de escopo
- Escrever no PROD. Esta entrega vai até o DEV; o corte no PROD é outra decisão, pelo `corte.json`, com card próprio.
- Mudar o que os motoristas têm (Acesso-Motoristas fica fora do corte, como já é).
- Segmentar quem fica com qual área (é do Renan, depois).

## Definições
- **Pessoa administrativa:** pessoa ativa (sem `applicationid`, `accessmode` 0, fora a conta que roda) que é membro da equipe `Team-Betinhos-MDA` ou tem Administrador do Sistema direto. Calculada pelo corte a cada execução; nenhum id no repositório e nenhuma variável nova.
- **Tabelas da Betinhos:** as de `estado.tabelas` (cr40f_/new_ e as padrão medidas, sem virtual, elastic e de ligação).
- **Fora dos perfis:** lista nova `foraDosPerfis` em `apps/shell/src/nav/acessosMapa.json`, `{ tabela: motivo }`, para tabela que nenhuma pessoa deve ter pelo perfil (ex.: `cr40f_segredo`, legado de IA, tabelas só de plugin/Worker, as do módulo Projetos, que têm o papel `Projetos`).

## Camada 1: cobrir as tabelas
- Toda tabela cr40f_/new_ de `packages/deploy/acessos/tabelas.json` está em algum papel de `perfis.gerado.json` ou em `foraDosPerfis`. Teste novo em `apps/shell/src/nav/acessosMapa.test.ts` (roda no CI) reprova a que não estiver, com o nome dela. Tabela em `foraDosPerfis` e também em perfil reprova.
- Hoje faltam 48. Proposta de área (Assumi; o implementador confirma cada uma pelo consumidor real com `rg` e registra divergência):
  - Operacional: `cr40f_avaliacaoservico`, `cr40f_compromissofds`, `cr40f_escalafds`, `cr40f_provamidia`, `cr40f_linkcadastro`, `cr40f_liberacaoanexo`, `cr40f_appconfigpessoa`, `cr40f_appconfigversao`, `cr40f_fontenoticia`, `new_avisomotorista`, `new_centraldenotificacoes`.
  - Financeiro: `cr40f_anexorecebimento`, `cr40f_cobrancastripe`, `cr40f_fluxocaixa*` (9), `cr40f_geracaopagantesoperacao`, `cr40f_recibopersonalizado`, `cr40f_recibos`, `cr40f_recibos_v2`, `cr40f_sincronizacaofinanceira`.
  - Frota: `cr40f_colisao`, `cr40f_anexocolisao`, `cr40f_anexocolisao_v2`, `new_avaliacaoposto`, `new_postocombustivel`, `new_resumocombustivelmensal`, `new_notamotorista`, `new_textotermomulta`; `cr40f_tipoequipamento` passa de leitura no Base para dona da Frota.
  - RH: `cr40f_jornadacolaborador`.
  - Fora dos perfis: `cr40f_segredo`, `cr40f_codigoacesso`, `cr40f_dispositivoconfiavel`, `cr40f_cielolinkcleanup`, `cr40f_travapublicacao`, `cr40f_conversaiaagendamento`, `cr40f_solicitacaoiaagendamento`, `cr40f_projeto`, `cr40f_projetoetapa`, `cr40f_projetoatualizacao`, `new_inscricaopushmotorista`, `cr40f_reservadeveculos_cr40f_bancodedad`.
- Migration nova `packages/deploy/migrations/AAAAMMDD-HHMM-acessos-perfis-cobertura.ps1` com o hash do gerado novo (migration publicada não se edita). O Deploy aplica no DEV; o PROD recebe pelas soluções.

## Fase 1: preparar (modo `preparar` no `corte.json`)
- Só adiciona; nada sai e a unidade não muda. Cada pessoa administrativa recebe direto o que ainda não tiver: os 4 `Perfil - <Área> - Gestor` (o da Frota comparado pelo papel raiz, para valer a cópia da unidade), o `Perfil - Base` se não for da equipe, os perfis de coluna de mesmo nome e o papel `Projetos`.
- Quem está em `ACESSOS_ADMINS_MANTER` também recebe (para o dia em que o admin sair).
- A foto (versão 3) guarda só o que foi adicionado. O `desfazer` retira exatamente isso; o que a pessoa já tinha antes não sai. Fotos versão 1 e 2 continuam desfazíveis.

## Fase 2: cortar (modo `cortar`, já existente, com trava nova)
- O Renan tira uma pessoa por vez; cada retirada passa pela trava.
- Para pessoa administrativa, perda de Read, Create, Write, Append ou AppendTo em tabela da Betinhos fora de `foraDosPerfis` trava, usada ou não nos últimos 90 dias. Perda de profundidade conta (Global → Local trava, por causa da unidade Frota). Perda de Delete, Assign e Share vai para o informativo.
- Dono de connection reference entra na trava de flows.
- A trava das outras pessoas continua a de hoje. Resumo público só com contagens, sem id nem nome.

## Cenários de aceite
1. Tabela nova cr40f_ sem perfil e sem `foraDosPerfis` → o teste do mapa reprova no CI com o nome dela.
2. No DEV, `preparar` → o plano lista os perfis a adicionar e nada a retirar.
3. Tirar um perfil do gerado em simulação (teste unitário) → trava de pessoa administrativa com a tabela perdida.
4. No DEV, depois do `preparar` → as pessoas administrativas têm os 4 Gestores e leem e gravam numa tabela de cada área (`prova.mjs`); motorista e usuário de aplicação sem mudança.
5. No DEV, `desfazer` → os adicionados saem; o que já existia antes continua.
6. Foto versão 2 antiga → o desfazer continua funcionando (teste).

## Irreversível
Nada: corte e desfazer são simétricos e provados no DEV. O PROD não é tocado.
