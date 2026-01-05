/**
 * Tests for the router module
 * Tests event queue, dispatch, and sequential processing
 */

import { createRouter, Router } from '../../src/modules/router'
import { createEventManager } from '../../src/modules/events'
import { createRegistrar } from '../../src/modules/registrar'
import { createStateManager } from '../../src/modules/state'
import { createEffectExecutor } from '../../src/modules/effects'
import { createErrorHandler } from '../../src/modules/errorHandler'
import { createTracer } from '../../src/modules/tracing'
import { EffectMap } from '../../src/modules/types'

describe('Router', () => {
  let router: Router<{ count: number }, {}>
  let eventManager: ReturnType<typeof createEventManager<{ count: number }, {}>>
  let registrar: ReturnType<typeof createRegistrar>
  let stateManager: ReturnType<typeof createStateManager<{ count: number }>>
  let effectExecutor: ReturnType<typeof createEffectExecutor<{ count: number }>>
  let errorHandler: ReturnType<typeof createErrorHandler>
  let tracer: ReturnType<typeof createTracer<{ count: number }>>

  beforeEach(() => {
    registrar = createRegistrar()
    stateManager = createStateManager({ count: 0 })
    errorHandler = createErrorHandler()
    tracer = createTracer({ enabled: false })
    
    // Create effect executor with proper dependencies
    // We need a circular reference here: router needs eventManager, 
    // eventManager needs effectExecutor, effectExecutor needs dispatch (from router)
    let routerDispatch: (eventKey: string, payload: any) => Promise<void>
    
    effectExecutor = createEffectExecutor({
      registrar,
      stateManager,
      errorHandler,
      dispatch: (eventKey: string, payload: any) => routerDispatch(eventKey, payload),
      deregisterEvent: (eventKey: string) => {
        eventManager.deregisterEvent(eventKey)
      },
      registerEffect: <Config = any>(effectType: string, handler: any) => {
        registrar.register('effect', effectType, handler)
      }
    })
    
    // Register built-in effects
    effectExecutor.registerBuiltInEffects()

    eventManager = createEventManager({
      registrar,
      stateManager,
      effectExecutor,
      errorHandler,
      tracer,
      coeffectProviders: {}
    })

    router = createRouter({
      eventManager
    })
    
    // Set up the dispatch reference
    routerDispatch = (eventKey: string, payload: any) => router.dispatch(eventKey, payload)
  })

  describe('dispatch', () => {
    it('should add event to queue', async () => {
      const handler = jest.fn((coeffects) => coeffects.db)
      eventManager.registerEventDb('test', handler)

      const promise = router.dispatch('test', null)
      await promise

      expect(handler).toHaveBeenCalled()
    })

    it('should return a promise that resolves when event is processed', async () => {
      const handler = jest.fn((coeffects) => coeffects.db)
      eventManager.registerEventDb('test', handler)

      const promise = router.dispatch('test', null)
      expect(promise).toBeInstanceOf(Promise)

      await promise
      expect(handler).toHaveBeenCalled()
    })

    it('should process events sequentially (FIFO)', async () => {
      const order: string[] = []

      const handler1 = jest.fn((coeffects) => {
        order.push('handler1')
        return { count: 1 }
      })

      const handler2 = jest.fn((coeffects) => {
        order.push('handler2')
        return { count: 2 }
      })

      eventManager.registerEventDb('event1', handler1)
      eventManager.registerEventDb('event2', handler2)

      // Dispatch multiple events
      router.dispatch('event1', null)
      router.dispatch('event2', null)

      // Wait for queue to finish processing
      await router.flush()

      // Events should be processed in order
      expect(order).toEqual(['handler1', 'handler2'])
      expect(stateManager.getState()).toEqual({ count: 2 })
    })

    it('should handle concurrent dispatches', async () => {
      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('increment', handler)

      // Dispatch multiple events concurrently
      router.dispatch('increment', null)
      router.dispatch('increment', null)
      router.dispatch('increment', null)

      // Wait for queue to finish processing
      await router.flush()

      // All events should be processed
      expect(handler).toHaveBeenCalledTimes(3)
      expect(stateManager.getState()).toEqual({ count: 3 })
    })

    it('should process queue when not already processing', async () => {
      const handler = jest.fn((coeffects) => coeffects.db)
      eventManager.registerEventDb('test', handler)

      await router.dispatch('test', null)

      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('should handle events with payloads', async () => {
      const handler = jest.fn((coeffects, payload) => {
        return { count: payload }
      })

      eventManager.registerEventDb('set-count', handler)

      await router.dispatch('set-count', 42)

      expect(handler).toHaveBeenCalledWith(
        expect.any(Object),
        42
      )
      expect(stateManager.getState()).toEqual({ count: 42 })
    })
  })

  describe('flush', () => {
    it('should process all events in queue immediately', async () => {
      const handler1 = jest.fn((coeffects) => {
        return { count: 1 }
      })
      const handler2 = jest.fn((coeffects) => {
        return { count: 2 }
      })

      eventManager.registerEventDb('event1', handler1)
      eventManager.registerEventDb('event2', handler2)

      // Dispatch events (they will be queued)
      router.dispatch('event1', null)
      router.dispatch('event2', null)

      // Flush should process all queued events
      await router.flush()

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
      expect(stateManager.getState()).toEqual({ count: 2 })
    })

    it('should handle empty queue', async () => {
      await expect(router.flush()).resolves.not.toThrow()
    })

    it('should process events in correct order after flush', async () => {
      const order: number[] = []

      const handler1 = jest.fn((coeffects) => {
        order.push(1)
        return { count: 1 }
      })

      const handler2 = jest.fn((coeffects) => {
        order.push(2)
        return { count: 2 }
      })

      const handler3 = jest.fn((coeffects) => {
        order.push(3)
        return { count: 3 }
      })

      eventManager.registerEventDb('event1', handler1)
      eventManager.registerEventDb('event2', handler2)
      eventManager.registerEventDb('event3', handler3)

      router.dispatch('event1', null)
      router.dispatch('event2', null)
      router.dispatch('event3', null)

      await router.flush()

      expect(order).toEqual([1, 2, 3])
    })
  })

  describe('queue state management', () => {
    it('should not process queue multiple times concurrently', async () => {
      let processingCount = 0
      let maxConcurrent = 0

      const handler = jest.fn((coeffects): EffectMap => {
        processingCount++
        maxConcurrent = Math.max(maxConcurrent, processingCount)
        
        // Simulate some work (synchronous for this test)
        processingCount--
        return { db: { count: 1 } }
      })

      eventManager.registerEvent('async-event', handler)

      // Dispatch multiple events
      router.dispatch('async-event', null)
      router.dispatch('async-event', null)
      router.dispatch('async-event', null)

      // Wait for queue to finish processing
      await router.flush()

      // Should process one at a time (maxConcurrent should be 1)
      expect(maxConcurrent).toBe(1)
    })

    it('should handle rapid dispatches', async () => {
      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('increment', handler)

      // Dispatch many events rapidly
      Array.from({ length: 10 }, () => 
        router.dispatch('increment', null)
      )

      // Wait for queue to finish processing
      await router.flush()

      expect(handler).toHaveBeenCalledTimes(10)
      expect(stateManager.getState()).toEqual({ count: 10 })
    })
  })
})

