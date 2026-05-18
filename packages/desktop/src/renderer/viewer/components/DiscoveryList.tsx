import type { DiscoveredAgent } from '../../../shared/api-types.js'

export function DiscoveryList({
  agents,
  selected,
  onSelect,
}: {
  agents: DiscoveredAgent[]
  selected: DiscoveredAgent | undefined
  onSelect(agent: DiscoveredAgent): void
}): JSX.Element {
  return (
    <div className="grid gap-2">
      {agents.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">
          No agents found
        </p>
      ) : (
        agents.map((agent) => (
          <button
            className={`rounded-md border px-3 py-3 text-left text-sm ${
              selected?.id === agent.id
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200 bg-white text-slate-900 hover:border-slate-400'
            }`}
            key={agent.id}
            type="button"
            onClick={() => onSelect(agent)}
          >
            <span className="block font-medium">{agent.name}</span>
            <span className="mt-1 block text-xs opacity-75">
              {agent.host}:{agent.port}
            </span>
          </button>
        ))
      )}
    </div>
  )
}
