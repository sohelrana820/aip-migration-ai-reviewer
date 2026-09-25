export interface DiscoveredEndpoint {
  method: string
  path: string
  handler: string
  sourceFile: string
  framework: 'lumen' | 'nestjs'
  diagnostics: string[]
}

export interface DiscoveryResult {
  endpoints: DiscoveredEndpoint[]
  gaps: string[]
}
