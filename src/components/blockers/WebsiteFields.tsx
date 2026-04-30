import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Plus, Lock } from 'lucide-react'
import type { WebsiteConfig } from '../../../types'

interface Props {
  config: WebsiteConfig
  onChange: (config: WebsiteConfig) => void
  /** Domains that existed when the rule was loaded in edit mode — shown without a remove button. */
  lockedDomains?: string[]
}

function normaliseDomain(raw: string): string {
  return raw.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*/, '')
}

export function WebsiteFields({ config, onChange, lockedDomains = [] }: Props) {
  const [input, setInput] = useState('')

  const add = () => {
    const domain = normaliseDomain(input)
    if (domain && !config.domains.includes(domain)) {
      onChange({ domains: [...config.domains, domain] })
      setInput('')
    }
  }

  const remove = (domain: string) => {
    onChange({ domains: config.domains.filter(d => d !== domain) })
  }

  const isLocked = (domain: string) => lockedDomains.includes(domain)

  return (
    <div className="space-y-3">
      <Label>Domains to block</Label>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="youtube.com"
          className="flex-1"
        />
        <Button type="button" variant="outline" size="icon" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {config.domains.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {config.domains.map(d => (
            <span
              key={d}
              className="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground text-xs px-2.5 py-1"
            >
              {isLocked(d) && <Lock className="h-2.5 w-2.5 text-muted-foreground/60" />}
              {d}
              {!isLocked(d) && (
                <button type="button" onClick={() => remove(d)}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Both <code className="text-primary">domain.com</code> and{' '}
        <code className="text-primary">www.domain.com</code> are blocked automatically
        via the hosts file. Requires admin privileges.
      </p>
    </div>
  )
}
