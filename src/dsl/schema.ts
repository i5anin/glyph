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

export interface EdgeSpec {
  from: string
  to: string
  color?: AccentColor
  label?: string
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
}

export interface ObstructionDoc {
  nodes: NodeSpec[]
  edges: EdgeSpec[]
  junctions?: JunctionSpec[]
  groups?: GroupSpec[]
}
