// Persistent list of saved graphs (localStorage).
// Each graph = { id, name, yaml }. The "current" id is also persisted so
// the same graph re-opens on reload.

import { vueAppDemo } from '../demo/vueAppDemo'
import { pfForumDemo } from '../demo/pfForumDemo'

export interface SavedGraph {
  id: string
  name: string
  yaml: string
}

const KEY = 'glyph:graphs:v1'
const CURRENT_KEY = 'glyph:current-graph:v1'

function newId(): string {
  return (
    'g' +
    Math.random().toString(36).slice(2, 9) +
    Date.now().toString(36).slice(-4)
  )
}

function defaultGraphs(): SavedGraph[] {
  return [
    { id: newId(), name: 'pf-forum · модули', yaml: pfForumDemo },
    { id: newId(), name: 'Vue app · пример', yaml: vueAppDemo },
  ]
}

export function loadGraphs(): { graphs: SavedGraph[]; currentId: string } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as SavedGraph[]
      if (Array.isArray(parsed) && parsed.length) {
        const stored = localStorage.getItem(CURRENT_KEY)
        const currentId =
          parsed.find((g) => g.id === stored)?.id ?? parsed[0]!.id
        return { graphs: parsed, currentId }
      }
    }
  } catch (e) {
    console.warn('[glyph] graph storage parse failed', e)
  }
  const seeded = defaultGraphs()
  persist(seeded, seeded[0]!.id)
  return { graphs: seeded, currentId: seeded[0]!.id }
}

export function persist(graphs: SavedGraph[], currentId: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(graphs))
    localStorage.setItem(CURRENT_KEY, currentId)
  } catch (e) {
    console.warn('[glyph] graph storage save failed', e)
  }
}

const BLANK_YAML = `# Новый граф

nodes:
  - id: a
    title: "A"
    icon: app-window
    rows:
      - { id: out, label: "выход", color: cyan, type: source }
  - id: b
    title: "B"
    icon: app-window
    rows:
      - { id: in, label: "вход", color: cyan, type: target }

edges:
  - { from: a.out, to: b.in, color: cyan }
`

export function createBlankGraph(name = 'Новый граф'): SavedGraph {
  return { id: newId(), name, yaml: BLANK_YAML }
}

export function duplicateGraph(src: SavedGraph): SavedGraph {
  return { id: newId(), name: src.name + ' (копия)', yaml: src.yaml }
}
