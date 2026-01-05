/**
 * Integration tests for interceptor composition
 * Tests multiple interceptors working together
 */

import { path, debug, after, injectCofx, validate } from '../../src/modules/interceptor'
import { createEventManager, EventManager } from '../../src/modules/events'
import { createRegistrar } from '../../src/modules/registrar'
import { createStateManager } from '../../src/modules/state'
import { createEffectExecutor } from '../../src/modules/effects'
import { createErrorHandler } from '../../src/modules/errorHandler'
import { createTracer } from '../../src/modules/tracing'

describe('Interceptor Composition', () => {
  let eventManager: EventManager<
    { 
      count: number
      user: { name: string; age: number; email: string }
      settings: { theme: string }
    },
    {}
  >
  let registrar: ReturnType<typeof createRegistrar>
  let stateManager: ReturnType<typeof createStateManager<{
    count: number
    user: { name: string; age: number; email: string }
    settings: { theme: string }
  }>>
  let effectExecutor: ReturnType<typeof createEffectExecutor<{
    count: number
    user: { name: string; age: number; email: string }
    settings: { theme: string }
  }>>
  let errorHandler: ReturnType<typeof createErrorHandler>
  let tracer: ReturnType<typeof createTracer<{
    count: number
    user: { name: string; age: number; email: string }
    settings: { theme: string }
  }>>
  let consoleGroupSpy: jest.SpyInstance
  let consoleLogSpy: jest.SpyInstance
  let consoleGroupEndSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    registrar = createRegistrar()
    stateManager = createStateManager({
      count: 0,
      user: { name: 'Alice', age: 30, email: 'alice@example.com' },
      settings: { theme: 'light' }
    })
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

    consoleGroupSpy = jest.spyOn(console, 'group').mockImplementation(() => {})
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    consoleGroupEndSpy = jest.spyOn(console, 'groupEnd').mockImplementation(() => {})
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleGroupSpy.mockRestore()
    consoleLogSpy.mockRestore()
    consoleGroupEndSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('Path + Debug + After', () => {
    it('should work together correctly', async () => {
      const sideEffect = jest.fn()
      const handler = jest.fn((coeffects) => {
        expect(coeffects.db).toEqual({ name: 'Alice', age: 30, email: 'alice@example.com' })
        return { ...coeffects.db, age: 31 }
      })

      eventManager.registerEventDb('update-user', handler, [
        path(['user']),
        debug(),
        after(sideEffect)
      ])
      await eventManager.handleEvent('update-user', null)

      // Handler should receive focused state
      expect(handler).toHaveBeenCalled()
      
      // Debug should log
      expect(consoleGroupSpy).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalled()
      
      // Side effect should run
      expect(sideEffect).toHaveBeenCalled()
      
      // State should be updated correctly
      expect(stateManager.getState().user.age).toBe(31)
      expect(stateManager.getState().user.name).toBe('Alice')
      expect(stateManager.getState().count).toBe(0)
    })

    it('should execute in correct order', async () => {
      const order: string[] = []
      const sideEffect = jest.fn(() => {
        order.push('side-effect')
      })

      const debugInterceptor = {
        id: 'debug',
        before: (context: any) => {
          order.push('debug-before')
          console.group('Event')
          return context
        },
        after: (context: any) => {
          order.push('debug-after')
          console.groupEnd()
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        order.push('handler')
        return { ...coeffects.db, age: 32 }
      })

      eventManager.registerEventDb('update-user', handler, [
        path(['user']),
        debugInterceptor as any,
        after(sideEffect)
      ])
      await eventManager.handleEvent('update-user', null)

      // Before phase: path, debug, handler
      // After phase: side-effect, debug (reverse order)
      expect(order).toEqual([
        'debug-before',
        'handler',
        'side-effect',
        'debug-after'
      ])
    })
  })

  describe('Path + InjectCofx', () => {
    it('should inject coeffect and focus on path', async () => {
      const handler = jest.fn((coeffects) => {
        expect((coeffects as any).userId).toBe('user-123')
        expect(coeffects.db).toEqual({ name: 'Alice', age: 30, email: 'alice@example.com' })
        return { ...coeffects.db, age: 33 }
      })

      eventManager.registerEventDb('update-user', handler, [
        path(['user']),
        injectCofx('userId', 'user-123')
      ])
      await eventManager.handleEvent('update-user', null)

      expect(handler).toHaveBeenCalled()
      expect(stateManager.getState().user.age).toBe(33)
    })

    it('should preserve injected coeffect through path grafting', async () => {
      const afterInterceptor = {
        id: 'check',
        after: (context: any) => {
          // After path grafting, injected coeffect should still be available
          expect((context.coeffects as any).userId).toBe('user-123')
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        return { ...coeffects.db, age: 34 }
      })

      eventManager.registerEventDb('update-user', handler, [
        path(['user']),
        injectCofx('userId', 'user-123'),
        afterInterceptor as any
      ])
      await eventManager.handleEvent('update-user', null)

      expect(handler).toHaveBeenCalled()
    })
  })

  describe('Path + Validate', () => {
    it('should validate full state after path grafting', async () => {
      const schema = jest.fn((state) => {
        // Should receive full state after path grafting (from effects.db)
        expect(state).toHaveProperty('user')
        expect(state).toHaveProperty('count')
        expect(state.user.age).toBe(35)
        return state.user.age >= 0
      })

      const handler = jest.fn((coeffects) => {
        return { ...coeffects.db, age: 35 }
      })

      // Validate must come before path in array so path runs first in after phase (right-to-left)
      // This ensures path grafts the state before validate reads it
      eventManager.registerEventDb('update-user', handler, [
        validate(schema),
        path(['user'])
      ])
      await eventManager.handleEvent('update-user', null)

      expect(schema).toHaveBeenCalled()
      expect(consoleErrorSpy).not.toHaveBeenCalled()
      expect(stateManager.getState().user.age).toBe(35)
    })

    it('should validate with path-specific rules', async () => {
      const schema = jest.fn((state) => {
        // Validate receives full state after path grafting
        if (state.user && state.user.age < 18) {
          return 'User must be at least 18 years old'
        }
        return true
      })

      const handler = jest.fn((coeffects) => {
        return { ...coeffects.db, age: 17 }
      })

      // Validate must come before path in array so path runs first in after phase
      eventManager.registerEventDb('update-user', handler, [
        validate(schema),
        path(['user'])
      ])
      await eventManager.handleEvent('update-user', null)

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'State validation failed:',
        'User must be at least 18 years old'
      )
      // State should still be updated despite validation failure
      expect(stateManager.getState().user.age).toBe(17)
    })
  })

  describe('Multiple Path Interceptors', () => {
    it('should handle nested path operations', async () => {
      // This tests that path interceptors can work with deeply nested state
      const handler = jest.fn((coeffects) => {
        expect(coeffects.db).toBe('alice@example.com')
        return 'bob@example.com'
      })

      eventManager.registerEventDb('update-email', handler, [
        path(['user', 'email'])
      ])
      await eventManager.handleEvent('update-email', null)

      expect(stateManager.getState().user.email).toBe('bob@example.com')
      expect(stateManager.getState().user.name).toBe('Alice')
      expect(stateManager.getState().user.age).toBe(30)
    })
  })

  describe('InjectCofx + After', () => {
    it('should pass injected coeffect to side effect', async () => {
      const sideEffect = jest.fn()

      const handler = jest.fn((coeffects) => {
        expect((coeffects as any).requestId).toBe('req-456')
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('increment', handler, [
        injectCofx('requestId', 'req-456'),
        after(sideEffect)
      ])
      await eventManager.handleEvent('increment', null)

      expect(handler).toHaveBeenCalled()
      expect(sideEffect).toHaveBeenCalled()
      // Side effect receives final state, not coeffects
      expect(sideEffect).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object)
      )
    })
  })

  describe('Debug + Validate', () => {
    it('should debug and validate together', async () => {
      const schema = jest.fn((state) => {
        return state.count >= 0
      })

      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('increment', handler, [
        debug(),
        validate(schema)
      ])
      await eventManager.handleEvent('increment', null)

      expect(consoleGroupSpy).toHaveBeenCalled()
      expect(schema).toHaveBeenCalled()
      expect(consoleErrorSpy).not.toHaveBeenCalled()
      expect(stateManager.getState().count).toBe(1)
    })
  })

  describe('Complex Composition', () => {
    it('should handle all interceptors together', async () => {
      const sideEffect = jest.fn()
      const schema = jest.fn((state) => {
        return state.user.age >= 0 && state.user.age <= 150
      })

      const handler = jest.fn((coeffects) => {
        expect((coeffects as any).timestamp).toBeDefined()
        expect(coeffects.db).toEqual({ name: 'Alice', age: 30, email: 'alice@example.com' })
        return { ...coeffects.db, age: 40 }
      })

      // Order matters: in after phase (right-to-left), we want:
      // 1. path grafts state first
      // 2. validate sees grafted state
      // 3. debug logs
      // 4. after runs side effect
      // So array order: [after, debug, validate, injectCofx, path]
      eventManager.registerEventDb('update-user', handler, [
        after(sideEffect),
        debug(),
        validate(schema),
        injectCofx('timestamp', Date.now()),
        path(['user'])
      ])
      await eventManager.handleEvent('update-user', null)

      expect(handler).toHaveBeenCalled()
      expect(consoleGroupSpy).toHaveBeenCalled()
      expect(schema).toHaveBeenCalled()
      expect(sideEffect).toHaveBeenCalled()
      expect(consoleErrorSpy).not.toHaveBeenCalled()
      expect(stateManager.getState().user.age).toBe(40)
    })

    it('should maintain correct execution order in complex composition', async () => {
      const order: string[] = []
      const sideEffect = jest.fn(() => {
        order.push('side-effect')
      })

      const debugInterceptor = {
        id: 'debug',
        before: (context: any) => {
          order.push('debug-before')
          return context
        },
        after: (context: any) => {
          order.push('debug-after')
          return context
        }
      }

      const pathInterceptor = {
        id: 'path',
        before: (context: any) => {
          order.push('path-before')
          return path(['user']).before!(context)
        },
        after: (context: any) => {
          order.push('path-after')
          return path(['user']).after!(context)
        }
      }

      const handler = jest.fn((coeffects) => {
        order.push('handler')
        return { ...coeffects.db, age: 41 }
      })

      eventManager.registerEventDb('update-user', handler, [
        pathInterceptor as any,
        injectCofx('id', 'test'),
        debugInterceptor as any,
        after(sideEffect)
      ])
      await eventManager.handleEvent('update-user', null)

      // Before: path, inject, debug, handler
      // After: side-effect, debug, path (reverse)
      expect(order).toEqual([
        'path-before',
        'debug-before',
        'handler',
        'side-effect',
        'debug-after',
        'path-after'
      ])
    })
  })

  describe('Interceptor Order Matters', () => {
    it('should apply interceptors in registration order', async () => {
      const handler = jest.fn((coeffects) => {
        // Should see value from injectCofx2 (last one wins)
        expect((coeffects as any).value).toBe('second')
        return coeffects.db
      })

      eventManager.registerEventDb('test', handler, [
        injectCofx('value', 'first'),
        injectCofx('value', 'second')
      ])
      await eventManager.handleEvent('test', null)

      expect(handler).toHaveBeenCalled()
    })

    it('should apply path before other interceptors', async () => {
      const handler = jest.fn((coeffects) => {
        // If path comes first, handler sees focused state
        // If path comes after injectCofx, handler still sees focused state
        expect(coeffects.db).toEqual({ name: 'Alice', age: 30, email: 'alice@example.com' })
        return { ...coeffects.db, age: 42 }
      })

      eventManager.registerEventDb('update-user', handler, [
        injectCofx('test', 'value'),
        path(['user'])
      ])
      await eventManager.handleEvent('update-user', null)

      expect(handler).toHaveBeenCalled()
      expect(stateManager.getState().user.age).toBe(42)
    })

    it('should validate after path grafting', async () => {
      const schema = jest.fn((state) => {
        // Should see full state with updated path (from effects.db after grafting)
        expect(state.user.age).toBe(43)
        return true
      })

      const handler = jest.fn((coeffects) => {
        return { ...coeffects.db, age: 43 }
      })

      // Validate must come before path in array so path runs first in after phase
      eventManager.registerEventDb('update-user', handler, [
        validate(schema),
        path(['user'])
      ])
      await eventManager.handleEvent('update-user', null)

      // Schema should see the full state after path grafting
      expect(schema).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ age: 43 })
        })
      )
    })
  })

  describe('Error Handling in Composition', () => {
    it('should handle errors in one interceptor without breaking others', async () => {
      const errorInterceptor = {
        id: 'error',
        before: (context: any) => {
          throw new Error('Interceptor error')
        }
      }

      const handler = jest.fn((coeffects) => {
        // Should not be called
        return coeffects.db
      })

      const sideEffect = jest.fn()

      jest.spyOn(errorHandler, 'handle').mockResolvedValue(undefined)

      eventManager.registerEventDb('test', handler, [
        path(['user']),
        errorInterceptor as any,
        after(sideEffect)
      ])
      await eventManager.handleEvent('test', null)

      expect(handler).not.toHaveBeenCalled()
      expect(sideEffect).not.toHaveBeenCalled()
      // State should remain unchanged
      expect(stateManager.getState().user.age).toBe(30)
    })

    it('should handle errors in after phase', async () => {
      const errorInterceptor = {
        id: 'error',
        after: (context: any) => {
          throw new Error('After phase error')
        }
      }

      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      const sideEffect = jest.fn()

      jest.spyOn(errorHandler, 'handle').mockResolvedValue(undefined)

      // errorInterceptor is rightmost, so it runs first in after phase and throws
      // sideEffect won't run because error stops execution
      eventManager.registerEventDb('increment', handler, [
        after(sideEffect),
        errorInterceptor as any
      ])
      await eventManager.handleEvent('increment', null)

      expect(handler).toHaveBeenCalled()
      // errorInterceptor runs first (rightmost), throws error, so sideEffect never runs
      expect(sideEffect).not.toHaveBeenCalled()
      // State should not be updated if after phase fails
      expect(stateManager.getState().count).toBe(0)
    })
  })
})

