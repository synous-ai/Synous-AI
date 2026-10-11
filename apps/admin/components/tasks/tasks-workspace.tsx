'use client'

import { useState } from 'react'
import { PillTabs } from '@/components/ui/pill-tabs'
import { ProcessesView } from '@/components/processes/processes-view'
import { TasksView } from '@/components/tasks/tasks-view'

type Section = 'tasks' | 'processes'

/** /admin/tasks: pestañas de primer nivel "Tareas" y "Procesos". */
export function TasksWorkspace(): React.JSX.Element {
  const [section, setSection] = useState<Section>('tasks')
  const tabs = (
    <PillTabs<Section>
      tabs={[
        { key: 'tasks', label: 'Tareas' },
        { key: 'processes', label: 'Procesos' },
      ]}
      active={section}
      onChange={setSection}
    />
  )
  return section === 'tasks' ? <TasksView tabs={tabs} /> : <ProcessesView tabs={tabs} />
}
