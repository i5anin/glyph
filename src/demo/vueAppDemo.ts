export const vueAppDemo = `# Glyph DSL — Vue app, с группой и точкой ветвления.
# Связи:  edges.from/to = "nodeId.rowId" или "junctionId.l|r|t|b".
# Junctions — точки на проводах, через которые проходит поток.
# Groups   — контейнеры, оборачивающие несколько нод.

groups:
  - { id: data, title: "Data Layer", color: magenta }

nodes:
  - id: app
    title: "App.vue"
    icon: app-window
    rows:
      - { id: routes, icon: route,    label: "Маршруты", value: "12", color: cyan,  type: source }
      - { id: stores, icon: database, label: "Сторы",    value: "4",  color: green, type: source }
    progress: { current: 78, max: 100, label: "Init", color: green }
    footer:   { label: "Улучшить", price: 120 }

  - id: router
    title: "Vue Router"
    icon: route
    rows:
      - { id: in,    icon: download, label: "Routes in", value: "12 [0.08/s]", color: cyan,  type: target }
      - { id: pages, icon: file,     label: "Страницы",   value: "8",           color: green, type: source }
    progress: { current: 65, max: 100, color: cyan }

  - id: pinia
    title: "Pinia"
    icon: database
    group: data
    rows:
      - { id: in,    icon: download, label: "Сторы in", value: "4",  color: green, type: target }
      - { id: state, icon: box,      label: "State",    value: "32", color: cyan,  type: source }

  - id: api
    title: "API Client"
    icon: cloud
    group: data
    rows:
      - { id: req, icon: upload,   label: "Requests",  value: "8.00/s", color: cyan,  type: source }
      - { id: res, icon: download, label: "Responses", value: "7.95/s", color: green, type: target }
    progress: { current: 81, max: 100, color: cyan }
    footer:   { label: "Boost", price: 500, color: orange }

  - id: db
    title: "Database"
    icon: server
    rows:
      - { id: read,  icon: download, label: "Reads",  value: "1.2k/s", color: green, type: target }
      - { id: write, icon: upload,   label: "Writes", value: "180/s",  color: cyan,  type: target }

# Точка ветвления — провод от роутера разветвляется на api и pinia.
junctions:
  - { id: J1, color: cyan }

edges:
  # main flow
  - { from: app.routes,   to: router.in, color: cyan }
  - { from: app.stores,   to: pinia.in,  color: green }

  # branching через junction
  - { from: router.pages, to: J1.l,      color: cyan }
  - { from: J1.r,         to: api.req,   color: cyan }
  - { from: J1.b,         to: pinia.in,  color: cyan }

  - { from: api.res,      to: db.read,   color: green }
  - { from: pinia.state,  to: db.write,  color: cyan }
`
