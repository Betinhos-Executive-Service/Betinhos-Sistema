import 'react'

// O Planner passa cores dinâmicas por propriedade CSS customizada (`--personal-tag-color` etc.).
declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined
  }
}
