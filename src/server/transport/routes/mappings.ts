import { Router } from 'express'
import type { Request } from 'express'
import type { MappingService } from '../../mapping/mapping-service.js'

type ProjectParams = { projectId: string }

export function mappingsRouter(mappingService: MappingService): Router {
  const router = Router({ mergeParams: true })

  router.post('/auto-match', (req: Request<ProjectParams>, res) => {
    const groups = mappingService.autoMatch(req.params.projectId)
    res.json(groups)
  })

  router.post('/', (req: Request<ProjectParams>, res) => {
    const { groupType, sourceIds, targetIds, correspondence } = req.body as {
      groupType: string; sourceIds: string[]; targetIds: string[]; correspondence?: string
    }
    const group = mappingService.createManualGroup(req.params.projectId, {
      groupType: groupType as 'one-to-one' | 'one-to-many' | 'many-to-one',
      sourceIds,
      targetIds,
      correspondence
    })
    res.status(201).json(group)
  })

  router.patch('/:groupId', (req, res) => {
    try {
      const group = mappingService.updateGroup(req.params.groupId, req.body)
      res.json(group)
    } catch {
      res.status(404).json({ error: 'Not found' })
    }
  })

  return router
}
