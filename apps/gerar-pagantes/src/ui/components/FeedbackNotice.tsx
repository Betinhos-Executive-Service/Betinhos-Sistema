import { Alert } from '@betinhos-executive-service/ui'

export function FeedbackNotice({ tone, text }: { tone: 'error' | 'success'; text: string }) {
  return <Alert tone={tone === 'error' ? 'danger' : 'success'} role={tone === 'error' ? 'alert' : 'status'}>{text}</Alert>
}
