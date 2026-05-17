# Glyph

> Architecture as glyphs — text DSL into a live animated graph.

A prototype for visualizing project architecture in the visual language of node-editor games
(specifically [Upload Labs](https://store.steampowered.com/app/3606890/Upload_Labs/)): dark canvas,
rectangular module-nodes with progress bars, neon connections, animated flow particles running along the wires.

## What's inside

- **YAML DSL** on the left, **live graph** on the right
- Three node primitives:
  - `obstruction` — module with header, rows (each row = labeled port with a handle), optional progress bar and footer
  - `junction` — branching point on a wire (4 sides, source + target on each)
  - `group` — dashed container that wraps several nodes
- Animated edges via SVG `stroke-dasharray` + `@keyframes` (no WebGL)
- Auto-layout via [dagre](https://github.com/dagrejs/dagre) (LR ranking)
- Built on [Vue Flow](https://vueflow.dev)

## Run

```sh
npm install
npm run dev
```

Open <http://127.0.0.1:5173>.

## DSL example

```yaml
groups:
  - { id: data, title: "Data Layer", color: magenta }

junctions:
  - { id: J1, color: cyan }

nodes:
  - id: app
    title: "App.vue"
    icon: app-window
    rows:
      - { id: routes, icon: route, label: "Routes", value: "12", color: cyan, type: source }
    progress: { current: 78, max: 100, color: green }
    footer:   { label: "Upgrade", price: 120 }

  - id: pinia
    title: "Pinia"
    icon: database
    group: data        # member of the "data" group
    rows:
      - { id: in, label: "Stores in", value: "4", color: green, type: target }

edges:
  - { from: app.routes, to: J1.l, color: cyan }     # into junction (left)
  - { from: J1.r,       to: api.req, color: cyan }  # branch right
  - { from: J1.b,       to: pinia.in, color: cyan } # branch down
```

| Endpoint reference | Meaning |
|---|---|
| `nodeId.rowId` | a specific row's handle on a regular node |
| `junctionId.l \| r \| t \| b` | left / right / top / bottom side of a junction |

## Status

Prototype. Not yet:

- automatic introspection of Vue / Node / Python projects
- file watcher, IDE / GitHub integrations
- additional themes (Factorio, Cyberpunk)
- export to PNG / SVG / embed

## Stack

Vue 3 (Composition API) · TypeScript · Vite · Vue Flow · dagre · js-yaml · lucide
