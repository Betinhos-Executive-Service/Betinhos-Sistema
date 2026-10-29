import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { FiltroVeiculos, filtroValorId, type EstadoVeiculos } from "./FiltroVeiculos";
import type { OpcoesFiltro, VeiculoFiltro } from "../domain/filtroVeiculo";
import { CHECKLIST_PROBLEMAS_PADRAO, type ChecklistItemTipo } from "../domain/checklists";
import {
  adicionarProblemas,
  descreverErro,
  errosModelo,
  itemChave,
  itemDePronto,
  ITENS_PRONTOS,
  MAX_OPCOES_PROBLEMA,
  MAX_OPCAO_PROBLEMA,
  moverItem,
  normalizarRotulo,
  novoItem,
  obrigatorioPadrao,
  opcoesProblemaEfetivas,
  opcoesProblemaLista,
  plural,
  prontoNoModelo,
  resumoErros,
  type ErroModelo,
  type Modelo,
  type ModeloItem,
  type UsoModelo
} from "../domain/gestaoChecklists";

export const TIPOS: { id: ChecklistItemTipo; label: string; icon: IconName; descricao: string }[] = [
  { id: "foto", label: "Foto", icon: "camera", descricao: "O motorista tira uma foto. Ex.: frente do veículo." },
  { id: "okNok", label: "OK / Não OK", icon: "check", descricao: "Confere se está tudo certo; se não, marca o problema." },
  { id: "numero", label: "Número", icon: "hash", descricao: "Um valor, como quilometragem ou nível do tanque." },
  { id: "texto", label: "Texto", icon: "text", descricao: "Resposta livre, como observações." }
];
const tipoInfo = (tipo: ChecklistItemTipo) => TIPOS.find((entry) => entry.id === tipo) ?? TIPOS[0];

export type StatusSalvar = { tom: "neutro" | "aviso" | "salvando" | "sucesso" | "erro"; texto: string };

type Props = {
  modelo: Modelo;
  /** O que está gravado (null para modelo ainda não criado). */
  original: Modelo | null;
  padraoAtual: Modelo | null;
  busy: boolean;
  dirty: boolean;
  /** Salvar habilitado: alteração pendente ou falha anterior (para tentar de novo). */
  podeSalvar: boolean;
  status: StatusSalvar;
  mostrarErros: boolean;
  /** Muda a cada Salvar recusado pela validação: leva o usuário ao primeiro erro. */
  pedidoErro: number;
  uso: UsoModelo | null | "erro";
  /** Prévia do filtro: modelos gravados, veículos do universo da rotina e opções das choices. */
  filtro: { outros: Modelo[]; veiculos: VeiculoFiltro[]; opcoes: OpcoesFiltro; estado: EstadoVeiculos; onTentar: () => void };
  onChange: (change: Partial<Modelo>) => void;
  onItens: (itens: ModeloItem[]) => void;
  onPedirPadrao: () => void;
  onPedirRemover: (uid: string, voltarFoco: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

type Painel = "" | "tipos" | "prontos";
type FocoMover = { uid: string; onde: "alca" | "subir" | "descer" };
type Arraste = { uid: string; from: number; to: number; startY: number; scrollStart: number; rows: HTMLElement[]; rects: DOMRect[]; passo: number };

const reduzMovimento = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const campoId = (uid: string, campo: string) => `mod-item-${uid}-${campo}`;

export function ModeloEditor(props: Props) {
  const { modelo, original, padraoAtual, busy, dirty, podeSalvar, status, mostrarErros, pedidoErro, uso, filtro, onChange, onItens, onPedirPadrao, onPedirRemover, onCancel, onSave } = props;
  const [aberto, setAberto] = useState("");
  const [painel, setPainel] = useState<Painel>("");
  const [anuncio, setAnuncio] = useState("");
  const [foco, setFoco] = useState<{ id: string; bloco: ScrollLogicalPosition } | null>(null);
  const [previa, setPrevia] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const arraste = useRef<Arraste | null>(null);
  const flip = useRef<Map<string, number> | null>(null);
  const focoMover = useRef<FocoMover | null>(null);

  const erros = useMemo(() => mostrarErros ? errosModelo(modelo, original) : [], [mostrarErros, modelo, original]);
  const errosCampo = (campo: string) => erros.find((erro) => erro.alvo === "modelo" && erro.campo === campo)?.mensagem ?? "";
  const eraPadrao = Boolean(original?.id && original.ativo && original.padraoQuinzenal);
  const substitui = modelo.padraoQuinzenal && padraoAtual && padraoAtual.id !== modelo.id ? padraoAtual.nome : "";
  const usoTotal = uso && uso !== "erro" ? uso.total : null;
  const originais = useMemo(() => new Map((original?.itens ?? []).filter((item) => item.id).map((item) => [item.id, item])), [original]);

  // Leva o foco (e a rolagem) ao campo pedido depois que o painel do item já está na tela.
  useEffect(() => {
    if (!foco) return;
    const el = document.getElementById(foco.id);
    el?.scrollIntoView({ block: foco.bloco, behavior: reduzMovimento() ? "auto" : "smooth" });
    el?.focus({ preventScroll: true });
    setFoco(null);
  }, [foco]);

  const irPara = (erro: ErroModelo) => {
    if (erro.alvo === "item") {
      setAberto(erro.uid);
      setFoco({ id: campoId(erro.uid, erro.campo), bloco: "center" });
      return;
    }
    if (erro.campo === "filtro") { setFoco({ id: erro.condicao == null ? "mod-filtro-add" : filtroValorId(erro.condicao), bloco: "center" }); return; }
    setFoco({ id: erro.campo === "nome" ? "mod-nome" : erro.campo === "periodicidade" ? "mod-periodo" : erro.campo === "padrao" ? "mod-padrao" : "mod-add-item", bloco: "center" });
  };

  // Modelo novo (ou cópia): o cursor já começa no nome.
  useEffect(() => { if (!original?.id) document.getElementById("mod-nome")?.focus({ preventScroll: true }); }, []);

  // Tentativa de salvar com erro: leva ao primeiro erro e anuncia o resumo uma vez (não a cada tecla).
  useEffect(() => {
    if (!pedidoErro) return;
    const todos = errosModelo(modelo, original);
    if (!todos.length) return;
    setAnuncio(`${resumoErros(todos)}. ${descreverErro(todos[0], modelo)}`);
    irPara(todos[0]);
  }, [pedidoErro]);

  // Depois de mover: anima (só ação de ponteiro) e devolve o foco à alça ou à seta do item movido, pelo uid.
  useLayoutEffect(() => {
    const antigas = flip.current;
    flip.current = null;
    const alvo = focoMover.current;
    focoMover.current = null;
    if (alvo) {
      const linha = listRef.current?.querySelector<HTMLElement>(`:scope > [data-uid="${CSS.escape(alvo.uid)}"]`);
      const visivel = (el: HTMLElement) => !(el as HTMLButtonElement).disabled && el.offsetParent !== null;
      const setas = (nome: string) => Array.from(linha?.querySelectorAll<HTMLElement>(`[data-seta="${nome}"]`) ?? []).filter(visivel);
      const destino = alvo.onde === "alca" ? linha?.querySelector<HTMLElement>(".mod-handle")
        : setas(alvo.onde)[0] ?? setas(alvo.onde === "subir" ? "descer" : "subir")[0];
      destino?.focus({ preventScroll: true });
      destino?.scrollIntoView({ block: "nearest" });
    }
    if (!antigas || !listRef.current || reduzMovimento()) return;
    listRef.current.querySelectorAll<HTMLElement>(":scope > [data-uid]").forEach((row) => {
      const antes = antigas.get(row.dataset.uid ?? "");
      if (antes == null) return;
      const delta = antes - row.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) return;
      row.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], { duration: 200, easing: "cubic-bezier(.23, 1, .32, 1)" });
    });
  }, [modelo.itens]);

  const guardarPosicoes = () => {
    if (!listRef.current) return;
    flip.current = new Map(Array.from(listRef.current.querySelectorAll<HTMLElement>(":scope > [data-uid]")).map((row) => [row.dataset.uid ?? "", row.getBoundingClientRect().top]));
  };

  const mover = (de: number, para: number, animar: boolean, foco: FocoMover["onde"]) => {
    if (busy || para < 0 || para >= modelo.itens.length || de === para) return;
    if (animar) guardarPosicoes();
    const item = modelo.itens[de];
    focoMover.current = { uid: itemChave(item, de), onde: foco };
    onItens(moverItem(modelo.itens, de, para));
    setAnuncio(`${item.rotulo.trim() || "Item sem nome"} na posição ${para + 1} de ${modelo.itens.length}.`);
  };

  const atualizarItem = (uid: string, change: Partial<ModeloItem>) =>
    onItens(modelo.itens.map((item, index) => itemChave(item, index) === uid ? { ...item, ...change } : item));

  const adicionarTipo = (tipo: ChecklistItemTipo) => {
    if (busy) return;
    const item = novoItem(modelo.itens.length + 1, tipo);
    onItens([...modelo.itens, item]);
    setPainel("");
    setAberto(item.uid!);
    setFoco({ id: campoId(item.uid!, "rotulo"), bloco: "center" });
  };

  const adicionarPronto = (index: number) => {
    const pronto = ITENS_PRONTOS[index];
    if (busy || prontoNoModelo(modelo, pronto)) return;
    onItens([...modelo.itens, itemDePronto(pronto, modelo.itens.length + 1)]);
    setAnuncio(`${pronto.rotulo} adicionado como item ${modelo.itens.length + 1}.`);
  };

  const fecharPainel = (voltar: string) => {
    setPainel("");
    setFoco({ id: voltar, bloco: "nearest" });
  };

  const onPainelKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    fecharPainel(painel === "tipos" ? "mod-add-item" : "mod-add-pronto");
  };

  // ---------- Arrastar pela alça (mouse e toque) ----------

  const onAlcaDown = (event: PointerEvent<HTMLButtonElement>, uid: string) => {
    if (busy || arraste.current || !listRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    const rows = Array.from(listRef.current.querySelectorAll<HTMLElement>(":scope > [data-uid]"));
    const from = rows.findIndex((row) => row.dataset.uid === uid);
    if (from < 0) return;
    const rects = rows.map((row) => row.getBoundingClientRect());
    const passo = rects.length > 1 ? rects[1].top - rects[0].top - rects[0].height + rects[from].height : rects[from].height + 8;
    // Sem seleção de texto nem rolagem durante o arraste; o foco fica na alça (o item movido).
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    arraste.current = { uid, from, to: from, startY: event.clientY, scrollStart: window.scrollY, rows, rects, passo };
    rows[from].classList.add("is-dragging");
    listRef.current.classList.add("is-reordering");
  };

  const onAlcaMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = arraste.current;
    if (!drag) return;
    if (event.clientY < 72) window.scrollBy(0, -12);
    else if (event.clientY > window.innerHeight - 140) window.scrollBy(0, 12);
    const dy = event.clientY - drag.startY + (window.scrollY - drag.scrollStart);
    drag.rows[drag.from].style.transform = `translateY(${dy}px)`;
    const centro = drag.rects[drag.from].top + drag.rects[drag.from].height / 2 + dy;
    let to = drag.from;
    drag.rects.forEach((rect, index) => {
      const meio = rect.top + rect.height / 2;
      if (index < drag.from && centro < meio) to = Math.min(to, index);
      if (index > drag.from && centro > meio) to = Math.max(to, index);
    });
    drag.to = to;
    drag.rows.forEach((row, index) => {
      if (index === drag.from) return;
      const shift = to < drag.from && index >= to && index < drag.from ? drag.passo : to > drag.from && index > drag.from && index <= to ? -drag.passo : 0;
      row.style.transform = shift ? `translateY(${shift}px)` : "";
    });
  };

  // Termina o arraste: `aplicar` move o item; cancelar (pointercancel, captura perdida, Esc) devolve tudo ao lugar.
  const encerrarArraste = (aplicar: boolean) => {
    const drag = arraste.current;
    if (!drag) return;
    arraste.current = null;
    const mudou = aplicar && drag.to !== drag.from;
    if (mudou) guardarPosicoes();
    drag.rows.forEach((row) => { row.style.transform = ""; row.classList.remove("is-dragging"); });
    listRef.current?.classList.remove("is-reordering");
    if (mudou) mover(drag.from, drag.to, false, "alca");
    else if (!aplicar) setAnuncio("Arraste cancelado; a ordem não mudou.");
  };

  const onAlcaKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "Escape" && arraste.current) {
      event.preventDefault();
      event.stopPropagation();
      encerrarArraste(false);
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    mover(index, index + (event.key === "ArrowUp" ? -1 : 1), false, "alca");
  };

  // Seta clicada anima (ponteiro); pelo teclado, não. O foco segue o item; se a seta desativa, vai para a outra.
  const onSeta = (event: MouseEvent<HTMLButtonElement>, index: number, delta: -1 | 1) =>
    mover(index, index + delta, event.detail > 0, delta === -1 ? "subir" : "descer");

  const pedirRemover = (index: number) => {
    const item = modelo.itens[index];
    const uid = itemChave(item, index);
    const vizinho = modelo.itens[index + 1] ?? modelo.itens[index - 1];
    const voltar = vizinho ? `[data-uid="${CSS.escape(itemChave(vizinho, modelo.itens.indexOf(vizinho)))}"] .mod-item-toggle` : "#mod-add-item";
    if (!item.id && !item.rotulo.trim()) {
      onItens(modelo.itens.filter((_, position) => position !== index).map((row, position) => ({ ...row, ordem: position + 1 })));
      document.querySelector<HTMLElement>(voltar)?.focus();
      return;
    }
    onPedirRemover(uid, voltar);
  };

  const usoTexto = uso === "erro" ? "Não foi possível contar o uso" : uso === null ? (original?.id ? "Contando uso…" : "") :
    uso.total ? `Usado em ${uso.total} ${plural(uso.total, "checklist", "checklists")}${uso.abertos ? ` · ${uso.abertos} em aberto` : ""}` : "Ainda não usado em checklists";

  const statusIcon: IconName = status.tom === "erro" ? "errorCircle" : status.tom === "sucesso" ? "checkCircle" : status.tom === "salvando" ? "spinner" : status.tom === "aviso" ? "alert" : "clock";

  return (
    <div className="gestao-columns">
      <section className="gestao-card gestao-form mod-form" aria-labelledby="mod-form-title">
        <div className="gestao-card-head">
          <div><span className="gestao-eyebrow">Modelo</span><h2 id="mod-form-title">Dados e itens</h2></div>
          <div className="mod-head-meta">
            <span className={`gestao-badge ${modelo.ativo ? "is-success" : "is-neutral"}`}>{modelo.ativo ? "Ativo" : "Inativo"}</span>
            {usoTexto ? <span className="gestao-hint" aria-live="polite">{usoTexto}</span> : null}
            <button type="button" className="gestao-button is-secondary is-compact mod-ver-previa" onClick={() => setPrevia(true)}><Icon name="smartphone" size={14} />Ver como o motorista vê</button>
          </div>
        </div>
        <div className="gestao-form-body">
          {erros.length ? (
            <div className="mod-erros" role="region" aria-label="Pontos a ajustar antes de salvar">
              <p><Icon name="alert" size={16} /><strong>{resumoErros(erros)}</strong></p>
              <ul>
                {erros.map((erro, index) => (
                  <li key={`${erro.alvo === "item" ? erro.uid : ""}-${erro.campo}-${index}`}>
                    <button type="button" className="gestao-link-button" onClick={() => irPara(erro)}>{descreverErro(erro, modelo)}</button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {usoTotal ? <p className="mod-info"><Icon name="clipboardCheck" size={16} />Os {usoTotal} {plural(usoTotal, "checklist já criado mantém", "checklists já criados mantêm")} a versão de quando foram criados. As mudanças valem para os próximos.</p> : null}

          <div className="gestao-two-fields">
            <Campo id="mod-nome" label="Nome do modelo *" contador={`${modelo.nome.length}/150`} erro={errosCampo("nome")}>
              {(aria) => <input id="mod-nome" {...aria} value={modelo.nome} maxLength={150} disabled={busy} placeholder="Ex.: Vistoria quinzenal" onChange={(event) => onChange({ nome: event.target.value })} />}
            </Campo>
            <Campo id="mod-periodo" label="Periodicidade (dias) *" ajuda="A cada quantos dias os veículos que recebem este modelo fazem a vistoria." erro={errosCampo("periodicidade")}>
              {(aria) => <input id="mod-periodo" {...aria} type="text" inputMode="numeric" autoComplete="off" maxLength={3} value={modelo.periodicidadeDias ? String(modelo.periodicidadeDias) : ""} disabled={busy}
                onChange={(event) => { const digits = event.target.value.replace(/\D/g, "").replace(/^0+/, ""); onChange({ periodicidadeDias: digits ? Number(digits) : 0 }); }} />}
            </Campo>
          </div>
          <Campo id="mod-descricao" label="Descrição" contador={`${modelo.descricao.length}/2.000`}>
            {(aria) => <textarea id="mod-descricao" {...aria} className="mod-textarea-curta" value={modelo.descricao} maxLength={2000} disabled={busy} placeholder="Para que serve este modelo." onChange={(event) => onChange({ descricao: event.target.value })} />}
          </Campo>
          <div className="mod-toggles">
            <label className="mod-check">
              <input type="checkbox" checked={modelo.ativo} disabled={busy || eraPadrao} aria-describedby="mod-ativo-ajuda" onChange={(event) => onChange({ ativo: event.target.checked, padraoQuinzenal: event.target.checked && modelo.padraoQuinzenal })} />
              <span><strong>Modelo ativo</strong><small id="mod-ativo-ajuda">{eraPadrao ? "Este é o modelo da rotina quinzenal e não pode ser inativado. Marque outro modelo para a rotina primeiro." : "Inativo não aparece para novas solicitações. Checklists já criados não mudam."}</small></span>
            </label>
            <label className={`mod-check ${errosCampo("padrao") ? "is-invalid" : ""}`}>
              <input id="mod-padrao" type="checkbox" checked={modelo.padraoQuinzenal} disabled={busy || !modelo.ativo || eraPadrao} aria-describedby="mod-padrao-ajuda"
                onChange={(event) => { if (event.target.checked) onPedirPadrao(); else onChange({ padraoQuinzenal: false }); }} />
              <span><strong>Usar na rotina quinzenal</strong><small id="mod-padrao-ajuda">{eraPadrao ? "A rotina diária cria a vistoria de cada carro com este modelo. Para trocar, abra outro modelo e marque esta opção nele."
                : substitui ? `Ao salvar, substitui o modelo atual da rotina: ${substitui}.` : !modelo.ativo ? "Ative o modelo para usá-lo na rotina." : "A rotina diária cria a vistoria de cada carro com este modelo."}</small></span>
            </label>
          </div>

          <FiltroVeiculos modelo={modelo} outros={filtro.outros} veiculos={filtro.veiculos} opcoes={filtro.opcoes} estado={filtro.estado} busy={busy} mostrarErros={mostrarErros}
            onFiltro={(filtroJson) => onChange({ filtroJson })} onTentar={filtro.onTentar} />

          <div className="mod-items">
            <div className="mod-items-head">
              <div>
                <h3 className="mod-items-title">Itens · {modelo.itens.length}</h3>
                {modelo.itens.length > 1 ? <p className="gestao-hint">Arraste pela alça ou use as setas para mudar a ordem.</p> : null}
              </div>
              <div className="mod-add-actions">
                <button id="mod-add-item" type="button" className="gestao-button is-secondary" disabled={busy} aria-expanded={painel === "tipos"} aria-controls="mod-painel-tipos" onClick={() => setPainel(painel === "tipos" ? "" : "tipos")}><Icon name="plus" size={16} />Adicionar item</button>
                <button id="mod-add-pronto" type="button" className="gestao-button is-secondary" disabled={busy} aria-expanded={painel === "prontos"} aria-controls="mod-painel-prontos" onClick={() => setPainel(painel === "prontos" ? "" : "prontos")}><Icon name="list" size={16} />Adicionar item pronto</button>
              </div>
            </div>
            {errosCampo("itens") ? <p className="gestao-field-error"><Icon name="errorCircle" size={14} />{errosCampo("itens")}</p> : null}

            {painel === "tipos" ? (
              <div id="mod-painel-tipos" className="mod-painel" role="group" aria-label="Escolha o tipo do item" onKeyDown={onPainelKey}>
                <p className="mod-painel-title">Que tipo de item?</p>
                <div className="mod-tipos-grid">
                  {TIPOS.map((tipo, index) => (
                    <button key={tipo.id} type="button" className="mod-tipo-opcao" disabled={busy} autoFocus={index === 0} onClick={() => adicionarTipo(tipo.id)}>
                      <span className="mod-item-icon"><Icon name={tipo.icon} size={18} /></span>
                      <span><strong>{tipo.label}</strong><small>{tipo.descricao}</small></span>
                    </button>
                  ))}
                </div>
                <button type="button" className="gestao-link-button" onClick={() => fecharPainel("mod-add-item")}>Fechar</button>
              </div>
            ) : null}

            {painel === "prontos" ? (
              <div id="mod-painel-prontos" className="mod-painel" role="group" aria-label="Itens prontos" onKeyDown={onPainelKey}>
                <p className="mod-painel-title">Itens prontos <span className="gestao-hint">Toque para adicionar; dá para editar depois.</span></p>
                <div className="mod-prontos-grid">
                  {ITENS_PRONTOS.map((pronto, index) => {
                    const ja = prontoNoModelo(modelo, pronto);
                    const tipo = tipoInfo(pronto.tipo);
                    return (
                      <button key={pronto.chave} type="button" className={`mod-pronto ${ja ? "is-added" : ""}`} disabled={busy} aria-disabled={ja} autoFocus={index === 0}
                        aria-label={`${pronto.rotulo}, ${tipo.label}${ja ? ", já adicionado" : ""}`} onClick={() => adicionarPronto(index)}>
                        <span className="mod-item-icon"><Icon name={tipo.icon} size={16} /></span>
                        <span className="mod-pronto-text"><strong>{pronto.rotulo}</strong><small>{pronto.problemas.length ? pronto.problemas.join(" · ") : tipo.label}</small></span>
                        <span className={`mod-pronto-state ${ja ? "is-added" : ""}`}>{ja ? <><Icon name="check" size={14} />Já adicionado</> : <><Icon name="plus" size={14} />Adicionar</>}</span>
                      </button>
                    );
                  })}
                </div>
                <button type="button" className="gestao-button is-secondary is-compact" onClick={() => fecharPainel("mod-add-pronto")}>Concluir</button>
              </div>
            ) : null}

            {modelo.itens.length ? (
              <ol ref={listRef} className="mod-list" aria-label="Itens do modelo">
                {modelo.itens.map((item, index) => {
                  const uid = itemChave(item, index);
                  const errosItem = erros.filter((erro) => erro.alvo === "item" && erro.uid === uid);
                  const original = item.id ? originais.get(item.id) : undefined;
                  const renomeado = Boolean(original) && normalizarRotulo(original!.rotulo) !== normalizarRotulo(item.rotulo) && usoTotal !== 0;
                  return (
                    <ItemLinha key={uid} uid={uid} item={item} index={index} total={modelo.itens.length} aberto={aberto === uid} busy={busy}
                      erros={errosItem} renomeado={renomeado}
                      onToggle={() => setAberto(aberto === uid ? "" : uid)}
                      onItem={(change) => atualizarItem(uid, change)}
                      onSeta={(event, delta) => onSeta(event, index, delta)}
                      onRemover={() => pedirRemover(index)}
                      onAlcaDown={(event) => onAlcaDown(event, uid)} onAlcaMove={onAlcaMove} onAlcaUp={() => encerrarArraste(true)} onAlcaCancel={() => encerrarArraste(false)}
                      onAlcaKey={(event) => onAlcaKey(event, index)} />
                  );
                })}
              </ol>
            ) : (
              <div className="mod-vazio">
                <Icon name="list" size={32} />
                <strong>Nenhum item ainda</strong>
                <p>Comece pelos itens prontos (fotos do carro, pneus, faróis…) ou adicione um item do zero.</p>
                {painel !== "prontos" ? <button type="button" className="gestao-button is-secondary is-compact" disabled={busy} onClick={() => setPainel("prontos")}><Icon name="list" size={14} />Ver itens prontos</button> : null}
              </div>
            )}
            <p className="gestao-sr-only" aria-live="polite">{anuncio}</p>
          </div>
        </div>

        <div className={`mod-barra is-${status.tom}`}>
          <p className="mod-barra-status" role="status"><Icon name={statusIcon} size={16} className={status.tom === "salvando" ? "is-spinning" : ""} /><span>{status.texto}</span></p>
          <div className="mod-barra-acoes">
            <button type="button" className="gestao-button is-secondary" disabled={busy} onClick={onCancel}>{dirty ? "Cancelar" : "Fechar"}</button>
            <button type="button" className="gestao-button is-primary" disabled={!podeSalvar} aria-busy={status.tom === "salvando"} onClick={onSave}>
              {status.tom === "salvando" ? <Icon name="spinner" size={16} className="is-spinning" /> : <Icon name="save" size={16} />}
              {status.tom === "salvando" ? "Salvando…" : <span>Salvar<span className="mod-hide-small"> modelo</span></span>}
            </button>
          </div>
        </div>
      </section>

      <aside className="gestao-card gestao-preview" aria-labelledby="mod-preview-title">
        <div className="gestao-card-head"><div><span className="gestao-eyebrow">Prévia</span><h2 id="mod-preview-title">Como o motorista verá</h2></div></div>
        <PreviaMotorista modelo={modelo} />
      </aside>

      {previa ? <PreviaPainel modelo={modelo} onClose={() => { setPrevia(false); requestAnimationFrame(() => document.querySelector<HTMLElement>(".mod-ver-previa")?.focus()); }} /> : null}
    </div>
  );
}

// ---------- Campo com rótulo, ajuda e erro ligados por aria ----------

function Campo({ id, label, contador, ajuda, erro, children }: {
  id: string;
  label: string;
  contador?: string;
  ajuda?: string;
  erro?: string;
  children: (aria: { "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
}) {
  const describedBy = [ajuda ? `${id}-ajuda` : "", erro ? `${id}-erro` : ""].filter(Boolean).join(" ");
  return (
    <div className="gestao-field">
      <div className="gestao-field-label"><label htmlFor={id}>{label}</label>{contador ? <span>{contador}</span> : null}</div>
      {children({ ...(erro ? { "aria-invalid": true as const } : {}), ...(describedBy ? { "aria-describedby": describedBy } : {}) })}
      {ajuda ? <p id={`${id}-ajuda`} className="gestao-hint mod-ajuda">{ajuda}</p> : null}
      {erro ? <p id={`${id}-erro`} className="gestao-field-error"><Icon name="errorCircle" size={14} />{erro}</p> : null}
    </div>
  );
}

// ---------- Linha do item ----------

function ItemLinha({ uid, item, index, total, aberto, busy, erros, renomeado, onToggle, onItem, onSeta, onRemover, onAlcaDown, onAlcaMove, onAlcaUp, onAlcaCancel, onAlcaKey }: {
  uid: string;
  item: ModeloItem;
  index: number;
  total: number;
  aberto: boolean;
  busy: boolean;
  erros: ErroModelo[];
  renomeado: boolean;
  onToggle: () => void;
  onItem: (change: Partial<ModeloItem>) => void;
  onSeta: (event: MouseEvent<HTMLButtonElement>, delta: -1 | 1) => void;
  onRemover: () => void;
  onAlcaDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onAlcaMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onAlcaUp: () => void;
  onAlcaCancel: () => void;
  onAlcaKey: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const tipo = tipoInfo(item.tipo);
  const nome = item.rotulo.trim() || "Item sem nome";
  const painelId = `mod-item-${uid}-painel`;
  const erro = (campo: string) => erros.find((entry) => entry.campo === campo)?.mensagem ?? "";
  const problemas = item.tipo === "okNok" ? opcoesProblemaEfetivas(item).length : 0;
  const setas = (classe: string) => (
    <span className={`mod-item-arrows ${classe}`}>
      <button type="button" className="mod-icon-button" data-seta="subir" aria-label={`Subir ${nome}`} disabled={busy || index === 0} onClick={(event) => onSeta(event, -1)}><Icon name="arrowUp" size={16} /></button>
      <button type="button" className="mod-icon-button" data-seta="descer" aria-label={`Descer ${nome}`} disabled={busy || index === total - 1} onClick={(event) => onSeta(event, 1)}><Icon name="arrowDown" size={16} /></button>
    </span>
  );
  return (
    <li className={`mod-item ${aberto ? "is-open" : ""} ${erros.length ? "is-invalid" : ""}`} data-uid={uid}>
      <div className="mod-item-row">
        <button type="button" className="mod-handle" disabled={busy || total < 2} aria-label={`Mover ${nome}, posição ${index + 1} de ${total}. Arraste ou use as setas para cima e para baixo.`}
          onPointerDown={onAlcaDown} onPointerMove={onAlcaMove} onPointerUp={onAlcaUp} onPointerCancel={onAlcaCancel} onLostPointerCapture={onAlcaCancel} onKeyDown={onAlcaKey}>
          <Icon name="grip" size={18} />
        </button>
        <button type="button" className="mod-item-toggle" aria-expanded={aberto} aria-controls={painelId} onClick={onToggle}>
          <span className="mod-item-icon" title={tipo.label}><Icon name={tipo.icon} size={16} /></span>
          <span className="mod-item-text">
            <strong className={item.rotulo.trim() ? "" : "is-empty"}><span className="mod-item-num">{index + 1}.</span> {nome}</strong>
            <span className="mod-item-meta">
              <span className="mod-item-tipo">{tipo.label}{item.tipo === "numero" && item.unidade.trim() ? ` em ${item.unidade.trim()}` : ""}</span>
              {item.obrigatorio ? <span className="gestao-badge is-info mod-badge">Obrigatório</span> : <span className="mod-item-tipo">Opcional</span>}
              {item.tipo === "okNok" ? <span className="gestao-badge is-neutral mod-badge">{problemas} {plural(problemas, "problema", "problemas")}</span> : null}
              {erros.length ? <span className="gestao-badge is-danger mod-badge">Precisa de ajuste</span> : null}
            </span>
          </span>
          <Icon name="chevronDown" size={16} className="mod-item-chevron" />
        </button>
        {setas("is-row")}
      </div>
      {aberto ? (
        <div id={painelId} className="mod-item-body">
          <Campo id={campoId(uid, "rotulo")} label="Nome do item *" contador={`${item.rotulo.length}/150`} erro={erro("rotulo")}
            ajuda={renomeado ? "O histórico deste item vai aparecer separado na aba Padrões." : undefined}>
            {(aria) => <input id={campoId(uid, "rotulo")} {...aria} value={item.rotulo} maxLength={150} disabled={busy} placeholder="Ex.: Frente do veículo" onChange={(event) => onItem({ rotulo: event.target.value })} />}
          </Campo>
          <div className="gestao-field">
            <span className="gestao-label" id={`${painelId}-tipo`}>Tipo</span>
            <div className="mod-tipo-group" role="group" aria-labelledby={`${painelId}-tipo`}>
              {TIPOS.map((entry) => (
                <button key={entry.id} type="button" aria-pressed={item.tipo === entry.id} disabled={busy}
                  onClick={() => item.tipo !== entry.id && onItem({ tipo: entry.id, unidade: entry.id === "numero" ? item.unidade : "", obrigatorio: obrigatorioPadrao(entry.id) })}>
                  <Icon name={entry.icon} size={14} />{entry.label}
                </button>
              ))}
            </div>
          </div>
          <div className={`mod-item-fields ${item.tipo === "numero" ? "is-number" : ""}`}>
            {item.tipo === "numero" ? (
              <Campo id={campoId(uid, "unidade")} label="Unidade (opcional)" erro={erro("unidade")}>
                {(aria) => <input id={campoId(uid, "unidade")} {...aria} value={item.unidade} maxLength={20} disabled={busy} placeholder="km, %" onChange={(event) => onItem({ unidade: event.target.value })} />}
              </Campo>
            ) : null}
            <label className="mod-check mod-check-inline">
              <input type="checkbox" checked={item.obrigatorio} disabled={busy} onChange={(event) => onItem({ obrigatorio: event.target.checked })} />
              <span><strong>Obrigatório</strong><small>O motorista só envia o checklist com este item respondido.</small></span>
            </label>
          </div>
          <Campo id={campoId(uid, "instrucao")} label="Instrução para o motorista (opcional)" contador={`${item.instrucao.length}/1.000`} erro={erro("instrucao")}>
            {(aria) => <textarea id={campoId(uid, "instrucao")} {...aria} className="mod-textarea-curta" value={item.instrucao} maxLength={1000} disabled={busy} placeholder="Ex.: enquadre o carro inteiro, com a placa legível." onChange={(event) => onItem({ instrucao: event.target.value })} />}
          </Campo>
          {item.tipo === "okNok" ? <ProblemasCampo id={campoId(uid, "problemas")} item={item} busy={busy} erro={erro("problemas")} onChange={(opcoesProblema) => onItem({ opcoesProblema })} /> : null}
          <div className="mod-item-actions">
            {setas("is-body")}
            <button type="button" className="gestao-button is-secondary is-compact mod-remover" disabled={busy} onClick={onRemover}><Icon name="trash" size={14} />Remover item</button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

// ---------- Problemas do OK / Não OK como chips ----------

function ProblemasCampo({ id, item, busy, erro, onChange }: { id: string; item: ModeloItem; busy: boolean; erro: string; onChange: (value: string) => void }) {
  const lista = opcoesProblemaLista(item.opcoesProblema);
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cheio = lista.length >= MAX_OPCOES_PROBLEMA;
  const sugestoes = CHECKLIST_PROBLEMAS_PADRAO.filter((sugestao) => !lista.some((entry) => entry.toLocaleLowerCase("pt-BR") === sugestao.toLocaleLowerCase("pt-BR")));

  const adicionar = (valor: string) => {
    const resultado = adicionarProblemas(lista, valor);
    setAviso(resultado.aviso);
    if (resultado.lista.length !== lista.length) onChange(resultado.lista.join("\n"));
    // Recusado (repetido ou longo): o texto fica no campo para corrigir só o que precisa.
    setTexto(resultado.aviso && resultado.lista.length === lista.length ? valor.replace(/[,\n]+$/, "") : "");
  };
  // Remove pela posição: dado antigo com opção repetida perde só a clicada.
  const remover = (posicao: number) => {
    onChange(lista.filter((_, index) => index !== posicao).join("\n"));
    setAviso("");
    inputRef.current?.focus();
  };
  const describedBy = [`${id}-limite`, aviso ? `${id}-aviso` : "", erro ? `${id}-erro` : ""].filter(Boolean).join(" ");

  return (
    <div className="gestao-field">
      <div className="gestao-field-label"><label htmlFor={id}>Problemas que o motorista pode marcar</label></div>
      <div className={`mod-chips ${erro ? "is-invalid" : ""}`} onClick={() => inputRef.current?.focus()}>
        {lista.map((opcao, posicao) => (
          <span key={`${posicao}-${opcao}`} className={`mod-chip ${opcao.length > MAX_OPCAO_PROBLEMA ? "is-invalid" : ""}`}>
            {opcao}
            <button type="button" aria-label={`Remover problema ${opcao}`} disabled={busy} onClick={(event) => { event.stopPropagation(); remover(posicao); }}><Icon name="close" size={14} /></button>
          </span>
        ))}
        <input ref={inputRef} id={id} value={texto} maxLength={MAX_OPCAO_PROBLEMA} disabled={busy || cheio} aria-invalid={erro ? true : undefined} aria-describedby={describedBy}
          placeholder={cheio ? "Limite atingido" : lista.length ? "Adicionar problema" : "Digite e aperte Enter"}
          onChange={(event) => { const value = event.target.value; if (/[,\n]/.test(value)) adicionar(value); else { setTexto(value); setAviso(""); } }}
          onKeyDown={(event) => { if ((event.key === "Enter" || event.key === ",") && texto.trim()) { event.preventDefault(); adicionar(texto); } else if (event.key === "Enter") event.preventDefault(); }}
          onBlur={() => { if (texto.trim()) adicionar(texto); }} />
      </div>
      <p id={`${id}-limite`} className="gestao-hint mod-ajuda">{lista.length} de {MAX_OPCOES_PROBLEMA} problemas, até {MAX_OPCAO_PROBLEMA} caracteres cada. Enter ou vírgula adiciona.</p>
      {aviso ? <p id={`${id}-aviso`} className="mod-aviso" role="status"><Icon name="alert" size={14} />{aviso}</p> : null}
      {erro ? <p id={`${id}-erro`} className="gestao-field-error"><Icon name="errorCircle" size={14} />{erro}</p> : null}
      {sugestoes.length && !cheio ? (
        <div className="mod-sugestoes">
          <span className="gestao-hint">{lista.length ? "Sugestões:" : "Sem nenhum, o motorista escolhe da lista padrão. Sugestões:"}</span>
          {sugestoes.map((sugestao) => (
            <button key={sugestao} type="button" className="mod-chip is-sugestao" disabled={busy} aria-label={`Adicionar problema ${sugestao}`} onClick={() => adicionar(sugestao)}><Icon name="plus" size={14} />{sugestao}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------- Prévia ----------

function PreviaMotorista({ modelo }: { modelo: Modelo }) {
  return (
    <div className="gestao-preview-body">
      <div className="gestao-device" aria-hidden="true">
        <div className="gestao-device-screen">
          <div className="gestao-device-bar"><Icon name="clipboardCheck" /><strong>Checklist do veículo</strong></div>
          <div className="gestao-device-content">
            <div className="mod-phone-list">
              {modelo.itens.map((item, index) => {
                const total = item.tipo === "okNok" ? opcoesProblemaEfetivas(item).length : 0;
                return (
                  <div key={itemChave(item, index)} className="mod-phone-item">
                    <Icon name={tipoInfo(item.tipo).icon} />
                    <span><strong className={item.rotulo.trim() ? "" : "is-empty"}>{item.rotulo.trim() || "Nome do item"}{item.obrigatorio ? " *" : ""}</strong>
                      <small>{item.tipo === "okNok" ? `OK / Não OK · ${total} ${plural(total, "problema", "problemas")}` : item.instrucao.trim() || (item.tipo === "foto" ? "Tirar foto" : item.tipo === "numero" ? `Número${item.unidade ? ` em ${item.unidade}` : ""}` : "Texto livre")}</small>
                    </span>
                  </div>
                );
              })}
              {!modelo.itens.length ? <p className="mod-phone-empty">Os itens aparecem aqui.</p> : null}
            </div>
            <span className="gestao-device-button">Enviar checklist</span>
          </div>
        </div>
      </div>
      <p className="gestao-hint gestao-preview-foot">{modelo.itens.filter((item) => item.obrigatorio).length} de {modelo.itens.length} {plural(modelo.itens.length, "item obrigatório", "itens obrigatórios")}.</p>
    </div>
  );
}

function PreviaPainel({ modelo, onClose }: { modelo: Modelo; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>("button")?.focus(); }, []);
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); return; }
    if (event.key === "Tab") { event.preventDefault(); ref.current?.querySelector<HTMLElement>("button")?.focus(); }
  };
  return (
    <div className="gestao-modal mod-previa-modal">
      <button type="button" className="gestao-modal-backdrop" aria-label="Fechar prévia" tabIndex={-1} onClick={onClose} />
      <div ref={ref} className="mod-previa-sheet" role="dialog" aria-modal="true" aria-labelledby="mod-previa-title" onKeyDown={onKey}>
        <div className="mod-previa-head">
          <h2 id="mod-previa-title">Como o motorista verá</h2>
          <button type="button" className="mod-icon-button" aria-label="Fechar prévia" onClick={onClose}><Icon name="close" size={16} /></button>
        </div>
        <PreviaMotorista modelo={modelo} />
      </div>
    </div>
  );
}
