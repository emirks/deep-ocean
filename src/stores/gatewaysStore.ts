import { create } from 'zustand'
import type { GatewayDef } from '../../types'

interface GatewaysState {
  gateways: GatewayDef[]
  loaded: boolean
  setGateways:    (gateways: GatewayDef[]) => void
  addGateway:     (gateway: GatewayDef) => void
  updateGateway:  (updated: GatewayDef) => void
  removeGateway:  (id: string) => void
}

export const useGatewaysStore = create<GatewaysState>((set) => ({
  gateways: [],
  loaded:   false,
  setGateways:   (gateways) => set({ gateways, loaded: true }),
  addGateway:    (gateway)  => set((s) => ({ gateways: [...s.gateways, gateway] })),
  updateGateway: (updated)  => set((s) => ({
    gateways: s.gateways.map(g => g.id === updated.id ? updated : g)
  })),
  removeGateway: (id)       => set((s) => ({
    gateways: s.gateways.filter(g => g.id !== id)
  }))
}))
