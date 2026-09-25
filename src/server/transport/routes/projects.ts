import { Router } from 'express'
import type { ProjectsRepo } from '../../persistence/repos/projects-repo.js'
import type { RepoService } from '../../repository/repo-service.js'

export function projectsRouter(projectsRepo: ProjectsRepo, repoService: RepoService): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json(projectsRepo.list())
  })

  router.post('/', (req, res) => {
    const { name, sourcePath, targetPath } = req.body as { name: string; sourcePath: string; targetPath: string }
    if (!name || !sourcePath || !targetPath) {
      res.status(400).json({ error: 'name, sourcePath, targetPath required' }); return
    }
    const srcV = repoService.validateRoot(sourcePath)
    if (!srcV.valid) { res.status(422).json({ error: `source: ${srcV.error}` }); return }
    const tgtV = repoService.validateRoot(targetPath)
    if (!tgtV.valid) { res.status(422).json({ error: `target: ${tgtV.error}` }); return }

    const project = projectsRepo.create(name, sourcePath, targetPath)
    res.status(201).json(project)
  })

  router.get('/:id', (req, res) => {
    const project = projectsRepo.getById(req.params.id)
    if (!project) { res.status(404).json({ error: 'Not found' }); return }
    res.json(project)
  })

  router.delete('/:id', (req, res) => {
    projectsRepo.delete(req.params.id)
    res.status(204).end()
  })

  return router
}
