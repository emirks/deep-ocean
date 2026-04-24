import { createRoute, useNavigate } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { useRulesStore } from '@/stores/rulesStore'
import { RuleCard } from '@/components/RuleCard'
import { Button } from '@/components/ui/button'
import { PlusCircle, PauseCircle, Waves } from 'lucide-react'
import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function Dashboard() {
  const rules = useRulesStore(s => s.rules)
  const navigate = useNavigate()
  const [pauseOpen, setPauseOpen] = useState(false)
  const [pauseMinutes, setPauseMinutes] = useState('30')

  const handlePauseAll = async () => {
    await window.api.pauseAll(Number(pauseMinutes))
    setPauseOpen(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Topbar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            {rules.filter(r => r.status === 'blocked').length} blocked · {rules.length} total rules
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rules.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setPauseOpen(true)}>
              <PauseCircle className="h-4 w-4 mr-1.5" />
              Pause All
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

      {/* Pause All Dialog */}
      <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause All Rules</DialogTitle>
            <DialogDescription>
              Temporarily unblock everything. Rules will re-engage automatically after the duration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Duration (minutes)</Label>
            <Input
              type="number"
              min={1}
              max={480}
              value={pauseMinutes}
              onChange={e => setPauseMinutes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPauseOpen(false)}>Cancel</Button>
            <Button onClick={handlePauseAll}>Pause for {pauseMinutes} min</Button>
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
