// Detalhe do projeto no Planner: situação, provas, briefing, linha do tempo e nova atualização; Editar abre o formulário.
import { useState } from "react";
import { Button, Dialog, Drawer, useToast } from "@betinhos/ui";
import type { Source } from "../projetos/data/source";
import { hojeIso } from "../projetos/domain/regras";
import type { Atualizacao, Etapa, Perfil, Projeto } from "../projetos/domain/types";
import { Painel } from "../projetos/components/Painel";
import { ProjetoDrawer } from "../projetos/components/ProjetoDrawer";
import "../projetos/projetos.css";

type Props = {
  projeto: Projeto | null;
  projetos: Projeto[];
  etapas: Etapa[];
  atualizacoes: Atualizacao[];
  perfil: Perfil;
  source: Source;
  onClose: () => void;
  onSaved: (p: Projeto) => void;
  onEtapaSalva: (e: Etapa) => void;
  onAtualizacao: (a: Atualizacao) => void;
};

export function ProjectDetailDrawer({ projeto, projetos, etapas, atualizacoes, perfil, source, onClose, onSaved, onEtapaSalva, onAtualizacao }: Props) {
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [descartar, setDescartar] = useState(false);

  // Atualização não registrada pergunta antes de fechar; envio em andamento não fecha.
  function fechar() {
    if (ocupado) { toast({ tone: "info", message: "Aguarde o envio da atualização terminar." }); return; }
    if (sujo) { setDescartar(true); return; }
    onClose();
  }

  const aberto = projeto != null && !editando;
  return (
    <>
      <Drawer open={aberto} onClose={fechar} size="wide" eyebrow={projeto?.area ? `Projetos · ${projeto.area}` : "Projetos"} title={projeto ? `${projeto.codigo} · ${projeto.nome}` : "Projeto"}>
        {projeto && !editando ? (
          <Painel key={projeto.id} projeto={projeto} etapas={etapas} atualizacoes={atualizacoes} perfil={perfil} source={source} hoje={hojeIso()}
            onAtualizacao={onAtualizacao} onEtapaSalva={onEtapaSalva} onEditarProjeto={() => { setSujo(false); setEditando(true); }}
            onDirty={setSujo} onBusy={setOcupado} />
        ) : null}
      </Drawer>
      <ProjetoDrawer target={projeto && editando ? { mode: "edit", id: projeto.id } : null} onClose={() => setEditando(false)} onDone={() => setEditando(false)}
        projetos={projetos} etapas={etapas} atualizacoes={atualizacoes} perfil={perfil} source={source} onSaved={onSaved} onEtapaSalva={onEtapaSalva} />
      <Dialog open={descartar} onClose={() => setDescartar(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setDescartar(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setDescartar(false); setSujo(false); onClose(); }}>Descartar</Button>
        </>}>
        A atualização deste projeto ainda não foi registrada.
      </Dialog>
    </>
  );
}
