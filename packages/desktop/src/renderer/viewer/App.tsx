import { useCallback, useEffect, useRef, useState } from 'react'

import { getViewerApi } from '../shared/api.js'
import { DiscoveryList } from './components/DiscoveryList.js'
import { PairForm } from './components/PairForm.js'
import { StreamView } from './components/StreamView.js'
import { createViewerPeerController, type ViewerPeerController } from './pc-controller.js'
import { useViewerStore } from './store.js'

export function App(): JSX.Element {
  const api = getViewerApi()
  const [controller, setController] = useState<ViewerPeerController>()
  const controllerRef = useRef<ViewerPeerController>()
  const {
    agents,
    selected,
    connectionState,
    error,
    stream,
    stats,
    setAgents,
    selectAgent,
    setStream,
    setStats,
    setError,
    applyEvent,
  } = useViewerStore()
  const resetController = useCallback(async (): Promise<ViewerPeerController> => {
    controllerRef.current?.stop()
    controllerRef.current = undefined
    setController(undefined)
    setStream(undefined)

    const nextController = await createViewerPeerController({
      api,
      onStream: setStream,
      onStats: setStats,
    })
    controllerRef.current = nextController
    setController(nextController)
    return nextController
  }, [api, setStats, setStream])

  useEffect(() => {
    let mounted = true
    void api.discoverAgents().then((nextAgents) => {
      if (mounted) {
        setAgents(nextAgents)
      }
    })

    const unsubscribe = api.onEvent((event) => {
      applyEvent(event)
      if (
        event.type === 'connection-state' &&
        (event.state === 'failed' || event.state === 'disconnected')
      ) {
        void resetController()
      }
    })

    void resetController().then((nextController) => {
      if (!mounted) {
        nextController.stop()
        return
      }
      controllerRef.current = nextController
      setController(nextController)
    })

    return () => {
      mounted = false
      unsubscribe()
      controllerRef.current?.stop()
      controllerRef.current = undefined
    }
  }, [api, applyEvent, resetController, setAgents])

  return (
    <main className="flex h-screen min-h-[560px] bg-[#f7f8fa] text-slate-950">
      <aside className="flex w-80 shrink-0 flex-col gap-5 border-r border-slate-200 bg-white px-5 py-5">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-blue-700">Viewer</p>
          <h1 className="mt-2 text-2xl font-semibold">Remote desktop</h1>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-600">Status</span>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
            {connectionState}
          </span>
        </div>
        <DiscoveryList agents={agents} selected={selected} onSelect={selectAgent} />
        <PairForm
          selected={selected}
          connectionState={connectionState}
          onConnect={(target) => {
            setError('')
            void (async () => {
              await resetController()
              await api.connect(target.host, target.port, target.code)
            })().catch((connectError: unknown) => {
              setError(connectError instanceof Error ? connectError.message : 'Connection failed')
            })
          }}
          onDisconnect={() => {
            controllerRef.current?.stop()
            setStream(undefined)
            void api.disconnect().finally(() => {
              void resetController()
            })
          }}
        />
        {error.length > 0 ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col p-5">
        <StreamView controller={controller} stats={stats} stream={stream} />
      </div>
    </main>
  )
}
