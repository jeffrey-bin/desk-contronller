import { create } from 'zustand'

type WelcomeMode = 'agent' | 'viewer'

type WelcomeState = {
  pendingMode: WelcomeMode | undefined
  error: string | undefined
  setPendingMode(mode: WelcomeMode | undefined): void
  setError(error: string | undefined): void
}

export const useWelcomeStore = create<WelcomeState>((set) => ({
  pendingMode: undefined,
  error: undefined,
  setPendingMode: (pendingMode) => set({ pendingMode }),
  setError: (error) => set({ error }),
}))
