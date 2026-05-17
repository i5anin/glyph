import yaml from 'js-yaml'
import type { Connection } from '@vue-flow/core'
import type { EdgeSpec, ObstructionDoc } from './schema'

/**
 * Serialize an ObstructionDoc back to YAML text suitable for the DSL editor.
 * Comments and original formatting are lost on round-trip.
 */
export function toDsl(doc: ObstructionDoc): string {
  // build a clean object preserving key order
  const out: Record<string, unknown> = {}
  if (doc.groups && doc.groups.length) out.groups = doc.groups
  if (doc.junctions && doc.junctions.length) out.junctions = doc.junctions
  out.nodes = doc.nodes
  out.edges = doc.edges

  return yaml.dump(out, {
    lineWidth: 200,
    noRefs: true,
    flowLevel: 3,
    quotingType: '"',
    forceQuotes: false,
  })
}

/**
 * Convert "{nodeId}-{rowId}-source" / "{junctionId}-{side}-target" style handle
 * back into the DSL endpoint reference "nodeId.rowId" / "junctionId.side".
 */
export function endpointRefFromHandle(
  nodeId: string,
  handleId: string | null | undefined,
): string {
  if (!handleId) return nodeId
  // handle id ends with "-source" or "-target"
  const stripped = handleId.replace(/-(source|target)$/, '')
  return `${nodeId}.${stripped}`
}

/**
 * Build an EdgeSpec from a Vue Flow Connection event.
 */
export function edgeSpecFromConnection(
  c: Connection,
  defaults: Partial<EdgeSpec> = {},
): EdgeSpec | null {
  if (!c.source || !c.target) return null
  return {
    from: endpointRefFromHandle(c.source, c.sourceHandle),
    to: endpointRefFromHandle(c.target, c.targetHandle),
    color: defaults.color ?? 'cyan',
    shape: defaults.shape ?? 'smoothstep',
  }
}
