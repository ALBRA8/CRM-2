'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ListChecks, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

/**
 * Tareas prioritarias (cierre integral, bloque C).
 * Widget del dashboard: lista abiertas con vencimiento y prioridad,
 * permite crear con un clic y completar marcando el checkbox.
 */

interface Task {
  id: string
  title: string
  dueAt: string | null
  priority: string
  status: string
}

export function TasksCard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = (await api.listTasks({ status: 'open', limit: '8' })) as { tasks: Task[] }
      setTasks(data.tasks ?? [])
    } catch {
      // Fallo no crítico: el resto del dashboard sigue funcionando
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const addTask = async () => {
    const title = newTitle.trim()
    if (!title || adding) return
    setAdding(true)
    try {
      await api.createTask({ title })
      setNewTitle('')
      await load()
    } catch {
      toast.error('No se pudo crear la tarea')
    } finally {
      setAdding(false)
    }
  }

  const complete = async (t: Task) => {
    try {
      await api.updateTask(t.id, { status: 'done' })
      setTasks((ts) => ts.filter((x) => x.id !== t.id))
    } catch {
      toast.error('No se pudo completar la tarea')
    }
  }

  return (
    <Card className="border-0 shadow-sm bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-emerald-600" />
          Tareas prioritarias
        </CardTitle>
        <p className="text-xs text-slate-400">Abiertas ordenadas por vencimiento</p>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-3">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addTask()
            }}
            placeholder="Nueva tarea (ej. Llamar al cliente para confirmar)"
            className="h-9 text-sm"
            maxLength={200}
          />
          <Button size="sm" className="h-9 px-3 gap-1 flex-shrink-0" onClick={addTask} disabled={adding || !newTitle.trim()}>
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Añadir
          </Button>
        </div>
        {loading ? (
          <div className="py-6 text-center text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" />
            Cargando tareas…
          </div>
        ) : tasks.length > 0 ? (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                <Checkbox onCheckedChange={() => complete(t)} aria-label={`Completar ${t.title}`} className="flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{t.title}</p>
                  <p className="text-xs text-slate-500">
                    {t.dueAt ? `Vence ${format(new Date(t.dueAt), "d MMM, HH:mm", { locale: es })}` : 'Sin fecha límite'}
                  </p>
                </div>
                {t.priority === 'alta' && (
                  <Badge variant="secondary" className="text-xs bg-red-50 text-red-700 border-0 flex-shrink-0">
                    Alta
                  </Badge>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-slate-400 text-sm">
            <ListChecks className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            Sin tareas abiertas. Añade la primera arriba.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
