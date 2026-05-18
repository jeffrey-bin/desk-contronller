import { createRoot } from 'react-dom/client'

import '../../styles.css'

function HudApp(): JSX.Element {
  return (
    <main className="grid min-h-screen place-items-center bg-emerald-600/90 px-3 text-white">
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-wide">Sharing</p>
        <p className="text-sm font-semibold">Desk Controller</p>
      </div>
    </main>
  )
}

const root = document.getElementById('root')

if (root !== null) {
  createRoot(root).render(<HudApp />)
}
