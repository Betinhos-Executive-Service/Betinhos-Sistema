import { Button } from '@betinhos-executive-service/ui'
import { CreditCard } from 'lucide-react'

export function StickyActionBar({ hint, ready, saving, onSave, label }: { hint: string; ready: boolean; saving: boolean; onSave: () => void; label: string }) {
  return <footer className="sticky-action-bar">
    <span className={`action-status ${ready ? 'is-ready' : ''}`}>{hint}</span>
    <Button variant="primary" icon={<CreditCard size={18} />} loading={saving} aria-disabled={!ready || undefined} className={ready ? undefined : 'is-unavailable'} onClick={onSave}>
      {saving ? 'Processando...' : label}
    </Button>
  </footer>
}
