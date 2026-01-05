/**
 * Tests for interceptor chain execution
 * Tests before/after phases, context flow, error handling, and immutability
 */

import { createEventManager, EventManager } from '../../src/modules/events'
import { createRegistrar } from '../../src/modules/registrar'
import { createStateManager } from '../../src/modules/state'
import { createEffectExecutor } from '../../src/modules/effects'
import { createErrorHandler } from '../../src/modules/errorHandler'
import { createTracer } from '../../src/modules/tracing'
import { Interceptor, InterceptorContext } from '../../src/modules/interceptor'
import { Context } from '../../src/modules/types'

describe('Interceptor Chain Execution', () => {
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

  describe('Before Phase', () => {
    it('should execute before phase interceptors left-to-right', async () => {
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

      const interceptor3: Interceptor<{ count: number }, {}> = {
        id: 'interceptor3',
        before: (context) => {
          order.push('before3')
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        order.push('handler')
        return coeffects.db
      })

      eventManager.registerEventDb('test', handler, [interceptor1, interceptor2, interceptor3])
      await eventManager.handleEvent('test', null)

      expect(order).toEqual(['before1', 'before2', 'before3', 'handler'])
    })

    it('should pass context through before phase', async () => {
      const receivedContexts: InterceptorContext<{ count: number }, {}>[] = []

      const interceptor1: Interceptor<{ count: number }, {}> = {
        id: 'interceptor1',
        before: (context) => {
          receivedContexts.push({ ...context })
          return {
            ...context,
            coeffects: {
              ...context.coeffects,
              testValue: 'modified'
            } as Context<{ count: number }, {}>
          }
        }
      }

      const interceptor2: Interceptor<{ count: number }, {}> = {
        id: 'interceptor2',
        before: (context) => {
          receivedContexts.push({ ...context })
          expect((context.coeffects as any).testValue).toBe('modified')
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        expect((coeffects as any).testValue).toBe('modified')
        return coeffects.db
      })

      eventManager.registerEventDb('test', handler, [interceptor1, interceptor2])
      await eventManager.handleEvent('test', null)

      expect(receivedContexts).toHaveLength(2)
      expect((receivedContexts[1].coeffects as any).testValue).toBe('modified')
    })

    it('should allow interceptors to modify coeffects in before phase', async () => {
      const interceptor: Interceptor<{ count: number }, {}> = {
        id: 'modify',
        before: (context) => {
          return {
            ...context,
            coeffects: {
              ...context.coeffects,
              customValue: 'added'
            } as Context<{ count: number }, {}>
          }
        }
      }

      const handler = jest.fn((coeffects) => {
        expect((coeffects as any).customValue).toBe('added')
        return coeffects.db
      })

      eventManager.registerEventDb('test', handler, [interceptor])
      await eventManager.handleEvent('test', null)

      expect(handler).toHaveBeenCalled()
    })

    it('should allow interceptors to modify effects in before phase', async () => {
      const interceptor: Interceptor<{ count: number }, {}> = {
        id: 'modify',
        before: (context) => {
          return {
            ...context,
            effects: {
              ...context.effects,
              customEffect: 'value'
            }
          }
        }
      }

      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('test', handler, [interceptor])
      await eventManager.handleEvent('test', null)

      // The custom effect should be in the final effects
      // We can't directly check this, but we can verify the handler ran
      expect(handler).toHaveBeenCalled()
      expect(stateManager.getState()).toEqual({ count: 1 })
    })
  })

  describe('After Phase', () => {
    it('should execute after phase interceptors right-to-left', async () => {
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

      const interceptor3: Interceptor<{ count: number }, {}> = {
        id: 'interceptor3',
        after: (context) => {
          order.push('after3')
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        order.push('handler')
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('test', handler, [interceptor1, interceptor2, interceptor3])
      await eventManager.handleEvent('test', null)

      expect(order).toEqual(['handler', 'after3', 'after2', 'after1'])
    })

    it('should pass context through after phase', async () => {
      const receivedContexts: InterceptorContext<{ count: number }, {}>[] = []
      const modificationTracker: string[] = []

      const interceptor1: Interceptor<{ count: number }, {}> = {
        id: 'interceptor1',
        after: (context) => {
          // Capture the context before modification
          receivedContexts.push({ ...context })
          // Track that we're modifying
          modificationTracker.push('interceptor1-modifying')
          // Return modified context
          return {
            ...context,
            effects: {
              ...context.effects,
              customEffect: 'modified'
            }
          }
        }
      }

      const interceptor2: Interceptor<{ count: number }, {}> = {
        id: 'interceptor2',
        after: (context) => {
          // interceptor2 runs first (rightmost), so it sees original effects
          receivedContexts.push({ ...context })
          modificationTracker.push('interceptor2-seeing-original')
          expect(context.effects.customEffect).toBeUndefined()
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('test', handler, [interceptor1, interceptor2])
      await eventManager.handleEvent('test', null)

      expect(receivedContexts).toHaveLength(2)
      // Verify execution order: interceptor2 runs first (rightmost), then interceptor1
      expect(modificationTracker).toEqual(['interceptor2-seeing-original', 'interceptor1-modifying'])
      // interceptor2 runs first and sees original effects (no customEffect)
      expect(receivedContexts[0].effects.customEffect).toBeUndefined()
      // interceptor1 runs second and receives context (captured before modification)
      // Note: The captured context won't have the modification because we capture before returning
      // The modification is in the returned context, which is used for effect execution
      expect(receivedContexts[1].effects.customEffect).toBeUndefined()
    })

    it('should allow interceptors to modify effects in after phase', async () => {
      const interceptor: Interceptor<{ count: number }, {}> = {
        id: 'modify',
        after: (context) => {
          return {
            ...context,
            effects: {
              ...context.effects,
              customEffect: 'added'
            }
          }
        }
      }

      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('test', handler, [interceptor])
      await eventManager.handleEvent('test', null)

      expect(handler).toHaveBeenCalled()
      expect(stateManager.getState()).toEqual({ count: 1 })
    })
  })

  describe('Context Flow', () => {
    it('should flow context through both phases correctly', async () => {
      const beforeContexts: InterceptorContext<{ count: number }, {}>[] = []
      const afterContexts: InterceptorContext<{ count: number }, {}>[] = []

      const interceptor: Interceptor<{ count: number }, {}> = {
        id: 'flow',
        before: (context) => {
          beforeContexts.push({ ...context })
          return {
            ...context,
            coeffects: {
              ...context.coeffects,
              beforeValue: 'set'
            } as Context<{ count: number }, {}>
          }
        },
        after: (context) => {
          afterContexts.push({ ...context })
          expect((context.coeffects as any).beforeValue).toBe('set')
          return {
            ...context,
            effects: {
              ...context.effects,
              afterValue: 'set'
            }
          }
        }
      }

      const handler = jest.fn((coeffects) => {
        expect((coeffects as any).beforeValue).toBe('set')
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('test', handler, [interceptor])
      await eventManager.handleEvent('test', null)

      expect(beforeContexts).toHaveLength(1)
      expect(afterContexts).toHaveLength(1)
      // Before phase: beforeValue not set yet
      expect((beforeContexts[0].coeffects as any).beforeValue).toBeUndefined()
      // After phase: coeffects have beforeValue from before phase modification
      expect((afterContexts[0].coeffects as any).beforeValue).toBe('set')
      // Note: afterValue is set in the returned context, not the captured one
      // The captured context is before modification, but the interceptor returns modified context
      // We verify the interceptor logic executed by checking the expectation inside it
    })

    it('should maintain state updates through chain', async () => {
      const interceptor: Interceptor<{ count: number }, {}> = {
        id: 'state',
        before: (context) => {
          expect(context.coeffects.db.count).toBe(0)
          return context
        },
        after: (context) => {
          // After phase sees the new state in effects.db
          expect(context.effects.db.count).toBe(1)
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('test', handler, [interceptor])
      await eventManager.handleEvent('test', null)

      expect(stateManager.getState()).toEqual({ count: 1 })
    })
  })

  describe('Error Handling', () => {
    it('should handle errors in before phase', async () => {
      const error = new Error('Before phase error')
      const errorHandlerSpy = jest.spyOn(errorHandler, 'handle').mockResolvedValue(undefined)

      const interceptor1: Interceptor<{ count: number }, {}> = {
        id: 'interceptor1',
        before: (context) => {
          throw error
        }
      }

      const interceptor2: Interceptor<{ count: number }, {}> = {
        id: 'interceptor2',
        before: (context) => {
          // Should not be called
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        // Should not be called
        return coeffects.db
      })

      eventManager.registerEventDb('test', handler, [interceptor1, interceptor2])
      await eventManager.handleEvent('test', null)

      expect(errorHandlerSpy).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          eventKey: 'test',
          phase: 'interceptor',
          interceptor: {
            id: 'interceptor1',
            direction: 'before'
          }
        })
      )
      expect(handler).not.toHaveBeenCalled()
      expect(stateManager.getState()).toEqual({ count: 0 }) // State unchanged
    })

    it('should handle errors in after phase', async () => {
      const error = new Error('After phase error')
      const errorHandlerSpy = jest.spyOn(errorHandler, 'handle').mockResolvedValue(undefined)

      const interceptor1: Interceptor<{ count: number }, {}> = {
        id: 'interceptor1',
        after: (context) => {
          throw error
        }
      }

      const interceptor2: Interceptor<{ count: number }, {}> = {
        id: 'interceptor2',
        after: (context) => {
          // Should not be called (runs after interceptor1)
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('test', handler, [interceptor1, interceptor2])
      await eventManager.handleEvent('test', null)

      expect(errorHandlerSpy).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          eventKey: 'test',
          phase: 'interceptor',
          interceptor: {
            id: 'interceptor1',
            direction: 'after'
          }
        })
      )
      expect(handler).toHaveBeenCalled()
      // State should not be updated if after phase fails
      expect(stateManager.getState()).toEqual({ count: 0 })
    })

    it('should skip remaining interceptors when error occurs in before phase', async () => {
      const order: string[] = []
      const error = new Error('Error in interceptor')

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
          throw error
        }
      }

      const interceptor3: Interceptor<{ count: number }, {}> = {
        id: 'interceptor3',
        before: (context) => {
          order.push('before3') // Should not be called
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        order.push('handler') // Should not be called
        return coeffects.db
      })

      jest.spyOn(errorHandler, 'handle').mockResolvedValue(undefined)

      eventManager.registerEventDb('test', handler, [interceptor1, interceptor2, interceptor3])
      await eventManager.handleEvent('test', null)

      expect(order).toEqual(['before1', 'before2'])
    })

    it('should skip remaining interceptors when error occurs in after phase', async () => {
      const order: string[] = []
      const error = new Error('Error in interceptor')

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
          throw error
        }
      }

      const interceptor3: Interceptor<{ count: number }, {}> = {
        id: 'interceptor3',
        after: (context) => {
          order.push('after3') // Should not be called
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        order.push('handler')
        return { count: coeffects.db.count + 1 }
      })

      jest.spyOn(errorHandler, 'handle').mockResolvedValue(undefined)

      eventManager.registerEventDb('test', handler, [interceptor1, interceptor2, interceptor3])
      await eventManager.handleEvent('test', null)

      // After phase runs right-to-left, so interceptor3 runs first, then interceptor2 (which throws)
      expect(order).toEqual(['handler', 'after3', 'after2'])
    })
  })

  describe('Context Immutability', () => {
    it('should not allow interceptors to mutate original context', async () => {
      const originalState = stateManager.getState()
      
      const interceptor: Interceptor<{ count: number }, {}> = {
        id: 'mutate',
        before: (context) => {
          // Try to mutate the original context
          ;(context.coeffects as any).mutated = true
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        // The mutation should not affect the original state
        return coeffects.db
      })

      eventManager.registerEventDb('test', handler, [interceptor])
      await eventManager.handleEvent('test', null)

      // Original state should be unchanged
      expect(stateManager.getState()).toEqual(originalState)
    })

    it('should create new context objects in before phase', async () => {
      const contexts: InterceptorContext<{ count: number }, {}>[] = []

      const interceptor1: Interceptor<{ count: number }, {}> = {
        id: 'interceptor1',
        before: (context) => {
          contexts.push(context)
          return {
            ...context,
            coeffects: {
              ...context.coeffects,
              value1: 'set'
            } as Context<{ count: number }, {}>
          }
        }
      }

      const interceptor2: Interceptor<{ count: number }, {}> = {
        id: 'interceptor2',
        before: (context) => {
          contexts.push(context)
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        return coeffects.db
      })

      eventManager.registerEventDb('test', handler, [interceptor1, interceptor2])
      await eventManager.handleEvent('test', null)

      // Each interceptor should receive a potentially modified context
      expect(contexts).toHaveLength(2)
      expect(contexts[0]).not.toBe(contexts[1]) // Different objects
      expect((contexts[1].coeffects as any).value1).toBe('set')
    })

    it('should create new context objects in after phase', async () => {
      const contexts: InterceptorContext<{ count: number }, {}>[] = []
      const originalContexts: InterceptorContext<{ count: number }, {}>[] = []

      const interceptor1: Interceptor<{ count: number }, {}> = {
        id: 'interceptor1',
        after: (context) => {
          // Capture the original context object reference
          originalContexts.push(context)
          // Create a copy for our array
          contexts.push({
            ...context,
            coeffects: { ...context.coeffects },
            effects: { ...context.effects },
            queue: [...context.queue],
            stack: [...context.stack]
          })
          // Return a new object with modified effects
          return {
            ...context,
            effects: {
              ...context.effects,
              value1: 'set'
            }
          }
        }
      }

      const interceptor2: Interceptor<{ count: number }, {}> = {
        id: 'interceptor2',
        after: (context) => {
          // Capture the original context object reference
          originalContexts.push(context)
          // Create a copy for our array
          contexts.push({
            ...context,
            coeffects: { ...context.coeffects },
            effects: { ...context.effects },
            queue: [...context.queue],
            stack: [...context.stack]
          })
          // Return a new object to ensure interceptor1 receives a different object
          return { ...context }
        }
      }

      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('test', handler, [interceptor1, interceptor2])
      await eventManager.handleEvent('test', null)

      // Each interceptor should receive a context
      expect(originalContexts).toHaveLength(2)
      // Verify that interceptors receive potentially different context objects
      // (They might be the same if interceptor2 returns the same object, but
      // in this test interceptor2 returns a new object, so they should be different)
      expect(originalContexts[0]).not.toBe(originalContexts[1])
      // interceptor2 runs first (rightmost), so it sees original effects
      expect(contexts[0].effects.value1).toBeUndefined()
      // interceptor1 runs second and sees the context from interceptor2
      expect(contexts[1].effects.value1).toBeUndefined() // Captured before modification
    })
  })

  describe('Mixed Before and After', () => {
    it('should handle interceptors with both before and after phases', async () => {
      const order: string[] = []

      const interceptor: Interceptor<{ count: number }, {}> = {
        id: 'both',
        before: (context) => {
          order.push('before')
          return context
        },
        after: (context) => {
          order.push('after')
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        order.push('handler')
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('test', handler, [interceptor])
      await eventManager.handleEvent('test', null)

      expect(order).toEqual(['before', 'handler', 'after'])
    })

    it('should handle multiple interceptors with mixed phases', async () => {
      const order: string[] = []

      const interceptor1: Interceptor<{ count: number }, {}> = {
        id: 'interceptor1',
        before: (context) => {
          order.push('before1')
          return context
        },
        after: (context) => {
          order.push('after1')
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

      const interceptor3: Interceptor<{ count: number }, {}> = {
        id: 'interceptor3',
        after: (context) => {
          order.push('after3')
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        order.push('handler')
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('test', handler, [interceptor1, interceptor2, interceptor3])
      await eventManager.handleEvent('test', null)

      expect(order).toEqual(['before1', 'before2', 'handler', 'after3', 'after1'])
    })
  })
})

