import { useMemo } from "react";
import { Alert, Button, Input, SegmentedControl, Select } from "@betinhos/ui";
import { Car, Check, CircleAlert, Plus, RefreshCw, Trash2 } from "lucide-react";
import { plural, type Modelo } from "../domain/gestaoChecklists";
import {
  CAMPOS_FILTRO,
  campoFiltro,
  condicaoPara,
  descreverCondicao,
  erroCondicao,
  lerFiltro,
  OPERADORES,
  previaFiltro,
  ROTULO_OPERADOR,
  serializarFiltro,
  temFiltro,
  valorVazio,
  type Condicao,
  type OpcoesFiltro,
  type Operador,
  type VeiculoFiltro
} from "../domain/filtroVeiculo";
import { BrandLoader } from "../../../../app/BrandLoader";

export type EstadoVeiculos = "carregando" | "erro" | "pronto";

type Props = {
  modelo: Modelo;
  /** Os modelos como estão gravados (o editado entra no lugar da própria versão gravada). */
  outros: Modelo[];
  veiculos: VeiculoFiltro[];
  opcoes: OpcoesFiltro;
  estado: EstadoVeiculos;
  busy: boolean;
  mostrarErros: boolean;
  onFiltro: (filtroJson: string) => void;
  onTentar: () => void;
};

export const filtroValorId = (indice: number) => `mod-filtro-${indice}-valor`;

const numeroDe = (texto: string) => {
  const digitos = texto.replace(/\D/g, "").slice(0, 9);
  return digitos ? Number(digitos) : null;
};
const textoDe = (valor: unknown) => (typeof valor === "number" ? String(valor) : "");

export function FiltroVeiculos({ modelo, outros, veiculos, opcoes, estado, busy, mostrarErros, onFiltro, onTentar }: Props) {
  const filtro = useMemo(() => lerFiltro(modelo.filtroJson), [modelo.filtroJson]);
  // Só o que a prévia usa: digitar nos itens não recalcula a frota (o nome entra no desempate da prioridade).
  const { id, nome, ativo, padraoQuinzenal, prioridade, filtroJson } = modelo;
  const previa = useMemo(() => previaFiltro({ id, nome, ativo, padraoQuinzenal, prioridade, filtroJson }, outros, veiculos), [id, nome, ativo, padraoQuinzenal, prioridade, filtroJson, outros, veiculos]);
  const condicoes = filtro.condicoes;
  const gravar = (lista: Condicao[]) => onFiltro(serializarFiltro(lista));
  const mudar = (indice: number, condicao: Condicao) => gravar(condicoes.map((entry, posicao) => (posicao === indice ? condicao : entry)));
  const remover = (indice: number) => {
    gravar(condicoes.filter((_, posicao) => posicao !== indice));
    // O foco vai para a condição que ocupou o lugar ou para "Adicionar condição".
    requestAnimationFrame(() => {
      const proxima = document.getElementById(`mod-filtro-${Math.min(indice, condicoes.length - 2)}-campo`);
      (proxima ?? document.getElementById("mod-filtro-add"))?.focus();
    });
  };
  const adicionar = () => {
    gravar([...condicoes, condicaoPara(CAMPOS_FILTRO[0].campo)]);
    requestAnimationFrame(() => document.getElementById(`mod-filtro-${condicoes.length}-campo`)?.focus());
  };

  if (modelo.padraoQuinzenal) {
    return (
      <section className="mod-filtro" aria-labelledby="mod-filtro-titulo">
        <h3 id="mod-filtro-titulo" className="mod-items-title">Quais veículos recebem este modelo</h3>
        <Alert tone="info">Recebe os veículos próprios e ativos que não se encaixam em outro modelo.</Alert>
        <Previa estado={estado} onTentar={onTentar} vazio="" previa={previa} inativo={!modelo.ativo} />
      </section>
    );
  }

  const soIncompletas = previa.incompletas > 0 && previa.incompletas === condicoes.length;
  const vazio = soIncompletas ? "Complete a condição para ver quais veículos recebem."
    : !temFiltro(filtro) ? "Sem condições, este modelo só é usado quando alguém escolhe ele ao solicitar um checklist."
    : filtro.invalido || filtro.naoSuportados.length ? "Remova as condições que não podem ser lidas."
    : previa.ficamComOutro.length ? "Os veículos que atendem a estas condições ficam com um modelo que vem antes na lista."
    : "Nenhum veículo ativo atende a todas as condições.";
  return (
    <section className="mod-filtro" aria-labelledby="mod-filtro-titulo">
      <div className="mod-items-head">
        <div>
          <h3 id="mod-filtro-titulo" className="mod-items-title">Quais veículos recebem este modelo</h3>
          <p className="bt-field__hint">{condicoes.length > 1 ? "O veículo precisa atender a todas as condições." : "Monte condições com os dados do veículo, como marca ou blindado."}</p>
        </div>
      </div>

      {filtro.invalido ? (
        <Alert tone="danger" action={<Button variant="secondary" size="compact" disabled={busy} onClick={() => onFiltro("")}>Limpar filtro</Button>}>
          O filtro gravado não pôde ser lido. Enquanto isso, nenhum veículo recebe este modelo.
        </Alert>
      ) : null}

      {condicoes.length ? (
        <ol className="mod-conds" aria-label="Condições do filtro">
          {condicoes.map((condicao, indice) => (
            <CondicaoLinha key={indice} indice={indice} condicao={condicao} opcoes={opcoes} carregando={estado === "carregando"} busy={busy}
              erro={mostrarErros ? erroCondicao(condicao) : ""}
              onChange={(nova) => mudar(indice, nova)} onRemover={() => remover(indice)} />
          ))}
        </ol>
      ) : null}
      <div>
        <Button id="mod-filtro-add" variant="secondary" size="compact" icon={<Plus size={14} />} disabled={busy} onClick={adicionar}>Adicionar condição</Button>
      </div>

      <Previa estado={estado} onTentar={onTentar} previa={previa} inativo={!modelo.ativo} vazio={vazio} />
      {previa.incompletas && !soIncompletas ? <p className="bt-field__hint">Condições ainda sem valor não entram na conta.</p> : null}
    </section>
  );
}

const contagem = (total: number) => total ? `${total} ${plural(total, "veículo recebe", "veículos recebem")} este modelo` : "Nenhum veículo recebe este modelo";

function CondicaoLinha({ indice, condicao, opcoes, carregando, busy, erro, onChange, onRemover }: {
  indice: number;
  condicao: Condicao;
  opcoes: OpcoesFiltro;
  carregando: boolean;
  busy: boolean;
  erro: string;
  onChange: (condicao: Condicao) => void;
  onRemover: () => void;
}) {
  const definicao = campoFiltro(condicao.campo);
  const numero = indice + 1;
  const erroId = `mod-filtro-${indice}-erro`;
  const remover = (
    <Button variant="ghost" size="compact" className="mod-cond-remover" icon={<Trash2 size={16} />} disabled={busy} aria-label={`Remover condição ${numero}: ${descreverCondicao(condicao, opcoes)}`} onClick={onRemover} />
  );
  if (!definicao) {
    return (
      <li className="mod-cond is-invalid">
        <Alert tone="danger" title="Campo não suportado" className="mod-cond-naosuportado">({condicao.campo || "sem nome"}). Enquanto esta condição existir, nenhum veículo recebe este modelo.</Alert>
        {remover}
      </li>
    );
  }
  const operadores = OPERADORES[definicao.tipo];
  const aria = { invalid: Boolean(erro), "aria-describedby": erro ? erroId : undefined };
  const trocarCampo = (campo: string) => onChange(condicaoPara(campo));
  const trocarOperador = (operador: Operador) => {
    const mudouForma = (operador === "entre") !== (condicao.operador === "entre");
    onChange({ ...condicao, operador, valor: mudouForma ? valorVazio(definicao.tipo, operador) : condicao.valor });
  };

  let valor;
  if (definicao.tipo === "texto") {
    valor = <Input id={filtroValorId(indice)} {...aria} size="compact" className="mod-cond-input" value={typeof condicao.valor === "string" ? condicao.valor : ""} maxLength={100} disabled={busy}
      aria-label={`Valor da condição ${numero}`} placeholder={definicao.exemplo}
      onChange={(event) => onChange({ ...condicao, valor: event.target.value })} />;
  } else if (definicao.tipo === "inteiro" && condicao.operador === "entre") {
    const [min, max] = Array.isArray(condicao.valor) ? condicao.valor : [null, null];
    valor = (
      <span className="mod-cond-entre">
        <Input id={filtroValorId(indice)} {...aria} size="compact" className="mod-cond-input" inputMode="numeric" autoComplete="off" value={textoDe(min)} disabled={busy} aria-label={`Condição ${numero}: de`} placeholder="De"
          onChange={(event) => onChange({ ...condicao, valor: [numeroDe(event.target.value), max ?? null] })} />
        <span aria-hidden="true">e</span>
        <Input {...aria} size="compact" className="mod-cond-input" inputMode="numeric" autoComplete="off" value={textoDe(max)} disabled={busy} aria-label={`Condição ${numero}: até`} placeholder="Até"
          onChange={(event) => onChange({ ...condicao, valor: [min ?? null, numeroDe(event.target.value)] })} />
      </span>
    );
  } else if (definicao.tipo === "inteiro") {
    valor = <Input id={filtroValorId(indice)} {...aria} size="compact" className="mod-cond-input" inputMode="numeric" autoComplete="off" value={textoDe(condicao.valor)} disabled={busy}
      aria-label={`Valor da condição ${numero}`} placeholder={definicao.exemplo}
      onChange={(event) => onChange({ ...condicao, valor: numeroDe(event.target.value) })} />;
  } else if (definicao.tipo === "booleano") {
    valor = (
      <span id={filtroValorId(indice)}>
        <SegmentedControl aria-label={`Valor da condição ${numero}`} size="compact" value={condicao.valor === true ? "sim" : condicao.valor === false ? "nao" : ""}
          options={[{ value: "sim", label: "Sim", disabled: busy }, { value: "nao", label: "Não", disabled: busy }]}
          onChange={(escolha) => onChange({ ...condicao, valor: escolha === "sim" })} />
      </span>
    );
  } else {
    const escolhidos = Array.isArray(condicao.valor) ? condicao.valor.filter((item): item is number => typeof item === "number") : [];
    const lista = opcoes[definicao.campo] ?? [];
    // Valor gravado que a metadata não traz mais continua visível para poder ser removido.
    const extras = escolhidos.filter((item) => !lista.some((opcao) => opcao.valor === item)).map((item) => ({ valor: item, rotulo: `Valor ${item}` }));
    valor = (
      <span className="mod-opcoes" role="group" aria-label={`Valores da condição ${numero}`} aria-describedby={erro ? erroId : undefined}>
        {[...lista, ...extras].map((opcao, posicao) => {
          const marcado = escolhidos.includes(opcao.valor);
          return (
            <button key={opcao.valor} id={posicao === 0 ? filtroValorId(indice) : undefined} type="button" className="mod-opcao" aria-pressed={marcado} disabled={busy}
              onClick={() => onChange({ ...condicao, valor: marcado ? escolhidos.filter((item) => item !== opcao.valor) : [...escolhidos, opcao.valor] })}>
              {marcado ? <Check size={14}/> : null}{opcao.rotulo}
            </button>
          );
        })}
        {!lista.length && !extras.length ? <span className="bt-field__hint">{carregando ? "Carregando as opções…" : "Nenhuma opção encontrada para este campo."}</span> : null}
      </span>
    );
  }

  return (
    <li className={`mod-cond ${definicao.tipo === "choice" || condicao.operador === "entre" ? "is-larga" : ""} ${erro ? "is-invalid" : ""}`}>
      <span className="mod-cond-num" aria-hidden="true">{numero > 1 ? "e" : "Se"}</span>
      <Select id={`mod-filtro-${indice}-campo`} className="mod-cond-select" size="compact" searchable={false} clearable={false} value={definicao.campo} disabled={busy} aria-label={`Campo da condição ${numero}`}
        options={CAMPOS_FILTRO.map((campo) => ({ value: campo.campo, label: campo.rotulo }))} onChange={(campo) => campo && trocarCampo(campo)} />
      {operadores.length > 1 ? (
        <Select className="mod-cond-select" size="compact" searchable={false} clearable={false} value={condicao.operador} disabled={busy} aria-label={`Comparação da condição ${numero}`}
          options={operadores.map((operador) => ({ value: operador, label: ROTULO_OPERADOR[operador] }))} onChange={(operador) => operador && trocarOperador(operador as Operador)} />
      ) : <span className="mod-cond-op">{ROTULO_OPERADOR[operadores[0]]}</span>}
      <span className="mod-cond-valor">{valor}</span>
      {remover}
      {erro ? <p id={erroId} className="bt-field__error mod-cond-erro"><CircleAlert size={14} />{erro}</p> : null}
    </li>
  );
}

function Previa({ estado, onTentar, vazio, previa, inativo }: {
  estado: EstadoVeiculos;
  onTentar: () => void;
  vazio: string;
  previa: ReturnType<typeof previaFiltro>;
  inativo: boolean;
}) {
  if (estado === "carregando") {
    return (
      <div className="mod-previa-filtro">
        <BrandLoader variant="inline" size="sm" label="Carregando os veículos" text="Carregando os veículos…" />
      </div>
    );
  }
  if (estado === "erro") {
    return (
      <div className="mod-previa-filtro">
        <Alert tone="danger" action={<Button variant="secondary" size="compact" icon={<RefreshCw size={14} />} onClick={onTentar}>Tentar de novo</Button>}>
          Não foi possível carregar os veículos para a prévia.
        </Alert>
      </div>
    );
  }
  return (
    <div className="mod-previa-filtro">
      <p className="mod-previa-total" role="status"><Car size={16}/><strong>{contagem(previa.recebem.length)}</strong></p>
      {inativo ? <Alert tone="warning">Modelo inativo: a rotina só usa este modelo depois que você ativar.</Alert> : null}
      {!previa.recebem.length && vazio ? <p className="bt-field__hint">{vazio}</p> : null}
      {previa.recebem.length ? (
        <ul className="mod-veiculos" aria-label="Veículos que recebem este modelo">
          {previa.recebem.map(({ veiculo, tambem }) => (
            <li key={veiculo.id}>
              <VeiculoTexto veiculo={veiculo} />
              {tambem.length ? <small className="mod-veiculo-nota">Também se encaixa em {tambem.join(", ")}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {previa.ficamComOutro.length ? (
        <>
          <p className="mod-previa-sub">Ficam com outro modelo · {previa.ficamComOutro.length}</p>
          <ul className="mod-veiculos is-outro" aria-label="Veículos que ficam com outro modelo">
            {previa.ficamComOutro.map(({ veiculo, modelo }) => (
              <li key={veiculo.id}>
                <VeiculoTexto veiculo={veiculo} />
                <small className="mod-veiculo-nota">Fica com {modelo}</small>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function VeiculoTexto({ veiculo }: { veiculo: VeiculoFiltro }) {
  const descricao = [veiculo.campos.cr40f_marca, veiculo.campos.cr40f_modelo].filter((value) => typeof value === "string" && value.trim()).join(" ");
  const categoria = veiculo.rotulos.new_categoriadoveiculo;
  return (
    <span className="mod-veiculo">
      <strong>{veiculo.placa || "Sem placa"}</strong>
      <small>{descricao || "Marca e modelo não informados"}{categoria ? ` · ${categoria}` : ""}</small>
    </span>
  );
}
