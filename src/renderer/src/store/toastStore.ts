import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastState {
  toasts: Toast[]
  push(kind: ToastKind, message: string, durationMs?: number): void
  dismiss(id: number): void
}

let nextId = 1

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (kind, message, durationMs = 3200) => {
    // Evita empilhar a mesma mensagem repetidas vezes.
    if (get().toasts.some((t) => t.message === message)) return
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }].slice(-4) }))
    window.setTimeout(() => get().dismiss(id), durationMs)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

/** Atalho para uso fora de componentes: toast.warning('...') */
export const toast = {
  info: (m: string) => useToastStore.getState().push('info', m),
  success: (m: string) => useToastStore.getState().push('success', m),
  warning: (m: string) => useToastStore.getState().push('warning', m, 6000),
  error: (m: string) => useToastStore.getState().push('error', m, 5000)
}
