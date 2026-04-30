import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { useGatewaysStore } from '@/stores/gatewaysStore'
import { useRulesStore } from '@/stores/rulesStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { ShieldCheck, Plus, Trash2, Edit2, Lock, AlertTriangle, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GatewayDef } from '../../types'

// ── GatewayCard ──────────────────────────────────────────────────────────────

function GatewayCard({
  gateway,
  usedByCount,
  usedBySettings,
  onEdit,
  onDelete
}: {
  gateway: GatewayDef
  usedByCount: number
  usedBySettings: boolean
  onEdit: (g: GatewayDef) => void
  onDelete: (g: GatewayDef) => void
}) {
  const usageLabels: string[] = []
  if (usedByCount > 0)  usageLabels.push(`${usedByCount} rule${usedByCount !== 1 ? 's' : ''}`)
  if (usedBySettings)   usageLabels.push('settings')

  return (
    <div className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-muted/20 transition-colors">
      <div className="flex-shrink-0 p-2 rounded-md bg-purple-500/10">
        <Lock className="h-4 w-4 text-purple-400" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{gateway.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
          "{gateway.phrase}"
        </p>
        {usageLabels.length > 0 && (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {usedByCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-purple-400/80">
                <Lock className="h-2.5 w-2.5" />
                {usedByCount} rule{usedByCount !== 1 ? 's' : ''}
              </span>
            )}
            {usedBySettings && (
              <span className="inline-flex items-center gap-1 text-xs text-purple-400/80">
                <Settings className="h-2.5 w-2.5" />
                settings
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => onEdit(gateway)}
        >
          <Edit2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(gateway)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ── GatewayForm ──────────────────────────────────────────────────────────────

function GatewayFormDialog({
  open,
  onOpenChange,
  initial,
  onSave
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial?: GatewayDef
  onSave: (name: string, phrase: string) => Promise<void>
}) {
  const [name,   setName]   = useState(initial?.name   ?? '')
  const [phrase, setPhrase] = useState(initial?.phrase ?? '')
  const [saving, setSaving] = useState(false)

  const handleOpen = (v: boolean) => {
    if (!v) { setName(initial?.name ?? ''); setPhrase(initial?.phrase ?? '') }
    onOpenChange(v)
  }

  const handleSave = async () => {
    if (!name.trim() || !phrase.trim()) return
    setSaving(true)
    try { await onSave(name.trim(), phrase.trim()) }
    finally { setSaving(false) }
  }

  const isEdit = !!initial
  const valid  = name.trim().length > 0 && phrase.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-purple-400" />
            {isEdit ? 'Edit gateway' : 'New gateway'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Work commitment"
            />
            <p className="text-xs text-muted-foreground">
              A short label to identify this gateway in rule lists.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Phrase</Label>
            <textarea
              value={phrase}
              onChange={e => setPhrase(e.target.value)}
              placeholder="I will be productive"
              rows={4}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring whitespace-pre-wrap break-words"
            />
            <p className="text-xs text-muted-foreground">
              The exact text that must be typed to pass this gateway. Press Enter for a new line.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!valid || saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create gateway'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── DeleteConfirm ────────────────────────────────────────────────────────────

function DeleteConfirmDialog({
  gateway,
  usedByCount,
  usedBySettings,
  onConfirm,
  onCancel
}: {
  gateway: GatewayDef | null
  usedByCount: number
  usedBySettings: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const usageLabels: string[] = []
  if (usedByCount > 0) usageLabels.push(`${usedByCount} rule${usedByCount !== 1 ? 's' : ''}`)
  if (usedBySettings)  usageLabels.push('the settings lock')

  return (
    <Dialog open={!!gateway} onOpenChange={v => { if (!v) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Delete gateway
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <p className="text-sm text-muted-foreground">
            Delete <strong className="text-foreground">"{gateway?.name}"</strong>?
          </p>
          {usageLabels.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">
                This gateway is currently used by{' '}
                <strong>{usageLabels.join(' and ')}</strong>.
                It will be automatically unlinked when deleted.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

function GatewaysPage() {
  const { gateways, addGateway, updateGateway, removeGateway } = useGatewaysStore()
  const rules             = useRulesStore(s => s.rules)
  const settingsGatewayId = useSettingsStore(s => s.settingsGatewayId)

  const [formOpen,      setFormOpen]      = useState(false)
  const [editTarget,    setEditTarget]    = useState<GatewayDef | undefined>()
  const [deleteTarget,  setDeleteTarget]  = useState<GatewayDef | null>(null)

  const usageCount    = (id: string) => rules.filter(r => r.gatewayIds?.includes(id)).length
  const usedBySettings = (id: string) => id === settingsGatewayId

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAdd = async (name: string, phrase: string) => {
    const gw = await window.api.addGateway({ name, phrase })
    addGateway(gw)
    setFormOpen(false)
  }

  const handleEdit = async (name: string, phrase: string) => {
    if (!editTarget) return
    const updated = await window.api.updateGateway({ id: editTarget.id, name, phrase })
    updateGateway(updated)
    setEditTarget(undefined)
    setFormOpen(false)
  }

  const openEdit = (gw: GatewayDef) => {
    setEditTarget(gw)
    setFormOpen(true)
  }

  const openDelete = (gw: GatewayDef) => setDeleteTarget(gw)

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await window.api.removeGateway(deleteTarget.id)
    removeGateway(deleteTarget.id)
    // Also unlink from rules store locally
    useRulesStore.getState().setRules(
      useRulesStore.getState().rules.map(r => ({
        ...r,
        gatewayIds: r.gatewayIds?.filter(id => id !== deleteTarget.id) ?? []
      }))
    )
    setDeleteTarget(null)
  }

  const closeForm = (open: boolean) => {
    if (!open) setEditTarget(undefined)
    setFormOpen(open)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex flex-col h-full">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h1 className="text-lg font-semibold">Gateways</h1>
            <p className="text-xs text-muted-foreground">
              Named friction layers — assign them to rules or settings to require confirmation before unlocking
            </p>
          </div>
          <Button size="sm" onClick={() => { setEditTarget(undefined); setFormOpen(true) }}>
            <Plus className="h-4 w-4 mr-1.5" />
            New gateway
          </Button>
        </header>

        <div className="flex-1 overflow-auto px-6 py-5">
          {gateways.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className={cn('rounded-full bg-muted p-4')}>
                <ShieldCheck className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No gateways yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Create a gateway and assign it to a rule to add an extra
                  confirmation step before the rule can be manually disabled.
                </p>
              </div>
              <Button onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Create first gateway
              </Button>
            </div>
          ) : (
            <div className="space-y-2 max-w-2xl">
              {gateways.map(gw => (
                <GatewayCard
                  key={gw.id}
                  gateway={gw}
                  usedByCount={usageCount(gw.id)}
                  usedBySettings={usedBySettings(gw.id)}
                  onEdit={openEdit}
                  onDelete={openDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <GatewayFormDialog
        open={formOpen}
        onOpenChange={closeForm}
        initial={editTarget}
        onSave={editTarget ? handleEdit : handleAdd}
      />

      <DeleteConfirmDialog
        gateway={deleteTarget}
        usedByCount={deleteTarget ? usageCount(deleteTarget.id) : 0}
        usedBySettings={deleteTarget ? usedBySettings(deleteTarget.id) : false}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}

export const gatewaysRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/gateways',
  component: GatewaysPage
})
