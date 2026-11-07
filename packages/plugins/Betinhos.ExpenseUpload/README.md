# Betinhos.ExpenseUpload

Plugin de upload de despesas, vindo do app-motoristas-v2. **Congelado**: compila e testa no CI, mas nao entra no Deploy, nem
em `pendentes-dev.ps1`, nem no caminho de plugin do PROD.

- Assembly `Betinhos.ExpenseUpload` 1.0.0.0, public key token publicado `5589cd11f85ade0e` (iguais no DEV e no PROD).
- A chave de assinatura original nao foi encontrada. **Nao gere outra**: uma chave nova muda o token e o Dataverse trata o
  resultado como outro assembly.
- Uma chave nova exige registrar um assembly novo (e migrar os steps), nao atualizar o existente.
- O CSProj aponta para `%UserProfile%\.codex\keys\Betinhos.ExpenseUpload.snk`; no CI e local os testes rodam com `-p:SignAssembly=false`.
