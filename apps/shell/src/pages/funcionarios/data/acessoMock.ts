import type { AcessoSource, CadastroResultado, Etapa, ReativacaoResultado } from './acesso'
import { AcessoError, MENSAGENS } from './acesso'
import { normalizeSearch as semAcentos } from './format'

const delay = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))
const MOCK_FUNCIONARIOS: Record<string, { nome: string; email: string | null }> = { m1: { nome: 'Carlos Alberto Teste', email: 'carlos.teste@betinhos.onmicrosoft.com' }, m7: { nome: 'Helena Simulada Costa', email: null }, m9: { nome: 'Joana Encerrada Teste', email: 'joana.teste@betinhos.onmicrosoft.com' } }

/** Simulação em memória: nome com "Erro Graph" falha depois de criar o usuário; "Sem Licenca" falha antes. */
export function createAcessoMock(): AcessoSource {
  const emails = new Set<string>()
  return {
    async cadastrar(input) {
      const palavras = semAcentos(input.nomeCompleto.trim()).split(/\s+/).filter(Boolean)
      if (palavras.length < 2) throw new AcessoError('NOME_INVALIDO', MENSAGENS.NOME_INVALIDO, [])
      if (input.celular.replace(/\D/g, '').length !== 11) throw new AcessoError('CELULAR_INVALIDO', MENSAGENS.CELULAR_INVALIDO, [])
      if (/sem licenca/i.test(semAcentos(input.nomeCompleto))) throw new AcessoError('SEM_LICENCA_DISPONIVEL', MENSAGENS.SEM_LICENCA_DISPONIVEL, [{ etapa: 'validacao', estado: 'feita', detalhe: 'ok' }, { etapa: 'usuario', estado: 'erro', detalhe: 'sem licença' }])
      const prefixo = input.prefixoEmail ? semAcentos(input.prefixoEmail).replace(/\s+/g, '.') : `${palavras[0]}.${palavras[palavras.length - 1]}`
      let email = `${prefixo}@betinhos.onmicrosoft.com`
      for (let n = 2; emails.has(email); n++) email = `${prefixo}${n}@betinhos.onmicrosoft.com`
      if (/erro graph/i.test(input.nomeCompleto)) {
        throw new AcessoError('GRAPH_INDISPONIVEL', MENSAGENS.GRAPH_INDISPONIVEL, [{ etapa: 'validacao', estado: 'feita', detalhe: 'ok' }, { etapa: 'email', estado: 'feita', detalhe: email }, { etapa: 'usuario', estado: 'feita', detalhe: 'criado' }, { etapa: 'licenca', estado: 'erro', detalhe: '503 em POST assignLicense' }])
      }
      emails.add(email)
      const resultado: CadastroResultado = {
        emailMicrosoft: email, senhaTemporaria: 'Kx7#mQ2vR9pL4w', // Atalho do mock: sem funcionarioId, devolve 'm7' (Helena, linha existente no mock de funcionários) para "Abrir ficha" abrir um registro real.
        funcionarioId: input.funcionarioId ?? 'm7', linkApp: 'https://org23b93544.crm2.dynamics.com/WebResources/new_app-motoristas-v2',
        etapas: [{ etapa: 'validacao', estado: 'feita', detalhe: 'ok' }, { etapa: 'email', estado: 'feita', detalhe: email }, { etapa: 'usuario', estado: 'feita', detalhe: 'criado' }, { etapa: 'licenca', estado: 'feita', detalhe: 'atribuída' }, { etapa: 'grupo', estado: 'feita', detalhe: 'adicionado' }, { etapa: 'systemuser', estado: 'feita', detalhe: 'criado no Dataverse' }, { etapa: 'funcionario', estado: 'feita', detalhe: input.funcionarioId ? 'e-mail vinculado' : 'criado' }],
      }
      return delay(resultado)
    },
    async encerrar(funcionarioId, confirmacao) {
      const f = MOCK_FUNCIONARIOS[funcionarioId] ?? { nome: 'Funcionário Mock', email: 'x@betinhos.onmicrosoft.com' }
      if (!f.email) throw new AcessoError('FUNCIONARIO_SEM_EMAIL', MENSAGENS.FUNCIONARIO_SEM_EMAIL, [])
      if (semAcentos(confirmacao.trim()) !== semAcentos(f.nome.split(/\s+/)[0])) throw new AcessoError('CONFIRMACAO_INVALIDA', MENSAGENS.CONFIRMACAO_INVALIDA, [])
      const etapas: Etapa[] = [{ etapa: 'confirmacao', estado: 'feita', detalhe: 'ok' }, { etapa: 'licenca', estado: 'feita', detalhe: 'removida' }, { etapa: 'conta', estado: 'feita', detalhe: 'desativada' }, { etapa: 'grupo', estado: 'feita', detalhe: 'removido' }]
      return delay(etapas)
    },
    async reativar(funcionarioId) {
      const f = MOCK_FUNCIONARIOS[funcionarioId] ?? { nome: 'Funcionário Mock', email: 'x@betinhos.onmicrosoft.com' }
      if (!f.email) throw new AcessoError('FUNCIONARIO_SEM_EMAIL', MENSAGENS.FUNCIONARIO_SEM_EMAIL, [])
      const resultado: ReativacaoResultado = {
        emailMicrosoft: f.email, senhaTemporaria: 'Rz4!tW8nQ2kM6p', linkApp: 'https://org23b93544.crm2.dynamics.com/WebResources/new_app-motoristas-v2',
        etapas: [{ etapa: 'usuario', estado: 'feita', detalhe: 'encontrado' }, { etapa: 'conta', estado: 'feita', detalhe: 'reativada' }, { etapa: 'licenca', estado: 'feita', detalhe: 'atribuída' }, { etapa: 'grupo', estado: 'feita', detalhe: 'adicionado' }, { etapa: 'systemuser', estado: 'feita', detalhe: 'sincronizado pelo Power Platform' }, { etapa: 'senha', estado: 'feita', detalhe: 'redefinida' }],
      }
      return delay(resultado)
    },
  }
}
