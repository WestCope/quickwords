export type Snippet = {
  id: number
  active: boolean
  key: string
  value: string
  regex: boolean
  type: 'js' | 'plain'
}

export type Store = {
  user: string
  theme: 0 | 1
  autoLaunch: boolean
  snippets: Snippet[]
  bufferLength: number
  autoUpdate: boolean
}
