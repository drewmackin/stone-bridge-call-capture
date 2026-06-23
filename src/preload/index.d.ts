import type { StoneBridgeAPI } from '@shared/ipc'

declare global {
  interface Window {
    stoneBridge: StoneBridgeAPI
  }
}

export {}
