# Adaptador Worker (parte 3) — contrato

Ainda não implementado. Atende só o parceiro esporádico que abre o link do repasse (sem login no Dynamics).
Motoristas Betinhos e terceiros fixos continuam no web resource com o adaptador Dataverse.

- Implementa `PortaDados` (`src/data/porta.ts`): uma rota HTTP por operação, mesmo payload e retorno da função Dataverse equivalente.
- Toda chamada leva o token do link; o Worker valida token + serviço + operação (Custom API `new_ProcessarRepasse`) antes de tocar o Dataverse.
- Operações fora do contrato não existem no Worker: o parceiro não consegue consultar tabelas livremente.
- Telas liberadas: `FEATURES` com `liberadoLink: true` em `src/app/features.ts`.
