export type AccentColor = 'cyan' | 'green' | 'magenta' | 'orange' | 'yellow' | 'gray'

export type HandleType = 'source' | 'target' | 'both' | 'none'

export interface RowSpec {
  id: string
  label: string
  value?: string | number
  icon?: string
  color?: AccentColor
  type?: HandleType
}

export interface ProgressSpec {
  current: number
  max: number
  label?: string
  color?: AccentColor
}

export interface FooterSpec {
  label: string
  price?: number
  color?: AccentColor
}

export interface NodeSpec {
  id: string
  title: string
  icon?: string
  rows?: RowSpec[]
  progress?: ProgressSpec
  footer?: FooterSpec
  group?: string
  /** Mark this node as a tree root (pinned to the leftmost ELK partition). */
  entry?: boolean
  /** Optional explicit ELK partition (column). 0 = leftmost. */
  partition?: number
}

export type EdgeShape = 'smoothstep' | 'step' | 'bezier' | 'straight'

export interface EdgeSpec {
  from: string
  to: string
  color?: AccentColor
  label?: string
  shape?: EdgeShape
}

export interface JunctionSpec {
  id: string
  color?: AccentColor
  group?: string
}

export interface GroupSpec {
  id: string
  title?: string
  color?: AccentColor
  /** Pin this group to a specific ELK partition (column). 0 = leftmost. */
  partition?: number
  /** Force this group into the leftmost partition (alias for partition: 0). */
  entry?: boolean
  // Deprecated coordinate fields — kept in the type for backward-compat
  // but no longer read by parse.ts and ignored by toFlow.
  width?: number
  height?: number
  x?: number
  y?: number
}

export interface ObstructionDoc {
  nodes: NodeSpec[]
  edges: EdgeSpec[]
  junctions?: JunctionSpec[]
  groups?: GroupSpec[]
}
