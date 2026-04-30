import { createRoute, useNavigate } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { useRulesStore } from '@/stores/rulesStore'
import { RuleCard } from '@/components/RuleCard'
import { Button } from '@/components/ui/button'
import { PlusCircle, Waves } from 'lucide-react'

function Dashboard() {
  const rules = useRulesStore(s => s.rules)
  const navigate = useNavigate()

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
        <Button size="sm" onClick={() => navigate({ to: '/add-rule' })}>
          <PlusCircle className="h-4 w-4 mr-1.5" />
          Add Rule
        </Button>
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
    </div>
  )
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Dashboard
})
