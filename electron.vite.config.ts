import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * electron-vite compila os três alvos do Electron a partir de src/:
 *  - main     → src/main/index.ts      (Node, acesso a fs/dialog/IA)
 *  - preload  → src/preload/index.ts   (ponte segura via contextBridge)
 *  - renderer → src/renderer/index.html (React + Konva, sem acesso a Node)
 */
const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared }
  },
  preload: {
    resolve: { alias: shared }
  },
  renderer: {
    resolve: {
      alias: {
        ...shared,
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
