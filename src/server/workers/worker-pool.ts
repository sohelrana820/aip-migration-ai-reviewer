import { Worker } from 'worker_threads'
import type { WorkerJob, WorkerResult } from './worker-protocol.js'

interface PoolOptions {
  maxWorkers: number
  timeoutMs: number
}

export class WorkerPool {
  private options: PoolOptions

  constructor(options: PoolOptions) {
    this.options = options
  }

  runJob<T>(workerPath: string, job: WorkerJob): Promise<T> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(workerPath)
      const timer = setTimeout(() => {
        worker.terminate()
        reject(new Error(`Worker job ${job.jobId} timeout after ${this.options.timeoutMs}ms`))
      }, this.options.timeoutMs)

      worker.on('message', (result: WorkerResult<T>) => {
        clearTimeout(timer)
        worker.terminate()
        if (result.ok) resolve(result.data)
        else reject(new Error(result.error))
      })

      worker.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })

      worker.postMessage(job)
    })
  }

  async shutdown(): Promise<void> {
    // stateless pool — workers are created per-job
  }
}
