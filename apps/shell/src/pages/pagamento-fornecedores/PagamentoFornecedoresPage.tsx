import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-600.css'
import '@fontsource/manrope/latin-700.css'
import '@fontsource/manrope/latin-800.css'
import './styles.css'
import App from './App'
import { APP_VERSION_LABEL } from './build-info'

// Tela Pagamento de Fornecedores (antigo WebResource cr40f_TelaPagamentoFornecedores.html) copiada inteira do repo
// tela-pagamento-de-fornecedor. O CSS dela vale só dentro de `.pf-root`, para não vazar para o resto do shell.
export function PagamentoFornecedoresPage() {
  return (
    <div className="pf-root">
      <App />
      <small className="app-version" aria-label={`Versão do app ${APP_VERSION_LABEL}`}>
        {APP_VERSION_LABEL}
      </small>
    </div>
  )
}
