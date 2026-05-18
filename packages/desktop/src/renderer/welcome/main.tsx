import { createRoot } from 'react-dom/client'

import '../styles.css'
import { WelcomeApp } from './App.js'

const root = document.getElementById('root')

if (root !== null) {
  createRoot(root).render(<WelcomeApp />)
}
