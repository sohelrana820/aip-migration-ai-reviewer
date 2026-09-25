import type { Response } from 'express'

export class SseManager {
  private clients = new Map<string, Response>()

  add(id: string, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    this.clients.set(id, res)
    res.on('close', () => this.clients.delete(id))
  }

  send(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const res of this.clients.values()) {
      res.write(payload)
    }
  }

  remove(id: string): void {
    this.clients.delete(id)
  }
}
