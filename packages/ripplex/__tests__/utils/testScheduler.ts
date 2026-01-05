/**
 * Synchronous scheduler for testing
 * Executes callbacks immediately instead of deferring to RAF
 */
export function createSyncScheduler() {
  let callbacks: FrameRequestCallback[] = []
  let idCounter = 0

  const scheduler = (callback: FrameRequestCallback): number => {
    callbacks.push(callback)
    return ++idCounter
  }

  scheduler.flush = () => {
    const toExecute = [...callbacks]
    callbacks = []
    toExecute.forEach(cb => cb(performance.now()))
  }

  scheduler.clear = () => {
    callbacks = []
  }

  return scheduler as typeof scheduler & { flush: () => void; clear: () => void }
}

/**
 * Mock RAF scheduler that can be manually controlled
 */
export function createMockScheduler() {
  let callback: FrameRequestCallback | null = null
  let idCounter = 0

  return {
    scheduler: (cb: FrameRequestCallback): number => {
      callback = cb
      return ++idCounter
    },
    
    flush: () => {
      if (callback) {
        const cb = callback
        callback = null
        cb(performance.now())
      }
    },
    
    hasScheduled: () => callback !== null
  }
}

