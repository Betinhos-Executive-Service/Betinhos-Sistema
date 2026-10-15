# CLAUDE.md — Sistema Betinhos

## Publicação (`pnpm push`)

- `pnpm push` (e qualquer publicação equivalente no Dataverse) só pode ser executado a partir da branch `main`, no checkout principal (`Sistema Betinhos`), com `git pull` feito antes.
- Nunca publique a partir de branch de feature, de correção ou de worktree (`.claude/worktrees/*`). Se a branch atual não for `main`, pare e informe; o caminho é abrir PR, fazer o merge e publicar da `main`.
- Após publicar, commite o bump como `build: Sistema Betinhos vX.Y.Z publicado no DEV a partir da main` direto na `main`.
- Nunca dispare dois `pnpm push` em paralelo.
