/// <reference types="vite/client" />
import type { PlanKraftApi } from '@shared/ipc'

declare global {
  interface Window {
    /** API segura exposta pelo preload (src/preload/index.ts). */
    api: PlanKraftApi
  }
}

export {}
