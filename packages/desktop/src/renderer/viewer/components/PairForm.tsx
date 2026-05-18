import { useState } from 'react'

import type { DiscoveredAgent } from '../../../shared/api-types.js'

export function PairForm({
  selected,
  connectionState,
  onConnect,
  onDisconnect,
}: {
  selected: DiscoveredAgent | undefined
  connectionState: string
  onConnect(target: { host: string; port: number; code: string }): void
  onDisconnect(): void
}): JSX.Element {
  const [manualHost, setManualHost] = useState('')
  const [manualPort, setManualPort] = useState('0')
  const [code, setCode] = useState('')
  const host = selected?.host ?? manualHost.trim()
  const port = selected?.port ?? Number(manualPort)
  const canConnect = host.length > 0 && Number.isInteger(port) && port > 0 && code.trim().length > 0

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (canConnect) {
          onConnect({ host, port, code: code.trim().toUpperCase() })
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Host
          <input
            className="rounded-md border border-slate-300 px-3 py-2 font-normal text-slate-950 disabled:bg-slate-100"
            disabled={selected !== undefined}
            value={host}
            onChange={(event) => setManualHost(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Port
          <input
            className="rounded-md border border-slate-300 px-3 py-2 font-normal text-slate-950 disabled:bg-slate-100"
            disabled={selected !== undefined}
            inputMode="numeric"
            value={String(port || '')}
            onChange={(event) => setManualPort(event.target.value)}
          />
        </label>
      </div>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Pair code
        <input
          className="rounded-md border border-slate-300 px-3 py-2 font-mono text-lg uppercase tracking-widest text-slate-950"
          maxLength={12}
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <button
          className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-300"
          disabled={!canConnect || connectionState === 'connecting'}
          type="submit"
        >
          Connect
        </button>
        <button
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
          type="button"
          onClick={onDisconnect}
        >
          Disconnect
        </button>
      </div>
    </form>
  )
}
