const BASE = '/api'
let sessionToken: string | null = null
let bootstrapPromise: Promise<boolean> | null = null

export function bootstrap(): Promise<boolean> {
  if (sessionToken) return Promise.resolve(true)
  if (!bootstrapPromise) bootstrapPromise = doBootstrap()
  return bootstrapPromise
}

async function doBootstrap(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const bootstrapToken = params.get('bootstrap')
  if (!bootstrapToken) return false

  const res = await fetch('/auth/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bootstrapToken })
  })
  if (!res.ok) return false
  const { sessionToken: token } = await res.json() as { sessionToken: string }
  sessionToken = token
  window.history.replaceState({}, '', window.location.pathname)
  return true
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
      ...init.headers
    }
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  projects: {
    list: () => apiRequest<any[]>('/projects'),
    create: (name: string, sourcePath: string, targetPath: string) =>
      apiRequest('/projects', { method: 'POST', body: JSON.stringify({ name, sourcePath, targetPath }) }),
    delete: (id: string) => apiRequest<void>(`/projects/${id}`, { method: 'DELETE' })
  },
  mappings: {
    autoMatch: (projectId: string) =>
      apiRequest<any[]>(`/projects/${projectId}/mappings/auto-match`, { method: 'POST' }),
    createManual: (projectId: string, body: unknown) =>
      apiRequest(`/projects/${projectId}/mappings`, { method: 'POST', body: JSON.stringify(body) }),
    update: (projectId: string, groupId: string, patch: unknown) =>
      apiRequest(`/projects/${projectId}/mappings/${groupId}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }
}
