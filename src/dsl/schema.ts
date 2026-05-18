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
  // Optional manual size and position overrides. If absent, the group is
  // auto-laid-out to fit its members (bounding box + padding). When set,
  // the override wins. The user enters "edit" mode (double-click the header)
  // to drag the borders from any side.
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
