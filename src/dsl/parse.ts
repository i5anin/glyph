import yaml from 'js-yaml'
import type {
  ObstructionDoc,
  NodeSpec,
  EdgeSpec,
  RowSpec,
  JunctionSpec,
  GroupSpec,
} from './schema'

export class DslError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DslError'
  }
}

export function parseDsl(text: string): ObstructionDoc {
  let raw: unknown
  try {
    raw = yaml.load(text)
  } catch (e) {
    throw new DslError(`YAML syntax error: ${(e as Error).message}`)
  }

  if (!raw || typeof raw !== 'object') {
    throw new DslError('Document must be a YAML object with "nodes" and "edges"')
  }

  const doc = raw as Record<string, unknown>

  if (!Array.isArray(doc.nodes)) {
    throw new DslError('"nodes" must be an array')
  }

  const nodes: NodeSpec[] = doc.nodes.map((n, i) => validateNode(n, i))
  const junctions: JunctionSpec[] = Array.isArray(doc.junctions)
    ? doc.junctions.map((j, i) => validateJunction(j, i))
    : []
  const groups: GroupSpec[] = Array.isArray(doc.groups)
    ? doc.groups.map((g, i) => validateGroup(g, i))
    : []
  const edges: EdgeSpec[] = Array.isArray(doc.edges)
    ? doc.edges.map((e, i) => validateEdge(e, i))
    : []

  const nodeIds = new Set(nodes.map((n) => n.id))
  const junctionIds = new Set(junctions.map((j) => j.id))
  const groupIds = new Set(groups.map((g) => g.id))
  const allEndpointIds = new Set([...nodeIds, ...junctionIds])

  for (const n of nodes) {
    if (n.group && !groupIds.has(n.group)) {
      throw new DslError(`node "${n.id}".group references unknown group "${n.group}"`)
    }
  }
  for (const j of junctions) {
    if (j.group && !groupIds.has(j.group)) {
      throw new DslError(`junction "${j.id}".group references unknown group "${j.group}"`)
    }
  }

  for (const e of edges) {
    const [fromHead] = e.from.split('.')
    const [toHead] = e.to.split('.')
    if (!fromHead || !allEndpointIds.has(fromHead)) {
      throw new DslError(`edge.from "${e.from}" references unknown node/junction "${fromHead}"`)
    }
    if (!toHead || !allEndpointIds.has(toHead)) {
      throw new DslError(`edge.to "${e.to}" references unknown node/junction "${toHead}"`)
    }
  }

  return { nodes, edges, junctions, groups }
}

function validateJunction(j: unknown, i: number): JunctionSpec {
  if (!j || typeof j !== 'object') throw new DslError(`junctions[${i}] must be an object`)
  const obj = j as Record<string, unknown>
  if (typeof obj.id !== 'string') throw new DslError(`junctions[${i}].id must be a string`)
  return {
    id: obj.id,
    color: obj.color as JunctionSpec['color'],
    group: typeof obj.group === 'string' ? obj.group : undefined,
  }
}

function validateGroup(g: unknown, i: number): GroupSpec {
  if (!g || typeof g !== 'object') throw new DslError(`groups[${i}] must be an object`)
  const obj = g as Record<string, unknown>
  if (typeof obj.id !== 'string') throw new DslError(`groups[${i}].id must be a string`)
  // Position / size fields (x, y, width, height) are intentionally NOT read.
  return {
    id: obj.id,
    title: typeof obj.title === 'string' ? obj.title : undefined,
    color: obj.color as GroupSpec['color'],
    entry: obj.entry === true ? true : undefined,
    partition: typeof obj.partition === 'number' ? obj.partition : undefined,
  }
}

function validateNode(n: unknown, i: number): NodeSpec {
  if (!n || typeof n !== 'object') {
    throw new DslError(`nodes[${i}] must be an object`)
  }
  const obj = n as Record<string, unknown>
  if (typeof obj.id !== 'string') {
    throw new DslError(`nodes[${i}].id must be a string`)
  }
  if (typeof obj.title !== 'string') {
    throw new DslError(`nodes[${i}].title must be a string`)
  }

  const rows: RowSpec[] = Array.isArray(obj.rows)
    ? obj.rows.map((r, ri) => validateRow(r, i, ri))
    : []

  return {
    id: obj.id,
    title: obj.title,
    icon: typeof obj.icon === 'string' ? obj.icon : undefined,
    rows,
    progress: obj.progress as NodeSpec['progress'],
    footer: obj.footer as NodeSpec['footer'],
    group: typeof obj.group === 'string' ? obj.group : undefined,
    entry: obj.entry === true ? true : undefined,
    partition: typeof obj.partition === 'number' ? obj.partition : undefined,
  }
}

function validateRow(r: unknown, ni: number, ri: number): RowSpec {
  if (!r || typeof r !== 'object') {
    throw new DslError(`nodes[${ni}].rows[${ri}] must be an object`)
  }
  const obj = r as Record<string, unknown>
  if (typeof obj.id !== 'string') {
    throw new DslError(`nodes[${ni}].rows[${ri}].id must be a string`)
  }
  if (typeof obj.label !== 'string') {
    throw new DslError(`nodes[${ni}].rows[${ri}].label must be a string`)
  }
  return {
    id: obj.id,
    label: obj.label,
    value: obj.value as string | number | undefined,
    icon: typeof obj.icon === 'string' ? obj.icon : undefined,
    color: obj.color as RowSpec['color'],
    type: obj.type as RowSpec['type'],
  }
}

function validateEdge(e: unknown, i: number): EdgeSpec {
  if (!e || typeof e !== 'object') {
    throw new DslError(`edges[${i}] must be an object`)
  }
  const obj = e as Record<string, unknown>
  if (typeof obj.from !== 'string' || !obj.from.includes('.')) {
    throw new DslError(`edges[${i}].from must be "nodeId.rowId"`)
  }
  if (typeof obj.to !== 'string' || !obj.to.includes('.')) {
    throw new DslError(`edges[${i}].to must be "nodeId.rowId"`)
  }
  return {
    from: obj.from,
    to: obj.to,
    color: obj.color as EdgeSpec['color'],
    label: typeof obj.label === 'string' ? obj.label : undefined,
  }
}
