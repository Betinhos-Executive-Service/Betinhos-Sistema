import { useEffect, useMemo, useRef, useState } from 'react';
import SearchableSelect from './SearchableSelect';
import { ArrowLeft, ArrowRight, Check, CheckCheck, FileCheck2, Info, LoaderCircle, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { money, parseMoney, isLegacyPaidService, paymentTotals } from './domain/payment';
import { activeConsolidated, consolidatedReason, consolidatedSnapshot, overlaps } from './domain/consolidated';

const displayDate = (value) => value?.split('-').reverse().join('/');
const validMoney = (value) => /^\s*\d+(?:\.\d{3})*(?:,\d{1,2})?\s*$/.test(value);

export function ConsolidatedDrawer({ Drawer, dataverse, favorecidos, lots, range, lot, onClose, onSaved }) {
  const [step, setStep] = useState(1);
  const [favorecidoId, setFavorecidoId] = useState(lot?.favorecidoId || '');
  const [from, setFrom] = useState(lot?.from || range.from);
  const [to, setTo] = useState(lot?.to || range.to);
  const [description, setDescription] = useState(lot?.description || '');
  const [amount, setAmount] = useState(lot ? money(lot.repasse).replace(/[^\d.,]/g, '') : '');
  const [includesHistory, setIncludesHistory] = useState(lot?.includesHistory || false);
  const [revenueConfirmed, setRevenueConfirmed] = useState(lot?.revenueConfirmed || false);
  const [revenue, setRevenue] = useState(lot?.revenueConfirmed ? money(lot.revenue).replace(/[^\d.,]/g, '') : '');
  const [legacyConfirmed, setLegacyConfirmed] = useState(lot?.legacyConfirmed || false);
  const [selected, setSelected] = useState(lot?.serviceIds || []);
  const [services, setServices] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectionNotice, setSelectionNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [overlapConfirmed, setOverlapConfirmed] = useState(false);
  const [animateStep, setAnimateStep] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const formRef = useRef(null);
  useEffect(() => { formRef.current?.querySelector('[data-step-heading]')?.focus({ preventScroll: true }); formRef.current?.closest('.drawer-body')?.scrollTo({ top: 0 }); }, [step]);
  useEffect(() => { if (error) formRef.current?.querySelector('[role="alert"]')?.focus({ preventScroll: true }); }, [error]);
  useEffect(() => {
    const handleKey = (event) => {
      const dialog = formRef.current?.closest('[role="dialog"]');
      if (event.defaultPrevented || !dialog?.contains(event.target)) return;
      if (event.key === 'Escape' && !saving) { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button, input, textarea, select, a[href], [tabindex="0"]')].filter((control) => !control.disabled && control.offsetParent !== null);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, saving]);
  useEffect(() => {
    if (!favorecidoId || !from || !to || from > to) return;
    let alive = true;
    setLoading(true); setError('');
    dataverse.listFinanceServices({ from, to }).then((rows) => {
      if (alive) setServices(rows.filter((row) => row.favorecidoId === favorecidoId));
    }).catch((err) => { if (alive) { setServices([]); setError(err.message); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [dataverse, favorecidoId, from, to, reload]);
  const changeScope = (setter, value) => {
    setter(value); setSelected([]); setServices([]); setLegacyConfirmed(false); setOverlapConfirmed(false);
    if (selected.length) setSelectionNotice('Fornecedor ou período alterado. A seleção foi limpa; revise os serviços novamente.');
  };
  const eligible = services.filter((row) => !consolidatedReason(row, favorecidoId, lot?.id));
  const visible = eligible.filter((row) => `${row.identificador} ${row.trajeto} ${row.motorista}`.toLowerCase().includes(search.toLowerCase()));
  const chosen = eligible.filter((row) => selected.includes(row.id));
  const favorecido = favorecidos.find((row) => row.id === favorecidoId);
  const overlapping = useMemo(() => activeConsolidated(lots).filter((row) => row.id !== lot?.id && row.favorecidoId === favorecidoId && overlaps({ from, to }, row)), [lots, lot?.id, favorecidoId, from, to]);
  const input = { mode: 'consolidated', favorecido, from, to, description, includesHistory,
    revenueConfirmed, revenue: revenueConfirmed && validMoney(revenue) ? parseMoney(revenue) : NaN,
    repasse: validMoney(amount) ? parseMoney(amount) : NaN, legacyConfirmed, services: chosen, requestId: requestId.current, lotId: lot?.id };
  const next = (event) => {
    setError('');
    if (step === 1) {
      if (!favorecido || !from || !to || from > to || !description.trim()) { setError('Informe fornecedor, período válido e descrição.'); return; }
    } else {
      try {
        if (chosen.length !== selected.length) throw new Error('Alguns serviços selecionados ficaram indisponíveis. Atualize e revise a seleção.');
        consolidatedSnapshot(input, chosen);
        if (overlapping.length && !overlapConfirmed) throw new Error('Revise os lançamentos sobrepostos e confirme que esta cobrança é diferente.');
      } catch (err) { setError(err.message); return; }
    }
    setAnimateStep(event.detail > 0); setStep(step + 1);
  };
  const save = async () => {
    if (submitting.current) return;
    submitting.current = true; setSaving(true); setError('');
    try { const saved = await dataverse.saveConsolidated(input, lot?.id); onSaved(saved); }
    catch (err) { setError(err.message); }
    finally { submitting.current = false; setSaving(false); }
  };
  return <Drawer title={lot ? 'Editar consolidado' : 'Pagamento consolidado'} subtitle="Lotes de pagamento" wide locked={saving} onClose={onClose}>
    <div className="form-stack consolidated-form" ref={formRef}>
      <ol className="consolidated-steps" aria-label="Etapas do lançamento">
        {['Fornecedor e período', 'Valor e abrangência', 'Revisão'].map((label, index) => <li key={label} aria-current={step === index + 1 ? 'step' : undefined} data-complete={step > index + 1}>
          <span className="consolidated-step-number" aria-hidden="true">{step > index + 1 ? <Check size={14} /> : index + 1}</span><span>{label}</span>
        </li>)}
      </ol>
      {error && <div className="inline-alert warning-alert" role="alert" tabIndex={-1}><TriangleAlert size={16} /><span>{error}</span></div>}
      {selectionNotice && <div className="consolidated-helper" role="status"><Info size={15} /><span>{selectionNotice}</span></div>}
      <div key={step} className="consolidated-step-content" data-motion={animateStep}>
      <div className="consolidated-section-heading">
        <h3 tabIndex={-1} data-step-heading>{['Quem recebe e qual o período?', 'Qual o total desta cobrança?', 'Confira o lançamento'][step - 1]}</h3>
        <p>{['Informe a cobrança que será registrada em um único lançamento.', 'Um total para toda a cobrança, sem preencher valores por serviço.', 'O lançamento será salvo em aberto. Registre o pagamento no detalhe.'][step - 1]}</p>
      </div>
      {step === 1 && <>
        <label className="field"><span>Fornecedor</span><SearchableSelect value={favorecidoId} clearable={false} onChange={(value) => changeScope(setFavorecidoId, value)} aria-label="Fornecedor do consolidado" options={[{ value: '', label: 'Selecione o fornecedor', disabled: true }, ...favorecidos.map((row) => ({ value: row.id, label: row.nome }))]} /></label>
        <div className="form-grid"><label className="field"><span>Início do período</span><input type="date" value={from} onChange={(e) => changeScope(setFrom, e.target.value)} /></label><label className="field"><span>Fim do período</span><input type="date" value={to} onChange={(e) => changeScope(setTo, e.target.value)} /></label></div>
        <label className="field"><span>Descrição da cobrança</span><textarea value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: serviços de janeiro a julho, conforme cobrança recebida" /><small>Use uma descrição que ajude a reconhecer a cobrança depois.</small></label>
      </>}
      {step === 2 && <>
        <div className="consolidated-context"><strong>{favorecido?.nome}</strong><span>{displayDate(from)} a {displayDate(to)}</span></div>
        <label className="field consolidated-amount"><span>Total a pagar ao fornecedor (R$)</span><input aria-label="Total a pagar ao fornecedor (R$)" aria-describedby="consolidated-cost-help" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /><small id="consolidated-cost-help">Cobre os serviços vinculados e o histórico informado.</small></label>
        <label className="selection-row consolidated-option"><input type="checkbox" checked={includesHistory} onChange={(e) => setIncludesHistory(e.target.checked)} /><div><strong>Inclui serviços fora do sistema</strong><span>Permite registrar a cobrança mesmo sem serviços cadastrados.</span></div></label>
        <div className="consolidated-section">
        <label className="selection-row consolidated-option"><input type="checkbox" checked={revenueConfirmed} onChange={(e) => setRevenueConfirmed(e.target.checked)} /><div><strong>Já tenho o total cobrado dos clientes</strong><span>Opcional. Informe a receita da mesma abrangência desta cobrança.</span></div></label>
        {revenueConfirmed ? <label className="field"><span>Total cobrado dos clientes no mesmo período (R$)</span><input inputMode="decimal" value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="0,00" /><small>Informe toda a receita coberta pelo consolidado, incluindo os serviços fora do sistema.</small></label> : <p className="inline-alert">Lucro pendente de receita. Você poderá completar a receita depois, inclusive após pagar.</p>}
        {revenueConfirmed && validMoney(revenue) && parseMoney(revenue) < parseMoney(amount) && <p className="inline-alert warning-alert"><TriangleAlert size={16} />A receita é menor que o custo. O consolidado terá prejuízo.</p>}
        </div>
        <section className="consolidated-section" aria-label="Serviços cadastrados">
        <div className="selection-head"><div><strong>Serviços vinculados</strong><span>Seleção opcional · sem valores individuais</span></div><span className="status-badge tone-neutral" role="status">{chosen.length} selecionado(s)</span></div>
        <div className="consolidated-selection-tools"><label className="field"><span>Buscar serviços cadastrados</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Identificação, trajeto ou motorista" /></label><button type="button" className="secondary-button" disabled={loading || saving} onClick={() => setReload((value) => value + 1)}><RefreshCw size={15} />Atualizar</button></div>
        <div className="consolidated-selection-actions"><button type="button" className="text-button" disabled={loading || !visible.length} onClick={() => setSelected((ids) => [...new Set([...ids, ...visible.map((row) => row.id)])])}><CheckCheck size={15} />Selecionar todos disponíveis{search ? ' na busca' : ''}</button><button type="button" className="text-button" disabled={!selected.length} onClick={() => setSelected([])}>Limpar seleção</button></div>
        {loading ? <div className="empty-small consolidated-empty" role="status"><LoaderCircle size={20} className="consolidated-spinner" /><strong>Carregando serviços…</strong></div> : <div className="selection-list">{visible.map((row) => <label key={row.id} className="selection-row consolidated-option consolidated-service"><input type="checkbox" checked={selected.includes(row.id)} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, row.id] : ids.filter((id) => id !== row.id))} /><div><strong>{row.identificador} · {displayDate(row.dataServico?.slice(0, 10))}</strong><span>{row.motorista} · {row.trajeto}</span>{isLegacyPaidService(row) && <small>Histórico: confirme pendência abaixo</small>}</div><span className="status-badge tone-neutral">{row.statusLabel || row.status || 'Disponível'}</span></label>)}{!visible.length && <div className="empty-small consolidated-empty"><Search size={20} /><strong>{search ? 'Nenhum serviço encontrado' : 'Nenhum serviço disponível'}</strong><span>{search ? 'Tente outra identificação, trajeto ou motorista.' : 'Para histórico fora da base, marque “Inclui serviços fora do sistema”.'}</span></div>}</div>}
        {services.length > eligible.length && <small>{services.length - eligible.length} serviço(s) indisponível(is) por vínculo ou pagamento existente.</small>}
        {chosen.length > 0 && <div className="consolidated-helper"><Info size={15} /><span>Receita cadastrada de referência: <strong>{money(paymentTotals(chosen).revenue)}</strong>. Não representa a receita completa da cobrança.</span></div>}
        {chosen.some(isLegacyPaidService) && <label className="selection-row consolidated-option consolidated-confirmation"><input type="checkbox" checked={legacyConfirmed} onChange={(e) => setLegacyConfirmed(e.target.checked)} /><div><strong>Confirme a pendência histórica</strong><span>Conferi: os serviços anteriores a 01/06/2026 selecionados continuam pendentes de pagamento.</span></div></label>}
        </section>
        {overlapping.length > 0 && <div className="inline-alert warning-alert"><div><strong>Outros consolidados abrangem este período</strong>{overlapping.map((row) => <p key={row.id}>{row.identifier} · {displayDate(row.from)} a {displayDate(row.to)} · {money(row.repasse)}</p>)}<label className="selection-row"><input type="checkbox" checked={overlapConfirmed} onChange={(e) => setOverlapConfirmed(e.target.checked)} /><span>Revisei os registros: esta cobrança é diferente e não duplica os valores.</span></label></div></div>}
      </>}
      {step === 3 && <>
        <div className="consolidated-review">
          <div className="consolidated-context"><strong>{favorecido?.nome}</strong><span>{displayDate(from)} a {displayDate(to)}</span></div>
          <p className="consolidated-description">{description}</p>
          <div className="lot-summary"><div><span>Total a pagar</span><strong>{money(input.repasse)}</strong></div><div><span>Receita</span><strong>{revenueConfirmed ? money(input.revenue) : 'Pendente'}</strong></div><div data-negative={revenueConfirmed && input.revenue < input.repasse}><span>Lucro do período</span><strong>{revenueConfirmed ? money(input.revenue - input.repasse) : 'Pendente de receita'}</strong></div></div>
          <dl className="consolidated-review-meta"><div><dt>Serviços vinculados</dt><dd>{chosen.length}</dd></div><div><dt>Histórico fora do sistema</dt><dd>{includesHistory ? 'Incluído' : 'Não incluído'}</dd></div></dl>
        </div>
        {!revenueConfirmed && <div className="consolidated-helper"><Info size={15} /><span>O custo ficará registrado. Complete a receita depois para apurar o lucro.</span></div>}
      </>}
      </div>
      <div className="drawer-actions consolidated-footer"><span className="consolidated-footer-hint">Etapa {step} de 3</span><button type="button" className="secondary-button" disabled={saving} onClick={step === 1 ? onClose : (event) => { setAnimateStep(event.detail > 0); setStep(step - 1); setError(''); }}>{step > 1 && <ArrowLeft size={15} />}{step === 1 ? 'Cancelar' : 'Voltar'}</button><button type="button" className="primary-button" disabled={saving || loading} onClick={step === 3 ? save : next}>{saving ? <LoaderCircle size={16} className="consolidated-spinner" /> : step === 3 ? <FileCheck2 size={16} /> : null}{saving ? 'Salvando…' : step === 3 ? 'Salvar lançamento' : 'Continuar'}{step < 3 && !saving && <ArrowRight size={15} />}</button></div>
    </div>
  </Drawer>;
}

export function RevenueDrawer({ Drawer, dataverse, lot, onClose, onSaved }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const save = async () => {
    if (submitting.current) return;
    if (!validMoney(value)) { setError('Informe o total em reais, incluindo zero quando confirmado.'); return; }
    submitting.current = true; setSaving(true); setError('');
    try { onSaved(await dataverse.completeConsolidatedRevenue(lot.id, parseMoney(value))); }
    catch (err) { setError(err.message); }
    finally { submitting.current = false; setSaving(false); }
  };
  return <Drawer title="Completar receita" subtitle={lot.identifier} locked={saving} onClose={onClose}>
    <div className="form-stack consolidated-form">
      <div className="consolidated-section-heading"><h3>Receita de toda a cobrança</h3><p>Inclua os serviços vinculados e o histórico fora do sistema.</p></div>
      <div className="consolidated-context"><strong>{displayDate(lot.from)} a {displayDate(lot.to)}</strong><span>Custo: {money(lot.repasse)}</span></div>
      <label className="field consolidated-amount"><span>Total cobrado dos clientes (R$)</span><input aria-label="Total cobrado dos clientes (R$)" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" /><small>Zero é válido quando não houve receita.</small></label>
      {validMoney(value) && <div className="consolidated-review"><div className="consolidated-context"><span>Lucro do período</span><strong className={parseMoney(value) < lot.repasse ? 'consolidated-loss' : undefined}>{money(parseMoney(value) - lot.repasse)}{parseMoney(value) < lot.repasse ? ' · Prejuízo' : ''}</strong></div></div>}
      <div className="consolidated-helper"><Info size={15} /><span>A confirmação atualiza o lucro e a versão do documento. O status do pagamento permanece igual.</span></div>
      {error && <div className="inline-alert warning-alert" role="alert"><TriangleAlert size={16} /><span>{error}</span></div>}
      <div className="drawer-actions consolidated-footer"><button className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving} onClick={save}>{saving ? <LoaderCircle size={16} className="consolidated-spinner" /> : <Check size={16} />}{saving ? 'Salvando…' : 'Confirmar receita'}</button></div>
    </div>
  </Drawer>;
}
