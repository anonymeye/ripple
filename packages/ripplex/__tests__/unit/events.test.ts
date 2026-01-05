/**
 * Tests for the events module
 * Tests event registration, handler execution, interceptor chains, and error handling
 */

import { createEventManager, EventManager } from '../../src/modules/events'
import { createRegistrar } from '../../src/modules/registrar'
import { createStateManager } from '../../src/modules/state'
import { createEffectExecutor } from '../../src/modules/effects'
import { createErrorHandler } from '../../src/modules/errorHandler'
import { createTracer } from '../../src/modules/tracing'
import { Interceptor } from '../../src/modules/interceptor'
import { Context, EffectMap } from '../../src/modules/types'

describe('EventManager', () => {
  let eventManager: EventManager<{ count: number }, {}>
  let registrar: ReturnType<typeof createRegistrar>
  let stateManager: ReturnType<typeof createStateManager<{ count: number }>>
  let effectExecutor: ReturnType<typeof createEffectExecutor<{ count: number }>>
  let errorHandler: ReturnType<typeof createErrorHandler>
  let tracer: ReturnType<typeof createTracer<{ count: number }>>
  let consoleWarnSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    registrar = createRegistrar()
    stateManager = createStateManager({ count: 0 })
    errorHandler = createErrorHandler()
    tracer = createTracer({ enabled: false })
    
    // Create effect executor with proper dependencies
    const mockDispatch = jest.fn().mockResolvedValue(undefined)
    
    effectExecutor = createEffectExecutor({
      registrar,
      stateManager,
      errorHandler,
      dispatch: mockDispatch,
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

    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('registerEventDb', () => {
    it('should register an event handler that returns state', () => {
      const handler = jest.fn((coeffects, payload) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('increment', handler)
      
      expect(registrar.has('event', 'increment')).toBe(true)
    })

    it('should wrap handler return value into :db effect', async () => {
      const handler = jest.fn((coeffects, payload) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('increment', handler)
      await eventManager.handleEvent('increment', null)

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ db: { count: 0 } }),
        null
      )
      expect(stateManager.getState()).toEqual({ count: 1 })
    })

    it('should warn when overwriting an existing handler', () => {
      const handler1 = jest.fn((coeffects) => coeffects.db)
      const handler2 = jest.fn((coeffects) => coeffects.db)

      eventManager.registerEventDb('test', handler1)
      eventManager.registerEventDb('test', handler2)

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Event handler for "test" is being overwritten'
      )
    })

    it('should support interceptors', async () => {
      const interceptor: Interceptor<{ count: number }, {}> = {
        id: 'test-interceptor',
        before: (context) => {
          return {
            ...context,
            coeffects: {
              ...context.coeffects,
              db: { count: context.coeffects.db.count + 10 }
            }
          }
        }
      }

      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('test', handler, [interceptor])
      await eventManager.handleEvent('test', null)

      // Interceptor adds 10, handler adds 1
      expect(stateManager.getState()).toEqual({ count: 11 })
    })
  })

  describe('registerEvent', () => {
    it('should register an event handler that returns effects map', () => {
      const handler = jest.fn((coeffects, payload): EffectMap => {
        return { db: { count: coeffects.db.count + 1 } }
      })

      eventManager.registerEvent('increment', handler)
      
      expect(registrar.has('event', 'increment')).toBe(true)
    })

    it('should use handler return value directly as effects', async () => {
      const handler = jest.fn((coeffects, payload): EffectMap => {
        return { db: { count: coeffects.db.count + 2 } }
      })

      eventManager.registerEvent('increment', handler)
      await eventManager.handleEvent('increment', null)

      expect(stateManager.getState()).toEqual({ count: 2 })
    })

    it('should warn when overwriting an existing handler', () => {
      const handler1 = jest.fn((): EffectMap => ({ db: { count: 0 } }))
      const handler2 = jest.fn((): EffectMap => ({ db: { count: 0 } }))

      eventManager.registerEvent('test', handler1)
      eventManager.registerEvent('test', handler2)

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Event handler for "test" is being overwritten'
      )
    })

    it('should support interceptors', async () => {
      const interceptor: Interceptor<{ count: number }, {}> = {
        id: 'test-interceptor',
        before: (context) => {
          return {
            ...context,
            effects: {
              ...context.effects,
              db: { count: context.coeffects.db.count + 5 }
            }
          }
        }
      }

      const handler = jest.fn((): EffectMap => ({ db: { count: 0 } }))

      eventManager.registerEvent('test', handler, [interceptor])
      await eventManager.handleEvent('test', null)

      // Interceptor sets count to 5, handler sets to 0, but interceptor runs first
      // Actually, interceptors run before handler, so handler's effect should win
      // Wait, let me check the order... interceptors run left-to-right in before phase
      // Handler is added at the end, so it runs last
      expect(stateManager.getState()).toEqual({ count: 0 })
    })
  })

  describe('deregisterEvent', () => {
    it('should remove an event handler', () => {
      const handler = jest.fn((coeffects) => coeffects.db)
      
      eventManager.registerEventDb('test', handler)
      expect(registrar.has('event', 'test')).toBe(true)

      eventManager.deregisterEvent('test')
      expect(registrar.has('event', 'test')).toBe(false)
    })

    it('should handle deregistering non-existent handler', () => {
      expect(() => {
        eventManager.deregisterEvent('non-existent')
      }).not.toThrow()
    })
  })

  describe('handleEvent', () => {
    it('should warn when no handler is registered', async () => {
      await eventManager.handleEvent('non-existent', null)

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'No handler registered for event "non-existent"'
      )
    })

    it('should compute coeffects from providers', async () => {
      const customCofx = { customValue: 'test' }
      const coeffectProviders = {
        customValue: () => 'test'
      }

      const managerWithCofx = createEventManager({
        registrar,
        stateManager,
        effectExecutor,
        errorHandler,
        tracer,
        coeffectProviders
      })

      const handler = jest.fn((coeffects, payload) => {
        expect(coeffects).toHaveProperty('customValue', 'test')
        return coeffects.db
      })

      managerWithCofx.registerEventDb('test', handler)
      await managerWithCofx.handleEvent('test', null)

      expect(handler).toHaveBeenCalled()
    })

    it('should pass event payload in context', async () => {
      const handler = jest.fn((coeffects, payload) => {
        expect(payload).toBe('test-payload')
        return coeffects.db
      })

      eventManager.registerEventDb('test', handler)
      await eventManager.handleEvent('test', 'test-payload')

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'test-payload' }),
        'test-payload'
      )
    })

    it('should execute interceptors in correct order (before phase)', async () => {
      const order: string[] = []

      const interceptor1: Interceptor<{ count: number }, {}> = {
        id: 'interceptor1',
        before: (context) => {
          order.push('before1')
          return context
        }
      }

      const interceptor2: Interceptor<{ count: number }, {}> = {
        id: 'interceptor2',
        before: (context) => {
          order.push('before2')
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        order.push('handler')
        return coeffects.db
      })

      eventManager.registerEventDb('test', handler, [interceptor1, interceptor2])
      await eventManager.handleEvent('test', null)

      expect(order).toEqual(['before1', 'before2', 'handler'])
    })

    it('should execute interceptors in reverse order (after phase)', async () => {
      const order: string[] = []

      const interceptor1: Interceptor<{ count: number }, {}> = {
        id: 'interceptor1',
        after: (context) => {
          order.push('after1')
          return context
        }
      }

      const interceptor2: Interceptor<{ count: number }, {}> = {
        id: 'interceptor2',
        after: (context) => {
          order.push('after2')
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        return { count: 1 }
      })

      eventManager.registerEventDb('test', handler, [interceptor1, interceptor2])
      await eventManager.handleEvent('test', null)

      // After phase runs right-to-left (reverse order)
      expect(order).toEqual(['after2', 'after1'])
    })

    it('should handle errors in before phase', async () => {
      const error = new Error('Before phase error')
      const errorHandlerSpy = jest.fn().mockResolvedValue(undefined)
      errorHandler.register(errorHandlerSpy)

      const interceptor: Interceptor<{ count: number }, {}> = {
        id: 'error-interceptor',
        before: () => {
          throw error
        }
      }

      const handler = jest.fn((coeffects) => {
        return { count: 1 }
      })

      eventManager.registerEventDb('test', handler, [interceptor])
      await eventManager.handleEvent('test', null)

      expect(errorHandlerSpy).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          eventKey: 'test',
          phase: 'interceptor',
          interceptor: {
            id: 'error-interceptor',
            direction: 'before'
          }
        }),
        expect.any(Object)
      )

      // State should not change when error occurs
      expect(stateManager.getState()).toEqual({ count: 0 })
      expect(handler).not.toHaveBeenCalled()
    })

    it('should handle errors in after phase', async () => {
      const error = new Error('After phase error')
      const errorHandlerSpy = jest.fn().mockResolvedValue(undefined)
      errorHandler.register(errorHandlerSpy)

      const interceptor: Interceptor<{ count: number }, {}> = {
        id: 'error-interceptor',
        after: () => {
          throw error
        }
      }

      const handler = jest.fn((coeffects) => {
        return { count: 1 }
      })

      eventManager.registerEventDb('test', handler, [interceptor])
      await eventManager.handleEvent('test', null)

      expect(errorHandlerSpy).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          eventKey: 'test',
          phase: 'interceptor',
          interceptor: {
            id: 'error-interceptor',
            direction: 'after'
          }
        }),
        expect.any(Object)
      )
    })

    it('should only update state via :db effect', async () => {
      const handler = jest.fn((): EffectMap => {
        return {
          db: { count: 1 },
          dispatch: { event: 'other-event', payload: null }
        }
      })

      eventManager.registerEvent('test', handler)
      await eventManager.handleEvent('test', null)

      // Only :db effect should update state
      expect(stateManager.getState()).toEqual({ count: 1 })
    })

    it('should emit event trace', async () => {
      const traceCallback = jest.fn()
      const tracerWithCallback = createTracer({ enabled: true, debounceTime: 0 })
      tracerWithCallback.registerTraceCallback('test', traceCallback)

      const managerWithTracing = createEventManager({
        registrar,
        stateManager,
        effectExecutor,
        errorHandler,
        tracer: tracerWithCallback,
        coeffectProviders: {}
      })

      const handler = jest.fn((coeffects) => {
        return { count: 1 }
      })

      managerWithTracing.registerEventDb('test', handler)
      await managerWithTracing.handleEvent('test', 'payload')

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(traceCallback).toHaveBeenCalled()
      const traces = traceCallback.mock.calls[0][0]
      expect(traces).toHaveLength(1)
      expect(traces[0]).toMatchObject({
        eventKey: 'test',
        payload: 'payload',
        stateBefore: { count: 0 },
        stateAfter: { count: 1 }
      })
    })

    it('should pass context through interceptor chain', async () => {
      const interceptor1: Interceptor<{ count: number }, {}> = {
        id: 'interceptor1',
        before: (context) => {
          return {
            ...context,
            coeffects: {
              ...context.coeffects,
              db: { count: context.coeffects.db.count + 1 }
            }
          }
        }
      }

      const interceptor2: Interceptor<{ count: number }, {}> = {
        id: 'interceptor2',
        before: (context) => {
          return {
            ...context,
            coeffects: {
              ...context.coeffects,
              db: { count: context.coeffects.db.count + 1 }
            }
          }
        }
      }

      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('test', handler, [interceptor1, interceptor2])
      await eventManager.handleEvent('test', null)

      // Each interceptor adds 1, handler adds 1
      expect(stateManager.getState()).toEqual({ count: 3 })
    })
  })
})

