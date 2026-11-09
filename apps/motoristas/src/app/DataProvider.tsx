import React, { createContext, useContext } from "react";
import { adaptadorDataverse } from "../data/dataverse/adaptador";
import type { PortaDados } from "../data/porta";

const DadosContext = createContext<PortaDados>(adaptadorDataverse);

// A entrada do app escolhe o adaptador; as telas pedem dados só por useDados().
export function DataProvider({ adaptador, children }: { adaptador: PortaDados; children: React.ReactNode }) {
  return <DadosContext.Provider value={adaptador}>{children}</DadosContext.Provider>;
}

export function useDados() {
  return useContext(DadosContext);
}
