import express from 'express'
import { SessionManager } from './transport/session.js'
import { createOriginMiddleware } from './transport/origin-middleware.js'
import { requireSession } from './transport/auth-middleware.js'
import { projectsRouter } from './transport/routes/projects.js'
import { mappingsRouter } from './transport/routes/mappings.js'
import { SseManager } from './transport/sse.js'
import { openDb } from './persistence/db.js'
import { ProjectsRepo } from './persistence/repos/projects-repo.js'
import { EndpointsRepo } from './persistence/repos/endpoints-repo.js'
import { MappingsRepo } from './persistence/repos/mappings-repo.js'
import { RepoService } from './repository/repo-service.js'
import { MappingService } from './mapping/mapping-service.js'
import { randomUUID } from 'crypto'

export function createApp(dbPath: string) {
  const db = openDb(dbPath)
  const sessions = new SessionManager()
  const sse = new SseManager()

  const projectsRepo = new ProjectsRepo(db)
  const endpointsRepo = new EndpointsRepo(db)
  const mappingsRepo = new MappingsRepo(db)
  const repoService = new RepoService()
  const mappingService = new MappingService(endpointsRepo, mappingsRepo)

  const app = express()
  app.use(express.json())
  app.use(createOriginMiddleware(['http://localhost:5173', 'http://localhost:3000']))

  // Bootstrap exchange (public)
  app.post('/auth/exchange', (req, res) => {
    const { bootstrapToken } = req.body as { bootstrapToken: string }
    const result = sessions.createSession(bootstrapToken)
    if (!result) { res.status(401).json({ error: 'Invalid or expired bootstrap token' }); return }
    res.json({ sessionToken: result.sessionToken })
  })

  // Protected API
  app.use('/api', requireSession(sessions))
  app.use('/api/projects', projectsRouter(projectsRepo, repoService))
  app.use('/api/projects/:projectId/mappings', mappingsRouter(mappingService))

  // SSE
  app.get('/events', requireSession(sessions), (_req, res) => {
    sse.add(randomUUID(), res)
  })

  return { app, sessions, sse, db }
}
