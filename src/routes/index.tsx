import { createRoute, useNavigate } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { useRulesStore } from '@/stores/rulesStore'
import { RuleCard } from '@/components/RuleCard'
import { Button } from '@/components/ui/button'
import { PlusCircle, Power, Waves } from 'lucide-react'
import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'

function Dashboard() {
  const rules = useRulesStore(s => s.rules)
  const setRules = useRulesStore(s => s.setRules)
  const setEnabled = useRulesStore(s => s.setEnabled)
  const navigate = useNavigate()
  const [disableAllOpen, setDisableAllOpen] = useState(false)
  const [disabling, setDisabling] = useState(false)

  const handleDisableAll = async () => {
    const toDisable = useRulesStore.getState().rules.filter(r => r.enabled)
    setDisabling(true)
    try {
      for (const r of toDisable) {
        setEnabled(r.id, false)
        await window.api.disableRule(r.id)
      }
      const synced = await window.api.syncRules()
      setRules(synced)
      setDisableAllOpen(false)
    } finally {
      setDisabling(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Topbar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            {rules.filter(r => r.enabled).length} active · {rules.length} total rules
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rules.some(r => r.enabled) && (
            <Button variant="outline" size="sm" onClick={() => setDisableAllOpen(true)}>
              <Power className="h-4 w-4 mr-1.5" />
              Disable all
            </Button>
          )}
          <Button size="sm" onClick={() => navigate({ to: '/add-rule' })}>
            <PlusCircle className="h-4 w-4 mr-1.5" />
            Add Rule
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-5">
        {rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="rounded-full bg-muted p-4">
              <Waves className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No rules yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add your first rule to start blocking distractions.
              </p>
            </div>
            <Button onClick={() => navigate({ to: '/add-rule' })}>
              <PlusCircle className="h-4 w-4 mr-1.5" />
              Add First Rule
            </Button>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {rules.map(rule => (
              <RuleCard key={rule.id} rule={rule} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={disableAllOpen} onOpenChange={setDisableAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable all rules</DialogTitle>
            <DialogDescription>
              Every active rule will be turned off and its OS locks removed. You can enable rules again from each card.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableAllOpen(false)} disabled={disabling}>
              Cancel
            </Button>
            <Button onClick={handleDisableAll} disabled={disabling}>
              {disabling ? 'Disabling…' : 'Disable all'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Dashboard
})
