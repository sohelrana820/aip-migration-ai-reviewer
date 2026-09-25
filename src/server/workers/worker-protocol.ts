export interface WorkerJob {
  jobId: string
  type: string
  payload: unknown
}

export type WorkerResult<T = unknown> =
  | { jobId: string; ok: true; data: T }
  | { jobId: string; ok: false; error: string }
