'use client'

import { useState } from 'react'
import { Check, Trash2, ListTodo } from 'lucide-react'
import { useTasks, useUpdateTask, useDeleteTask } from '@/lib/hooks'
import type { Task } from '@/lib/types'
import { cn } from '@/lib/utils'
import { priority as priorityStatus } from '@/lib/status'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TaskDialog } from '@/components/tasks/task-dialog'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

const FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'completed', label: 'Completadas' },
]

export default function TasksPage() {
  const [status, setStatus] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const { data, isLoading } = useTasks(status || undefined)
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const tasks = data ?? []

  function toggle(t: Task) {
    updateTask.mutate({ id: t.id, input: { status: t.status === 'completed' ? 'pending' : 'completed' } })
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="eyebrow">Operaciones</p>
          <h1 className="text-3xl font-semibold tracking-tight">Tareas</h1>
        </div>
        <Button onClick={() => setNewOpen(true)}>Nueva Tarea</Button>
      </div>

      <Tabs value={status} onValueChange={setStatus} className="mb-4">
        <TabsList className="h-auto rounded-lg bg-muted/60 p-1">
          {FILTERS.map((f) => (
            <TabsTrigger
              key={f.value}
              value={f.value}
              className="rounded-md px-3 py-1.5 text-sm font-medium data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-2">
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
            </div>
          ) : tasks.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyIllustration icon={ListTodo} />
                <EmptyTitle>Sin Tareas</EmptyTitle>
                <EmptyDescription>No hay tareas que coincidan con el filtro seleccionado.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={() => setNewOpen(true)}>Nueva Tarea</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <ul className="divide-y">
              {tasks.map((t) => (
                <li key={t.id} className="group flex items-center gap-3 px-3 py-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggle(t)}
                    className={cn(
                      'h-5 w-5 flex-shrink-0 rounded border transition-colors',
                      t.status === 'completed' ? 'border-signal bg-signal text-signal-foreground hover:bg-signal' : 'border-input hover:border-primary hover:bg-transparent',
                    )}
                    aria-label="Completar"
                  >
                    {t.status === 'completed' && <Check className="h-3.5 w-3.5" />}
                  </Button>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm font-medium', t.status === 'completed' && 'text-muted-foreground line-through')}>
                      {t.title}
                    </p>
                    {t.dueDate && (
                      <p className="font-mono text-xs text-muted-foreground">
                        Vence {new Date(t.dueDate).toLocaleString('es')}
                      </p>
                    )}
                  </div>
                  {(() => {
                    const { kind, label } = priorityStatus(t.priority)
                    return <StatusBadge kind={kind}>{label}</StatusBadge>
                  })()}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteTask.mutate(t.id)}
                    className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <TaskDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}
