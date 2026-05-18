type StatusBadgeProps = {
  state: 'pairing' | 'connecting' | 'active' | 'disconnecting' | 'unknown'
}

const styles: Record<StatusBadgeProps['state'], string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  connecting: 'border-blue-200 bg-blue-50 text-blue-700',
  disconnecting: 'border-amber-200 bg-amber-50 text-amber-700',
  pairing: 'border-slate-200 bg-white text-slate-700',
  unknown: 'border-slate-200 bg-slate-100 text-slate-600',
}

export function StatusBadge({ state }: StatusBadgeProps): JSX.Element {
  return (
    <span className={`rounded-md border px-2.5 py-1 text-sm font-medium ${styles[state]}`}>
      {state}
    </span>
  )
}
