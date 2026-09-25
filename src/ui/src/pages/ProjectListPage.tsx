import { useEffect, useState } from 'react'
import { api } from '../api/client'

interface Project {
  id: string
  name: string
  source_path: string
  target_path: string
  created_at: string
}

export function ProjectListPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [name, setName] = useState('')
  const [sourcePath, setSourcePath] = useState('')
  const [targetPath, setTargetPath] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = () => api.projects.list().then(setProjects).catch((e: Error) => setError(e.message))

  useEffect(() => { load() }, [])

  const create = async () => {
    try {
      await api.projects.create(name, sourcePath, targetPath)
      setName(''); setSourcePath(''); setTargetPath('')
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: 'monospace' }}>
      <h1>AI Migration Reviewer</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <section>
        <h2>New Project</h2>
        <label>Name: <input value={name} onChange={e => setName(e.target.value)} /></label><br />
        <label>Source repo path: <input value={sourcePath} onChange={e => setSourcePath(e.target.value)} size={60} /></label><br />
        <label>Target repo path: <input value={targetPath} onChange={e => setTargetPath(e.target.value)} size={60} /></label><br />
        <button onClick={create}>Create Project</button>
      </section>
      <section>
        <h2>Projects</h2>
        {projects.length === 0 && <p>No projects yet.</p>}
        <ul>
          {projects.map(p => (
            <li key={p.id}>
              <strong>{p.name}</strong> — {p.source_path} → {p.target_path}
              <button onClick={() => api.projects.delete(p.id).then(load)} style={{ marginLeft: 8 }}>Delete</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
