import quotes1 from './realQuotes1'
import quotes2 from './realQuotes2'
import quotes3 from './realQuotes3'
import quotes4 from './realQuotes4'
import quotes5 from './realQuotes5'

export type DailyMessage = { text: string; author?: string; source?: string }

const allQuotes: DailyMessage[] = [...quotes1, ...quotes2, ...quotes3, ...quotes4, ...quotes5]
const offThemePattern = /amor|amante|paix[aã]o|casamento|namor|beijo|cora[cç][aã]o|filho|fam[ií]lia|Deus|Senhor|ora[cç][aã]o|igreja|f[eé]|alma|saudade|relacionamento|amigo/i
const motivationalAdditions: DailyMessage[] = [
  { text: 'Comece pelo próximo passo possível e deixe a constância cuidar do restante.' },
  { text: 'A disciplina transforma intenção em resultado quando a motivação oscila.' },
  { text: 'Um erro analisado com honestidade se torna uma instrução para a próxima tentativa.' },
  { text: 'Foco é escolher o que merece sua energia e proteger essa escolha.' },
  { text: 'Grandes resultados costumam nascer de pequenas ações repetidas sem alarde.' },
  { text: 'A coragem não elimina a dúvida; ela permite agir apesar dela.' },
  { text: 'Planejar o essencial reduz a ansiedade e aumenta a qualidade da execução.' },
  { text: 'Quando o caminho parecer longo, concentre-se na etapa que está diante de você.' },
  { text: 'A persistência fica mais forte quando aprende com cada tentativa.' },
  { text: 'Faça hoje algo que facilite o trabalho de quem você será amanhã.' },
  { text: 'A clareza melhora quando você troca pressa por atenção.' },
  { text: 'Seu progresso não precisa ser barulhento para ser verdadeiro.' },
  { text: 'A preparação cria confiança antes mesmo de o desafio começar.' },
  { text: 'O compromisso diário vale mais do que uma promessa feita apenas nos dias fáceis.' },
  { text: 'Revisar a rota não é desistir; é usar melhor a experiência acumulada.' },
  { text: 'A qualidade aparece quando o cuidado continua depois que ninguém está olhando.' },
  { text: 'Aprender algo novo é aceitar que o começo será menor que o objetivo.' },
  { text: 'A organização devolve tempo para as decisões que realmente importam.' },
  { text: 'A melhor resposta para um desafio é uma ação pequena, concreta e consistente.' },
  { text: 'Não confunda velocidade com avanço; direção também faz parte do progresso.' },
  { text: 'Uma rotina simples, mantida por tempo suficiente, pode mudar seu nível de resultado.' },
  { text: 'A responsabilidade começa quando você assume o que está ao seu alcance.' },
  { text: 'O desconforto de praticar hoje prepara a tranquilidade de dominar amanhã.' },
  { text: 'Escolher prioridades é dizer não ao ruído para dizer sim ao que constrói.' },
  { text: 'A confiança cresce quando suas ações confirmam suas palavras.' },
  { text: 'A concentração melhora quando cada tarefa recebe seu próprio momento.' },
  { text: 'Não espere condições perfeitas para fazer um trabalho importante.' },
  { text: 'A experiência se acumula toda vez que você termina o que começou.' },
  { text: 'Uma decisão difícil fica mais leve quando seus critérios estão claros.' },
  { text: 'O esforço de hoje pode ser a vantagem silenciosa que aparecerá depois.' },
  { text: 'A humildade acelera o aprendizado porque permite enxergar o que falta.' },
  { text: 'Quando você mede o que importa, fica mais fácil melhorar o que importa.' },
  { text: 'A consistência protege seus objetivos das variações de humor.' },
  { text: 'Um ambiente organizado ajuda a mente a trabalhar com mais precisão.' },
  { text: 'A coragem de pedir orientação economiza tempo e evita erros repetidos.' },
  { text: 'O melhor momento para retomar um plano é aquele em que você percebeu a pausa.' },
  { text: 'Toda habilidade sólida começou como uma tarefa que ainda parecia difícil.' },
  { text: 'A atenção aos detalhes é uma forma prática de respeitar o resultado.' },
  { text: 'Persistir não é repetir cegamente; é ajustar e continuar.' },
  { text: 'Um objetivo grande fica administrável quando recebe uma ação para hoje.' },
  { text: 'O hábito de concluir pequenas tarefas fortalece a capacidade de enfrentar as grandes.' },
  { text: 'A serenidade ajuda você a escolher uma resposta melhor que o impulso.' },
  { text: 'A evolução começa quando comparar-se menos abre espaço para praticar mais.' },
  { text: 'O trabalho bem-feito é uma soma de escolhas corretas em momentos comuns.' },
  { text: 'Você não precisa resolver tudo agora; precisa avançar com o que já sabe.' },
  { text: 'A prática deliberada transforma uma dificuldade conhecida em uma competência confiável.' },
  { text: 'O que parece lento hoje pode estar construindo uma base que durará anos.' },
  { text: 'A melhor forma de ganhar clareza é colocar as ideias em ordem e começar.' },
  { text: 'Um limite bem definido protege sua energia para o que tem maior impacto.' },
  { text: 'A firmeza aparece quando você mantém o padrão mesmo sob pressão.' },
  { text: 'Não deixe uma tarefa imperfeita impedir a primeira versão necessária.' },
  { text: 'Cada revisão cuidadosa aproxima o trabalho do resultado que você pretende entregar.' },
  { text: 'O conhecimento se torna força quando encontra uma aplicação concreta.' },
  { text: 'A melhor maneira de vencer a dúvida é testar uma hipótese com responsabilidade.' },
  { text: 'A disciplina de terminar cria espaço mental para começar melhor.' },
  { text: 'O progresso é mais confiável quando pode ser repetido amanhã.' },
  { text: 'Uma agenda realista respeita seus limites e aumenta sua capacidade de cumprir.' },
  { text: 'A atenção plena reduz retrabalho porque enxerga o problema antes que ele cresça.' },
  { text: 'Quando a tarefa é grande, reduza o tamanho do passo, não a importância do objetivo.' },
  { text: 'O que você pratica em silêncio aparece na qualidade que entrega em público.' },
  { text: 'A maturidade profissional é fazer o necessário mesmo quando não é a parte mais interessante.' },
  { text: 'A cada obstáculo, procure primeiro a informação que ainda está faltando.' },
  { text: 'A energia melhora quando o dia começa com uma prioridade claramente escolhida.' },
  { text: 'Uma pausa consciente pode proteger horas de trabalho mal direcionado.' },
  { text: 'A constância torna possível confiar no próprio processo.' },
  { text: 'O resultado melhora quando a pergunta certa vem antes da solução rápida.' },
  { text: 'A determinação é construída nas decisões pequenas que ninguém aplaude.' },
  { text: 'Aprender com um resultado abaixo do esperado é avançar com dados melhores.' },
  { text: 'A simplicidade aparece quando cada parte tem uma função clara.' },
  { text: 'O primeiro passo não precisa provar tudo; precisa abrir caminho para o segundo.' },
  { text: 'A precisão nasce de hábitos, não de sorte.' },
  { text: 'Um compromisso bem escolhido vale mais que dez intenções esquecidas.' },
  { text: 'A resiliência cresce quando você transforma pressão em prioridade.' },
  { text: 'O trabalho consistente reduz a distância entre o que você sabe e o que consegue fazer.' },
  { text: 'A melhor comparação é com o ponto em que você estava antes de começar a praticar.' },
  { text: 'A responsabilidade por uma escolha também traz o poder de ajustá-la.' },
  { text: 'O foco fica mais fácil quando o próximo resultado está bem definido.' },
  { text: 'Toda melhora mensurável começou com uma decisão de observar melhor.' },
  { text: 'A perseverança é inteligência aplicada depois que o entusiasmo passa.' },
  { text: 'O avanço de hoje não precisa ser enorme; precisa ser real e repetível.' },
  { text: 'A ação consistente transforma planos modestos em resultados sólidos.' },
  { text: 'Dê atenção ao próximo passo e mantenha a direção ao longo do caminho.' },
  { text: 'O esforço bem direcionado de hoje amplia suas possibilidades de amanhã.' }
]

const realQuotes = allQuotes.filter(item => !offThemePattern.test(item.text))
export const dailyMessages: DailyMessage[] = [...realQuotes, ...motivationalAdditions]

const uniqueMessageCount = new Set(dailyMessages.map(item => item.text)).size
if (dailyMessages.length !== 365 || uniqueMessageCount !== 365 || dailyMessages.some(item => item.text.includes('Observe o que funciona'))) {
  throw new Error(`A fonte local precisa conter 365 mensagens individuais e únicas (total: ${dailyMessages.length}, únicas: ${uniqueMessageCount}).`)
}

const saoPauloDayKey = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date())

export const getDailyMessageIndex = (dayKey = saoPauloDayKey()) => {
  const date = new Date(`${dayKey}T00:00:00Z`)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.floor((date.getTime() - yearStart.getTime()) / 86400000) % dailyMessages.length
}

export const getDailyMessage = () => {
  const dayKey = saoPauloDayKey()
  const defaultIndex = getDailyMessageIndex(dayKey)
  try {
    const saved = JSON.parse(localStorage.getItem('betinhos-daily-message') || 'null') as { dayKey?: string; index?: number } | null
    if (saved?.dayKey === dayKey && Number.isInteger(saved.index) && saved.index! >= 0 && saved.index! < dailyMessages.length) return { dayKey, index: saved.index! }
  } catch { /* localStorage pode estar indisponível no host do Dataverse. */ }
  return { dayKey, index: defaultIndex }
}

export const rotateDailyMessage = (dayKey: string, currentIndex: number) => {
  const index = (currentIndex + 1) % dailyMessages.length
  try { localStorage.setItem('betinhos-daily-message', JSON.stringify({ dayKey, index })) } catch { /* fallback mantém a troca apenas no estado React. */ }
  return index
}
