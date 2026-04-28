import { create } from 'zustand'
import type { Rule, RuleStatus } from '../../types'

interface RulesState {
  rules: Rule[]
  loading: boolean
  setRules:      (rules: Rule[]) => void
  addRule:       (rule: Rule) => void
  removeRule:    (id: string) => void
  updateStatus:  (id: string, status: RuleStatus) => void
  setEnabled:    (id: string, enabled: boolean) => void
  setLoading:    (loading: boolean) => void
}

export const useRulesStore = create<RulesState>((set) => ({
  rules: [],
  loading: false,
  setRules:     (rules)          => set({ rules }),
  addRule:      (rule)           => set((s) => ({ rules: [...s.rules, rule] })),
  removeRule:   (id)             => set((s) => ({ rules: s.rules.filter(r => r.id !== id) })),
  updateStatus: (id, status)     => set((s) => ({
    rules: s.rules.map(r => r.id === id ? { ...r, status } : r)
  })),
  setEnabled:   (id, enabled)    => set((s) => ({
    rules: s.rules.map(r => r.id === id ? { ...r, enabled } : r)
  })),
  setLoading:   (loading)        => set({ loading })
}))
