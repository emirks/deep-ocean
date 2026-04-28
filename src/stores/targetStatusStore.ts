import { create } from 'zustand'
import type { TargetStatus } from '../../types'

interface TargetStatusState {
  /** ruleId → array of per-target statuses */
  statuses: Record<string, TargetStatus[]>
  setAll: (all: Record<string, TargetStatus[]>) => void
  setForRule: (ruleId: string, targets: TargetStatus[]) => void
}

export const useTargetStatusStore = create<TargetStatusState>((set) => ({
  statuses: {},
  setAll:     (all)             => set({ statuses: all }),
  setForRule: (ruleId, targets) => set(s => ({
    statuses: { ...s.statuses, [ruleId]: targets }
  }))
}))
