import type { ExpenseDraft } from "./expenses";

export const EMPTY_EXPENSE_DRAFT: ExpenseDraft = {
  categoriaId: "",
  veiculoId: "",
  valor: "",
  dataGasto: new Date().toISOString().slice(0, 10),
  formaPagamentoId: "",
  cidadeId: "",
  estabelecimento: "",
  descricao: "",
  kmInformado: "",
  litros: ""
};
