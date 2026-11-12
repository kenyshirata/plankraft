import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { isAllowedNavigation } from './window'

/**
 * Valida que a chamada IPC veio do frame do próprio app (defesa em profundidade
 * caso algum conteúdo externo seja carregado no futuro).
 */
export function assertTrustedSender(event: IpcMainInvokeEvent | IpcMainEvent): void {
  const url = event.senderFrame?.url ?? ''
  if (!isAllowedNavigation(url)) {
    throw new Error(`IPC bloqueado: origem não confiável (${url})`)
  }
}
