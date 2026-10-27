from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)

OUT = r"output/pdf/resumo-estudo-tipos-genericos-typescript.pdf"

pdfmetrics.registerFont(TTFont("DejaVu", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("DejaVu-Bold", r"C:\Windows\Fonts\arialbd.ttf"))

NAVY = colors.HexColor("#17324D")
BLUE = colors.HexColor("#2E6F9E")
TEAL = colors.HexColor("#197D78")
INK = colors.HexColor("#24313B")
MUTED = colors.HexColor("#5B6B76")
LIGHT = colors.HexColor("#EEF5F8")
PALE = colors.HexColor("#F7FAFB")
ORANGE = colors.HexColor("#D97925")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverTitle", fontName="DejaVu-Bold", fontSize=28, leading=33, textColor=colors.white, alignment=TA_CENTER, spaceAfter=12))
styles.add(ParagraphStyle(name="CoverSub", fontName="DejaVu", fontSize=13, leading=19, textColor=colors.HexColor("#DCEAF2"), alignment=TA_CENTER))
styles.add(ParagraphStyle(name="H1x", fontName="DejaVu-Bold", fontSize=18, leading=22, textColor=NAVY, spaceBefore=4, spaceAfter=10))
styles.add(ParagraphStyle(name="H2x", fontName="DejaVu-Bold", fontSize=12.5, leading=16, textColor=BLUE, spaceBefore=8, spaceAfter=5))
styles.add(ParagraphStyle(name="Bodyx", fontName="DejaVu", fontSize=9.6, leading=14, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle(name="Smallx", fontName="DejaVu", fontSize=8.2, leading=11, textColor=MUTED, spaceAfter=4))
styles.add(ParagraphStyle(name="Codex", fontName="DejaVu", fontSize=8.2, leading=11.2, textColor=colors.HexColor("#18313E"), backColor=colors.HexColor("#F0F4F6"), borderColor=colors.HexColor("#D6E1E6"), borderWidth=.5, borderPadding=7, leftIndent=4, rightIndent=4, spaceBefore=4, spaceAfter=7))
styles.add(ParagraphStyle(name="Callout", fontName="DejaVu-Bold", fontSize=9.5, leading=13, textColor=TEAL, backColor=colors.HexColor("#E8F5F3"), borderColor=colors.HexColor("#B5DDD7"), borderWidth=.6, borderPadding=8, spaceBefore=5, spaceAfter=8))
styles.add(ParagraphStyle(name="Question", fontName="DejaVu-Bold", fontSize=9.4, leading=13, textColor=NAVY, spaceBefore=5, spaceAfter=3))

def P(text, style="Bodyx"):
    return Paragraph(text, styles[style])

def code(text):
    return P(text.replace("\n", "<br/>"), "Codex")

def header_footer(canvas, doc):
    canvas.saveState()
    w, h = A4
    if doc.page == 1:
        canvas.setFillColor(NAVY)
        canvas.rect(0, 0, w, h, fill=1, stroke=0)
    if doc.page > 1:
        canvas.setStrokeColor(colors.HexColor("#D9E4E9"))
        canvas.line(18*mm, h-15*mm, w-18*mm, h-15*mm)
        canvas.setFont("DejaVu-Bold", 8)
        canvas.setFillColor(NAVY)
        canvas.drawString(18*mm, h-11.5*mm, "RESUMO DE ESTUDO | TIPOS GENÉRICOS")
        canvas.setFont("DejaVu", 8)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(w-18*mm, 11*mm, f"{doc.page}")
    canvas.restoreState()

class Doc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(filename, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=22*mm, bottomMargin=18*mm, title="Resumo de Estudo - Tipos Genéricos em TypeScript")
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="normal")
        self.addPageTemplates([PageTemplate(id="main", frames=frame, onPage=header_footer)])

story = []

# Capa
story += [Spacer(1, 45*mm), P("TIPOS GENÉRICOS", "CoverTitle"), P("Resumo estruturado para estudo da Atividade 2", "CoverSub"), Spacer(1, 18*mm), P("TypeScript • funções • interfaces • classes • inferência", "CoverSub"), PageBreak()]

story += [P("1. Visão geral", "H1x"), P("Tipos genéricos permitem escrever estruturas reutilizáveis sem abrir mão da verificação estática. Em vez de substituir tudo por <b>any</b>, o código usa um parâmetro de tipo - normalmente <b>T</b>, <b>K</b> ou <b>V</b> - que será definido de forma consistente em cada uso.", "Bodyx"),
          P("Objetivos da atividade", "H2x"),
          P("• Aplicar genéricos em funções, interfaces e classes.<br/>• Reutilizar código mantendo segurança de tipos.<br/>• Restringir genéricos com <b>extends</b>.<br/>• Entender inferência de tipos e tuplas.<br/>• Modelar respostas de API com contratos seguros.", "Bodyx"),
          P("Ideia central", "H2x"), P("Um genérico não significa simplesmente 'aceitar qualquer coisa'. Ele cria uma relação entre entradas, saídas e propriedades: o mesmo tipo é preservado e reaproveitado dentro daquela chamada, objeto ou instância.", "Callout"),
          P("2. any x genérico", "H1x"), code("function identidade(valor: any): any {\n  return valor;\n}"), P("Com <b>any</b>, o compilador deixa de proteger o valor. A função aceita qualquer entrada e o retorno perde sua informação de tipo. Isso facilita erros que só aparecem em execução.", "Bodyx"), code("const identidade = <T>(valor: T): T => valor;\n\nconst a = identidade(10);       // number\nconst b = identidade(\"Olá\");   // string\nconst c = identidade(true);     // boolean"), P("Aqui, cada chamada infere seu próprio T. O número retorna como number, o texto como string e o booleano como boolean. A relação entrada-saída é preservada.", "Bodyx"),
          P("Resposta de prova", "H2x"), P("A versão genérica é mais segura porque mantém a checagem estática e conserva o tipo específico recebido. Diferentemente de <b>any</b>, ela não apaga a informação de tipo.", "Callout"), PageBreak()]

story += [P("3. Funções genéricas com arrays", "H1x"), code("function primeiro<T>(lista: T[]): T {\n  return lista[0];\n}"), P("O T aparece em dois lugares: a lista é T[] e o retorno é T. Isso garante que o primeiro elemento tenha o mesmo tipo dos elementos da lista.", "Bodyx"), P("Inferência nas chamadas", "H2x"), code("const x = primeiro([10, 20, 30]);          // number\nconst y = primeiro([\"João\", \"Maria\"]);     // string\nconst z = primeiro([true, false, true]);       // boolean"), P("Também é possível informar o tipo explicitamente quando isso for útil:", "Bodyx"), code("const n = primeiro<number>([10, 20, 30]);"),
          P("4. Interfaces genéricas", "H1x"), code("interface Caixa<T> {\n  valor: T;\n}\n\nconst um: Caixa<number> = { valor: 100 };\nconst dois: Caixa<string> = { valor: \"TypeScript\" };\nconst tres: Caixa<boolean> = { valor: true };"), P("T representa o tipo da propriedade valor em cada especialização. A interface é uma só, mas Caixa<number>, Caixa<string> e Caixa<boolean> são contratos diferentes.", "Bodyx"), P("Erro típico", "H2x"), code("const quatro: Caixa<number> = { valor: \"cem\" }; // erro"), P("A declaração é incorreta: o contrato informa valor: number, mas foi fornecida uma string.", "Bodyx"), PageBreak()]

story += [P("5. Restringindo com extends", "H1x"), code("interface TemNome {\n  nome: string;\n}\n\nfunction exibirNome<T extends TemNome>(objeto: T): void {\n  console.log(objeto.nome);\n}"), P("<b>T extends TemNome</b> exige que T tenha, no mínimo, a propriedade nome: string. As propriedades extras continuam permitidas.", "Bodyx"), code("exibirNome({ nome: \"João\", idade: 20 });\nexibirNome({ nome: \"Maria\", cidade: \"São Paulo\" });\n\nexibirNome({ idade: 30 }); // erro: falta nome"), P("A restrição não diz que o objeto deve conter apenas nome. Ela diz que o objeto precisa cumprir esse requisito mínimo para que a função possa acessar objeto.nome com segurança.", "Callout"),
          P("6. Dois parâmetros genéricos", "H1x"), code("interface Par<K, V> {\n  chave: K;\n  valor: V;\n}\n\nconst um: Par<number, string> = { chave: 1, valor: \"João\" };\nconst dois: Par<string, boolean> = { chave: \"admin\", valor: true };"), P("K define o tipo da chave; V define o tipo do valor. Eles podem ser diferentes e são verificados independentemente.", "Bodyx"), code("const p3: Par<number, string> = {\n  chave: \"ABC\", // erro: deveria ser number\n  valor: \"Maria\"\n};"), PageBreak()]

story += [P("7. Respostas de API", "H1x"), code("interface RespostaApi<T> {\n  sucesso: boolean;\n  dados: T;\n}\n\ninterface Usuario { id: number; nome: string; }\ninterface Produto { codigo: number; descricao: string; }\n\nconst resposta: RespostaApi<Usuario> = {\n  sucesso: true,\n  dados: { id: 1, nome: \"João\" }\n};"), P("O genérico transforma uma resposta comum em um envelope reutilizável. RespostaApi<Usuario> exige dados compatíveis com Usuario; RespostaApi<Produto> exige dados compatíveis com Produto.", "Bodyx"), P("União e interseção", "H2x"), code("type Resultado = { status: \"ok\" | \"nok\" } | { valid: boolean };\n\nconst r1: RespostaApi<Resultado> = {\n  sucesso: true,\n  dados: { status: \"ok\" }\n};\n\nconst r2: RespostaApi<{ status: \"ok\" | \"nok\" } & { valid: boolean }> = {\n  sucesso: true,\n  dados: { status: \"nok\", valid: false }\n};"), P("<b>|</b> (união) aceita uma alternativa ou outra. <b>&</b> (interseção) exige as duas estruturas ao mesmo tempo. Atenção: nomes de propriedades diferenciam maiúsculas e minúsculas; status não é Status.", "Callout"), PageBreak()]

story += [P("8. Classes genéricas", "H1x"), code("class Caixa<T> {\n  private valor: T;\n\n  constructor(valor: T) {\n    this.valor = valor;\n  }\n\n  obterValor(): T {\n    return this.valor;\n  }\n}\n\nconst pessoa = new Caixa<Pessoa>({ nome: \"Ana\", idade: 21 });\nconst produto = new Caixa<Produto>({ codigo: 12, descricao: \"PC\" });\nconst numero = new Caixa<number>(100);"), P("Na classe, T conecta o argumento do construtor ao atributo interno e ao retorno de obterValor(). A mesma classe pode encapsular Pessoa, Produto, number ou outro tipo compatível.", "Bodyx"),
          P("9. Repositório com restrição", "H1x"), code("interface Entidade { id: number; }\n\nclass Repositorio<T extends Entidade> {\n  private dados: T[] = [];\n  adicionar(item: T): void { this.dados.push(item); }\n  listar(): T[] { return this.dados; }\n}"), P("A interface Entidade define o requisito mínimo: todo item precisa ter id: number. Aluno pode ser usado como T se estender Entidade e mantiver id, mesmo possuindo também nome e curso.", "Bodyx"), code("interface Aluno extends Entidade {\n  nome: string;\n  curso: string;\n}\n\nconst alunos = new Repositorio<Aluno>();\nalunos.adicionar({ id: 1, nome: \"João\", curso: \"ADS\" });"), PageBreak()]

story += [P("10. Inferência de tipos", "H1x"), code("function criarPar<T>(valor1: T, valor2: T): T[] {\n  return [valor1, valor2];\n}\n\nconst um = criarPar(10, 20);              // number[]\nconst dois = criarPar(\"João\", \"Maria\");    // string[]\nconst tres = criarPar(true, false);       // boolean[]"), P("O compilador observa os argumentos que ocupam o mesmo parâmetro genérico e escolhe um tipo compatível. Se os argumentos forem diferentes, pode surgir uma união ou um erro, dependendo do contexto e das restrições.", "Bodyx"),
          P("11. Retorno em tupla e closure", "H1x"), code("function criarEstado<T>(valorInicial: T): [() => T, (novoValor: T) => void] {\n  let valor = valorInicial;\n  function obterValor(): T { return valor; }\n  function atualizar(novoValor: T): void { valor = novoValor; }\n  return [obterValor, atualizar];\n}\n\nconst [nome, setNome] = criarEstado(\"Ana\");\nconst [idade, setIdade] = criarEstado(20);"), P("A tupla fixa duas posições e seus tipos: posição 0 é o getter; posição 1 é o setter. O mesmo T conecta o valor inicial, o valor retornado e o valor aceito na atualização.", "Bodyx"), code("nome: () => string\nsetNome: (novoValor: string) => void\nidade: () => number\nsetIdade: (novoValor: number) => void\n\nconsole.log(nome()); // executa o getter e obtém \"Ana\"\nsetNome(\"Ana Silva\");\nconsole.log(nome()); // \"Ana Silva\""), P("Correção importante: nome e setNome não são string. São funções. Por isso nome() é necessário: os parênteses executam o getter e devolvem o valor guardado no closure. Do mesmo modo, setNome(123) seria rejeitado porque T foi inferido como string.", "Callout"), PageBreak()]

story += [P("12. Mapa mental para a prova", "H1x")]
styles.add(ParagraphStyle(name="TableHead", fontName="DejaVu-Bold", fontSize=8.5, leading=11, textColor=colors.white))
data = [[P("Conceito", "TableHead"), P("Pergunta-chave", "TableHead"), P("Resposta curta", "TableHead")],
        [P("T", "Bodyx"), P("O que ele conecta?", "Bodyx"), P("Entradas, saídas e propriedades do mesmo uso.", "Bodyx")],
        [P("any", "Bodyx"), P("Qual o risco?", "Bodyx"), P("Remove a proteção estática e perde precisão.", "Bodyx")],
        [P("extends", "Bodyx"), P("O que garante?", "Bodyx"), P("Uma estrutura mínima obrigatória.", "Bodyx")],
        [P("K, V", "Bodyx"), P("Por que dois tipos?", "Bodyx"), P("Chave e valor podem ter tipos independentes.", "Bodyx")],
        [P("|", "Bodyx"), P("União ou interseção?", "Bodyx"), P("União: uma alternativa; interseção (&): todas.", "Bodyx")],
        [P("Tupla", "Bodyx"), P("Por que usar?", "Bodyx"), P("Posições e tipos fixos, como getter/setter.", "Bodyx")],
        [P("Inferência", "Bodyx"), P("Quem define T?", "Bodyx"), P("O compilador, a partir dos argumentos.", "Bodyx")]]
t = Table(data, colWidths=[29*mm, 48*mm, 98*mm], repeatRows=1)
t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY), ('TEXTCOLOR',(0,0),(-1,0),colors.white), ('GRID',(0,0),(-1,-1),.35,colors.HexColor('#C9D8DE')), ('VALIGN',(0,0),(-1,-1),'TOP'), ('BACKGROUND',(0,1),(-1,-1),PALE), ('ROWBACKGROUNDS',(0,1),(-1,-1),[PALE, colors.white]), ('LEFTPADDING',(0,0),(-1,-1),7), ('RIGHTPADDING',(0,0),(-1,-1),7), ('TOPPADDING',(0,0),(-1,-1),6), ('BOTTOMPADDING',(0,0),(-1,-1),4)]))
story += [t, Spacer(1, 10), P("Checklist final", "H2x"), P("□ Consigo explicar por que any é menos seguro?<br/>□ Sei identificar o tipo inferido em cada chamada?<br/>□ Sei diferenciar união (|) de interseção (&)?<br/>□ Sei explicar o requisito mínimo de T extends Entidade?<br/>□ Sei dizer os tipos exatos de getter e setter numa tupla?", "Bodyx"), P("Material elaborado a partir da Atividade 2 - Tipos Genéricos (documento fornecido), com respostas reorganizadas e correções conceituais da revisão incluída no próprio arquivo.", "Smallx")]

Doc(OUT).build(story)
print(OUT)
