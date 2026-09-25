import { parentPort } from 'worker_threads'
parentPort.on('message', (_job) => {
  // never responds
})
