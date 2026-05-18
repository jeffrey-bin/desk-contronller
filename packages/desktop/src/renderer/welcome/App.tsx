import { getWelcomeApi } from '../shared/api.js'
import { log } from '../shared/log.js'
import { useWelcomeStore } from './store.js'

type WelcomeMode = 'agent' | 'viewer'

const choices: Array<{
  mode: WelcomeMode
  label: string
  detail: string
  accent: string
}> = [
  {
    mode: 'agent',
    label: 'Share this desktop',
    detail: 'Show a pairing code and wait for one Viewer.',
    accent: 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-400',
  },
  {
    mode: 'viewer',
    label: 'Control another desktop',
    detail: 'Find an Agent on the local network and connect.',
    accent: 'border-blue-200 bg-blue-50 text-blue-900 hover:border-blue-400',
  },
]

export function WelcomeApp(): JSX.Element {
  const pendingMode = useWelcomeStore((state) => state.pendingMode)
  const error = useWelcomeStore((state) => state.error)
  const setPendingMode = useWelcomeStore((state) => state.setPendingMode)
  const setError = useWelcomeStore((state) => state.setError)

  async function pickMode(mode: WelcomeMode): Promise<void> {
    setPendingMode(mode)
    setError(undefined)

    try {
      await getWelcomeApi().pickMode(mode)
    } catch (cause) {
      log.error('Failed to pick mode', cause)
      setError('Mode switch failed. Try again.')
      setPendingMode(undefined)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-3xl flex-col justify-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Desk Controller
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Choose how this app starts</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
          Pick one role for this Electron instance. You can switch later from settings.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {choices.map((choice) => {
            const isPending = pendingMode === choice.mode
            const disabled = pendingMode !== undefined

            return (
              <button
                className={`rounded-lg border p-5 text-left shadow-sm transition ${choice.accent} disabled:cursor-not-allowed disabled:opacity-60`}
                disabled={disabled}
                key={choice.mode}
                type="button"
                onClick={() => void pickMode(choice.mode)}
              >
                <span className="block text-lg font-semibold">
                  {isPending ? 'Opening...' : choice.label}
                </span>
                <span className="mt-3 block text-sm leading-6 text-slate-700">{choice.detail}</span>
              </button>
            )
          })}
        </div>

        {error !== undefined ? (
          <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  )
}
