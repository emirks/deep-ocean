import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { X, Plus } from 'lucide-react'
import type { WebsiteConfig } from '../../../types'

interface Props {
  config: WebsiteConfig
  onChange: (config: WebsiteConfig) => void
}

export function WebsiteFields({ config, onChange }: Props) {
  const [input, setInput] = useState('')

  const add = () => {
    const domain = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*/, '')
    if (domain && !config.domains.includes(domain)) {
      onChange({ domains: [...config.domains, domain] })
      setInput('')
    }
  }

  const remove = (domain: string) => {
    onChange({ domains: config.domains.filter(d => d !== domain) })
  }

  return (
    <div className="space-y-3">
      <Badge variant="outline" className="text-yellow-400 border-yellow-400/30 bg-yellow-400/10">
        Coming in v2
      </Badge>
      <div className="space-y-2 opacity-60 pointer-events-none">
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
        <div className="flex flex-wrap gap-1.5 pt-1">
          {config.domains.map(d => (
            <span key={d} className="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground text-xs px-2.5 py-1">
              {d}
              <button type="button" onClick={() => remove(d)}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Website blocking via hosts file will be available in v2.</p>
    </div>
  )
}
