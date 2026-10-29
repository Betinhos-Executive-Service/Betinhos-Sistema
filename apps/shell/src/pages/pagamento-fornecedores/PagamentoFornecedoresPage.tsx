import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-600.css'
import '@fontsource/manrope/latin-700.css'
import '@fontsource/manrope/latin-800.css'
import './styles.css'
import { useEffect } from 'react'
import { setErrorLogContext } from '@betinhos/ui/error-logger'
import App from './App'

// Tela Pagamento de Fornecedores (antigo WebResource cr40f_TelaPagamentoFornecedores.html) copiada inteira do repo
// tela-pagamento-de-fornecedor. O CSS dela vale só dentro de `.pf-root`, para não vazar para o resto do shell.
// A versão exibida é a do shell (o selo de versão próprio da tela ficava por cima do dele).
export function PagamentoFornecedoresPage() {
  // A tela grava a aba no contexto do logger (`screen`), que vence o getScreen do shell: ao sair, limpa para os
  // erros das outras telas não saírem com a aba daqui.
  useEffect(() => () => setErrorLogContext({ screen: '' }), [])
  return (
    <div className="pf-root">
      <App />
    </div>
  )
}
