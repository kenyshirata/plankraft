/**
 * Diálogos modais do app (confirmações), com API baseada em Promise:
 *
 *   const choice = await askDialog({ title, message, actions: [...] })
 *
 * Retorna o `value` da ação escolhida, ou null se o usuário cancelar (Esc / fora).
 */
import { create } from 'zustand'

export interface DialogAction<T extends string = string> {
  label: string
  value: T
  variant?: 'primary' | 'danger' | 'default'
}

export interface DialogOptions<T extends string = string> {
  title: string
  message: string
  actions: DialogAction<T>[]
}

interface PendingDialog extends DialogOptions {
  resolve(value: string | null): void
}

interface DialogState {
  current: PendingDialog | null
  close(value: string | null): void
}

export const useDialogStore = create<DialogState>()((set, get) => ({
  current: null,
  close: (value) => {
    const cur = get().current
    set({ current: null })
    cur?.resolve(value)
  }
}))

export function askDialog<T extends string>(options: DialogOptions<T>): Promise<T | null> {
  // Um diálogo novo cancela o anterior (não deve acontecer, mas evita promessas penduradas).
  useDialogStore.getState().current?.resolve(null)
  return new Promise((resolve) => {
    useDialogStore.setState({ current: { ...options, resolve: (v) => resolve(v as T | null) } })
  })
}

/** Atalho para confirmação simples (Confirmar / Cancelar). */
export async function confirmDialog(title: string, message: string, confirmLabel = 'Confirmar', danger = false): Promise<boolean> {
  const r = await askDialog({
    title,
    message,
    actions: [
      { label: 'Cancelar', value: 'cancel' },
      { label: confirmLabel, value: 'ok', variant: danger ? 'danger' : 'primary' }
    ]
  })
  return r === 'ok'
}
