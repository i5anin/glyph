// Persistent list of saved graphs (localStorage).
// Each graph = { id, name, yaml, seed? }. The "current" id is also persisted so
// the same graph re-opens on reload.
//
// Seed graphs ship with the app and identify themselves via `seed: string`.
// User-created or duplicated graphs have no `seed` tag and are never touched
// on load. Seeds get two automatic conveniences:
//   1) backfilled if the user's storage doesn't have them yet (new seeds added
//      after upgrade);
//   2) rescued if their YAML no longer parses (after an analyzer regen the
//      stored copy can become inconsistent with the latest demo content).

import { vueAppDemo } from '../demo/vueAppDemo'
import { pfForumDemo } from '../demo/pfForumDemo'
import { softPfforumDemo } from '../demo/softPfforumDemo'
import { parseDsl } from '../dsl/parse'

export interface SavedGraph {
  id: string
  name: string
  yaml: string
  /** Tag that identifies built-in demo seeds. User graphs leave this empty. */
  seed?: string
}

const KEY = 'glyph:graphs:v1'
const CURRENT_KEY = 'glyph:current-graph:v1'
const SCHEMA_VERSION_KEY = 'glyph:schema-version'

// Bump when seed demos change in a way that the user must see (palette change,
// new layer, fixed group references). On boot, if the stored version is older,
// we wipe all seed-tagged graphs from storage and re-seed from source. User
// graphs (no `seed` tag — those created via "+ New" or duplicate) survive.
const SCHEMA_VERSION = 3

function newId(): string {
  return (
    'g' +
    Math.random().toString(36).slice(2, 9) +
    Date.now().toString(36).slice(-4)
  )
}

interface SeedDescriptor {
  seed: string
  name: string
  yaml: string
}

const SEED_DESCRIPTORS: SeedDescriptor[] = [
  { seed: 'pfForum', name: 'pf-forum · модули', yaml: pfForumDemo },
  { seed: 'softPfforum', name: 'soft.pfforum · vue (window-globals)', yaml: softPfforumDemo },
  { seed: 'vueApp', name: 'Vue app · пример', yaml: vueAppDemo },
]

function defaultGraphs(): SavedGraph[] {
  return SEED_DESCRIPTORS.map((s) => ({
    id: newId(),
    name: s.name,
    yaml: s.yaml,
    seed: s.seed,
  }))
}

function isYamlValid(yaml: string): boolean {
  try {
    parseDsl(yaml)
    return true
  } catch {
    return false
  }
}

export function loadGraphs(): { graphs: SavedGraph[]; currentId: string } {
  try {
    // ── Schema-version migration ───────────────────────────────────────
    // If the stored version is older than the current SCHEMA_VERSION, we
    // discard any seed-tagged graphs and re-seed. User-owned graphs (no
    // `seed` tag) are kept untouched.
    const storedVer = parseInt(
      localStorage.getItem(SCHEMA_VERSION_KEY) ?? '0',
      10,
    )
    if (storedVer < SCHEMA_VERSION) {
      const raw = localStorage.getItem(KEY)
      let userGraphs: SavedGraph[] = []
      if (raw) {
        try {
          const arr = JSON.parse(raw) as SavedGraph[]
          if (Array.isArray(arr)) userGraphs = arr.filter((g) => !g.seed)
        } catch {
          /* fall through */
        }
      }
      const seeded = defaultGraphs()
      const merged = [...seeded, ...userGraphs]
      const currentId = seeded[0]!.id
      persist(merged, currentId)
      localStorage.setItem(SCHEMA_VERSION_KEY, String(SCHEMA_VERSION))
      console.info(
        `[glyph] schema migrated to v${SCHEMA_VERSION} — seeds refreshed (kept ${userGraphs.length} user graph(s))`,
      )
      return { graphs: merged, currentId }
    }

    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as SavedGraph[]
      if (Array.isArray(parsed) && parsed.length) {
        let mutated = false
        const seedByName = new Map(SEED_DESCRIPTORS.map((s) => [s.name, s]))
        const seedByTag = new Map(SEED_DESCRIPTORS.map((s) => [s.seed, s]))

        // Walk existing graphs:
        //  - back-tag any older seed entries by NAME (so saved graphs from
        //    pre-`seed` versions get rescued too);
        //  - rescue any seed whose stored YAML no longer parses by replacing
        //    it with the current demo source. User-created graphs (no seed
        //    tag) are NEVER touched.
        for (let i = 0; i < parsed.length; i++) {
          const g = parsed[i]!
          if (!g.seed) {
            const matched = seedByName.get(g.name)
            if (matched) {
              parsed[i] = { ...g, seed: matched.seed }
              mutated = true
            }
          }
          const after = parsed[i]!
          if (after.seed && !isYamlValid(after.yaml)) {
            const fresh = seedByTag.get(after.seed)
            if (fresh) {
              parsed[i] = { ...after, yaml: fresh.yaml }
              mutated = true
              console.info(
                `[glyph] seed "${fresh.name}" YAML was broken — restored from source`,
              )
            }
          }
        }

        // Backfill any seed not yet present.
        const presentSeeds = new Set(
          parsed.map((g) => g.seed).filter(Boolean) as string[],
        )
        for (const s of SEED_DESCRIPTORS) {
          if (!presentSeeds.has(s.seed)) {
            parsed.push({
              id: newId(),
              name: s.name,
              yaml: s.yaml,
              seed: s.seed,
            })
            mutated = true
          }
        }

        const stored = localStorage.getItem(CURRENT_KEY)
        const currentId =
          parsed.find((g) => g.id === stored)?.id ?? parsed[0]!.id
        if (mutated) persist(parsed, currentId)
        return { graphs: parsed, currentId }
      }
    }
  } catch (e) {
    console.warn('[glyph] graph storage parse failed', e)
  }
  const seeded = defaultGraphs()
  persist(seeded, seeded[0]!.id)
  localStorage.setItem(SCHEMA_VERSION_KEY, String(SCHEMA_VERSION))
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
  // A duplicate is the user's own graph from then on — drop the seed tag so
  // it never gets refreshed/rescued from source.
  return { id: newId(), name: src.name + ' (копия)', yaml: src.yaml }
}
