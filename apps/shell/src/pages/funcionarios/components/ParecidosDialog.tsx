import { Button, Dialog } from '@betinhos/ui'
import type { FuncionarioParecido } from '../data/parecidos'

const MOTIVO: Record<FuncionarioParecido['motivos'][number], string> = { nome: 'mesmo nome', celular: 'mesmo celular', cpf: 'mesmo CPF' }

type Props = { parecidos: FuncionarioParecido[] | null; onUsar: (id: string) => void; onCriarNovo: () => void; onCancelar: () => void }

/** Cadastro sem ficha: mostra quem pode ser a mesma pessoa antes de criar conta e ficha. */
export function ParecidosDialog({ parecidos, onUsar, onCriarNovo, onCancelar }: Props) {
  return (
    <Dialog open={parecidos !== null} onClose={onCancelar} title="Já existe um funcionário parecido"
      actions={<><Button variant="secondary" onClick={onCancelar}>Cancelar</Button><Button variant="secondary" onClick={onCriarNovo}>Criar ficha nova</Button></>}>
      <p>{parecidos?.length ? 'Confira se é a mesma pessoa. Usar a ficha existente evita cadastro duplicado.' : 'O sistema achou um cadastro parecido que você não consegue ver. Procure a ficha na lista ou crie uma ficha nova se for outra pessoa.'}</p>
      <ul className="acesso-parecidos">
        {parecidos?.map((p) => (
          <li key={p.id} className="acesso-parecido">
            <div className="acesso-parecido__dados">
              <strong>{p.nome}</strong>
              <span className="muted">{[p.funcao, p.status, p.celular, p.cpf && `CPF ${p.cpf}`].filter(Boolean).join(' · ')}</span>
              <span className="muted">{p.motivos.map((m) => MOTIVO[m]).join(', ')} · {p.temAcesso ? 'já tem acesso ao app' : 'sem acesso ao app'}</span>
              {p.temAcesso && <span className="acesso-parecido__nota">Já tem acesso. Use Reativar ou Encerrar na ficha.</span>}
            </div>
            <Button size="compact" disabled={p.temAcesso} aria-label={`Usar a ficha de ${p.nome}`} onClick={() => onUsar(p.id)}>Usar esta ficha</Button>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
