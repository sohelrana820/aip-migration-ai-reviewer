import { useEffect, useState } from 'react'
import { bootstrap } from './api/client'
import { ProjectListPage } from './pages/ProjectListPage'

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    bootstrap().then(ok => {
      if (ok) setReady(true)
      else setError('No valid bootstrap token. Start the server and use the provided URL.')
    })
  }, [])

  if (error) return <div style={{ padding: 24, color: 'red' }}>{error}</div>
  if (!ready) return <div style={{ padding: 24 }}>Connecting...</div>

  return <ProjectListPage />
}
