import { parentPort } from 'worker_threads'
parentPort.on('message', (job) => {
  parentPort.postMessage({ jobId: job.jobId, ok: true, data: job.payload })
})
