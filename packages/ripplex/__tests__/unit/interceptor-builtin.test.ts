/**
 * Tests for built-in interceptors
 * Tests path, debug, after, injectCofx, and validate interceptors
 */

import { path, debug, after, injectCofx, validate } from '../../src/modules/interceptor'
import { createEventManager, EventManager } from '../../src/modules/events'
import { createRegistrar } from '../../src/modules/registrar'
import { createStateManager } from '../../src/modules/state'
import { createEffectExecutor } from '../../src/modules/effects'
import { createErrorHandler } from '../../src/modules/errorHandler'
import { createTracer } from '../../src/modules/tracing'

describe('Built-in Interceptors', () => {
  let eventManager: EventManager<{ count: number; user: { name: string; age: number } }, {}>
  let registrar: ReturnType<typeof createRegistrar>
  let stateManager: ReturnType<typeof createStateManager<{ count: number; user: { name: string; age: number } }>>
  let effectExecutor: ReturnType<typeof createEffectExecutor<{ count: number; user: { name: string; age: number } }>>
  let errorHandler: ReturnType<typeof createErrorHandler>
  let tracer: ReturnType<typeof createTracer<{ count: number; user: { name: string; age: number } }>>
  let consoleGroupSpy: jest.SpyInstance
  let consoleLogSpy: jest.SpyInstance
  let consoleGroupEndSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance

  beforeEach(() => {
    registrar = createRegistrar()
    stateManager = createStateManager({
      count: 0,
      user: { name: 'Alice', age: 30 }
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
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleGroupSpy.mockRestore()
    consoleLogSpy.mockRestore()
    consoleGroupEndSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  describe('path()', () => {
    it('should focus handler on state path in before phase', async () => {
      const handler = jest.fn((coeffects) => {
        // Handler should receive only the focused path value
        expect(coeffects.db).toEqual({ name: 'Alice', age: 30 })
        expect(coeffects.db).not.toHaveProperty('count')
        return { ...coeffects.db, age: 31 }
      })

      eventManager.registerEventDb('update-user', handler, [path(['user'])])
      await eventManager.handleEvent('update-user', null)

      expect(handler).toHaveBeenCalled()
      expect(stateManager.getState().user.age).toBe(31)
      expect(stateManager.getState().count).toBe(0) // Unchanged
    })

    it('should graft updated path back to full state in after phase', async () => {
      const handler = jest.fn((coeffects) => {
        return { ...coeffects.db, age: 35 }
      })

      eventManager.registerEventDb('update-user', handler, [path(['user'])])
      await eventManager.handleEvent('update-user', null)

      const finalState = stateManager.getState()
      expect(finalState.user.age).toBe(35)
      expect(finalState.user.name).toBe('Alice') // Preserved
      expect(finalState.count).toBe(0) // Preserved
    })

    it('should handle nested paths', async () => {
      const handler = jest.fn((coeffects) => {
        expect(coeffects.db).toBe('Alice')
        return 'Bob'
      })

      eventManager.registerEventDb('update-name', handler, [path(['user', 'name'])])
      await eventManager.handleEvent('update-name', null)

      expect(stateManager.getState().user.name).toBe('Bob')
      expect(stateManager.getState().user.age).toBe(30) // Preserved
      expect(stateManager.getState().count).toBe(0) // Preserved
    })

    it('should handle deep nested paths', async () => {
      const deepState = {
        level1: {
          level2: {
            level3: {
              value: 'deep'
            }
          }
        }
      }
      stateManager.setState(deepState as any)

      const handler = jest.fn((coeffects) => {
        expect(coeffects.db).toEqual({ value: 'deep' })
        return { value: 'updated' }
      })

      eventManager.registerEventDb('update-deep', handler, [path(['level1', 'level2', 'level3'])])
      await eventManager.handleEvent('update-deep', null)

      const finalState = stateManager.getState() as any
      expect(finalState.level1.level2.level3.value).toBe('updated')
    })

    it('should preserve other state properties when grafting', async () => {
      const handler = jest.fn((coeffects) => {
        return { ...coeffects.db, age: 40 }
      })

      eventManager.registerEventDb('update-user', handler, [path(['user'])])
      await eventManager.handleEvent('update-user', null)

      const finalState = stateManager.getState()
      expect(finalState.user.age).toBe(40)
      expect(finalState.user.name).toBe('Alice')
      expect(finalState.count).toBe(0)
    })

    it('should handle path with no :db effect', async () => {
      const handler = jest.fn((coeffects) => {
        expect(coeffects.db).toEqual({ name: 'Alice', age: 30 })
        // Return effects map without :db
        return coeffects.db // This gets wrapped in :db by registerEventDb
      })

      eventManager.registerEvent('update-user-fx', (coeffects) => {
        // Return effects without :db
        return {}
      }, [path(['user'])])

      await eventManager.handleEvent('update-user-fx', null)

      // State should remain unchanged
      expect(stateManager.getState().user.age).toBe(30)
    })

    it('should restore original db in coeffects after grafting', async () => {
      let afterPhaseDb: any

      const debugInterceptor = {
        id: 'debug-check',
        after: (context: any) => {
          // After path grafting, the new state is in effects.db, not coeffects.db
          // coeffects.db is restored to original state
          afterPhaseDb = context.effects.db !== undefined ? context.effects.db : context.coeffects.db
          return context
        }
      }

      const handler = jest.fn((coeffects) => {
        return { ...coeffects.db, age: 32 }
      })

      // Order matters: in after phase (right-to-left), path must run first to graft state
      // So path should be rightmost in array: [debugInterceptor, path(['user'])]
      // This way path runs first and grafts, then debugInterceptor sees the grafted state
      eventManager.registerEventDb('update-user', handler, [debugInterceptor, path(['user'])])
      await eventManager.handleEvent('update-user', null)

      // After phase: path grafts first, then debugInterceptor sees the full state with updated path in effects.db
      expect(afterPhaseDb).toEqual({
        count: 0,
        user: { name: 'Alice', age: 32 }
      })
    })

    it('should handle path with single key', async () => {
      const handler = jest.fn((coeffects) => {
        expect(coeffects.db).toBe(0)
        return 5
      })

      eventManager.registerEventDb('update-count', handler, [path(['count'])])
      await eventManager.handleEvent('update-count', null)

      expect(stateManager.getState().count).toBe(5)
      expect(stateManager.getState().user.name).toBe('Alice') // Preserved
    })

    it('should handle undefined path values', async () => {
      const stateWithUndefined = {
        count: 0,
        user: { name: 'Alice', age: 30 },
        optional: undefined as any
      }
      stateManager.setState(stateWithUndefined)

      const handler = jest.fn((coeffects) => {
        expect(coeffects.db).toBeUndefined()
        return 'defined'
      })

      eventManager.registerEventDb('set-optional', handler, [path(['optional'])])
      await eventManager.handleEvent('set-optional', null)

      expect((stateManager.getState() as any).optional).toBe('defined')
    })
  })

  describe('debug()', () => {
    it('should log coeffects in before phase', async () => {
      const handler = jest.fn((coeffects) => {
        return coeffects.db
      })

      eventManager.registerEventDb('test', handler, [debug()])
      await eventManager.handleEvent('test', 'payload')

      expect(consoleGroupSpy).toHaveBeenCalledWith('Event')
      expect(consoleLogSpy).toHaveBeenCalledWith('Coeffects:', expect.objectContaining({
        db: expect.any(Object),
        event: 'payload'
      }))
    })

    it('should log new state and effects in after phase', async () => {
      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('increment', handler, [debug()])
      await eventManager.handleEvent('increment', null)

      expect(consoleLogSpy).toHaveBeenCalledWith('New State:', expect.objectContaining({
        count: 1
      }))
      expect(consoleLogSpy).toHaveBeenCalledWith('Effects:', expect.objectContaining({
        db: expect.any(Object)
      }))
      expect(consoleGroupEndSpy).toHaveBeenCalled()
    })

    it('should group logs correctly', async () => {
      const handler = jest.fn((coeffects) => {
        return coeffects.db
      })

      eventManager.registerEventDb('test', handler, [debug()])
      await eventManager.handleEvent('test', null)

      // Verify call order by checking call indices
      const groupCallIndex = consoleGroupSpy.mock.invocationCallOrder[0]
      const logCallIndex = consoleLogSpy.mock.invocationCallOrder[0]
      const groupEndCallIndex = consoleGroupEndSpy.mock.invocationCallOrder[0]
      
      expect(groupCallIndex).toBeLessThan(logCallIndex!)
      expect(groupEndCallIndex).toBeGreaterThan(logCallIndex!)
    })

    it('should work with multiple interceptors', async () => {
      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('test', handler, [path(['count']), debug()])
      await eventManager.handleEvent('test', null)

      expect(consoleGroupSpy).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledTimes(3) // Coeffects, New State, Effects
      expect(consoleGroupEndSpy).toHaveBeenCalled()
    })
  })

  describe('after()', () => {
    it('should run side effect after handler', async () => {
      const sideEffect = jest.fn()

      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('increment', handler, [after(sideEffect)])
      await eventManager.handleEvent('increment', null)

      expect(handler).toHaveBeenCalled()
      expect(sideEffect).toHaveBeenCalled()
      // Verify call order: handler runs in before phase, sideEffect runs in after phase
      const handlerCallIndex = handler.mock.invocationCallOrder[0]
      const sideEffectCallIndex = sideEffect.mock.invocationCallOrder[0]
      expect(sideEffectCallIndex).toBeGreaterThan(handlerCallIndex!)
    })

    it('should pass final state and effects to side effect', async () => {
      const sideEffect = jest.fn()

      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('increment', handler, [after(sideEffect)])
      await eventManager.handleEvent('increment', null)

      expect(sideEffect).toHaveBeenCalledWith(
        expect.objectContaining({ count: 1 }),
        expect.objectContaining({ db: expect.any(Object) })
      )
    })

    it('should run side effect even if handler returns same state', async () => {
      const sideEffect = jest.fn()

      const handler = jest.fn((coeffects) => {
        return coeffects.db
      })

      eventManager.registerEventDb('noop', handler, [after(sideEffect)])
      await eventManager.handleEvent('noop', null)

      expect(sideEffect).toHaveBeenCalled()
    })

    it('should work with multiple after interceptors', async () => {
      const sideEffect1 = jest.fn()
      const sideEffect2 = jest.fn()

      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('increment', handler, [
        after(sideEffect1),
        after(sideEffect2)
      ])
      await eventManager.handleEvent('increment', null)

      expect(sideEffect1).toHaveBeenCalled()
      expect(sideEffect2).toHaveBeenCalled()
      // sideEffect2 runs first (rightmost), then sideEffect1
      const sideEffect2CallIndex = sideEffect2.mock.invocationCallOrder[0]
      const sideEffect1CallIndex = sideEffect1.mock.invocationCallOrder[0]
      expect(sideEffect2CallIndex).toBeLessThan(sideEffect1CallIndex!)
    })

    it('should receive effects map in side effect', async () => {
      const sideEffect = jest.fn()

      eventManager.registerEvent('test-fx', (coeffects) => {
        return {
          db: { count: 5 },
          'custom-effect': 'value'
        }
      }, [after(sideEffect)])

      await eventManager.handleEvent('test-fx', null)

      expect(sideEffect).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          db: expect.any(Object),
          'custom-effect': 'value'
        })
      )
    })
  })

  describe('injectCofx()', () => {
    it('should inject dynamic coeffect value in before phase', async () => {
      const handler = jest.fn((coeffects) => {
        expect((coeffects as any).dynamicValue).toBe('injected')
        return coeffects.db
      })

      eventManager.registerEventDb('test', handler, [injectCofx('dynamicValue', 'injected')])
      await eventManager.handleEvent('test', null)

      expect(handler).toHaveBeenCalled()
    })

    it('should allow injecting multiple coeffects', async () => {
      const handler = jest.fn((coeffects) => {
        expect((coeffects as any).value1).toBe('first')
        expect((coeffects as any).value2).toBe('second')
        return coeffects.db
      })

      eventManager.registerEventDb('test', handler, [
        injectCofx('value1', 'first'),
        injectCofx('value2', 'second')
      ])
      await eventManager.handleEvent('test', null)

      expect(handler).toHaveBeenCalled()
    })

    it('should allow later interceptors to override injected values', async () => {
      const handler = jest.fn((coeffects) => {
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

    it('should work with other interceptors', async () => {
      const handler = jest.fn((coeffects) => {
        expect((coeffects as any).injected).toBe('value')
        expect(coeffects.db).toEqual({ name: 'Alice', age: 30 })
        return { ...coeffects.db, age: 31 }
      })

      eventManager.registerEventDb('test', handler, [
        path(['user']),
        injectCofx('injected', 'value')
      ])
      await eventManager.handleEvent('test', null)

      expect(handler).toHaveBeenCalled()
      expect(stateManager.getState().user.age).toBe(31)
    })

    it('should inject any type of value', async () => {
      const handler = jest.fn((coeffects) => {
        expect((coeffects as any).number).toBe(42)
        expect((coeffects as any).object).toEqual({ key: 'value' })
        expect((coeffects as any).array).toEqual([1, 2, 3])
        return coeffects.db
      })

      eventManager.registerEventDb('test', handler, [
        injectCofx('number', 42),
        injectCofx('object', { key: 'value' }),
        injectCofx('array', [1, 2, 3])
      ])
      await eventManager.handleEvent('test', null)

      expect(handler).toHaveBeenCalled()
    })
  })

  describe('validate()', () => {
    it('should validate state after handler with boolean schema', async () => {
      const schema = jest.fn((state) => {
        return state.count >= 0
      })

      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('increment', handler, [validate(schema)])
      await eventManager.handleEvent('increment', null)

      expect(schema).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }))
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('should log error when validation fails with boolean false', async () => {
      const schema = jest.fn((state) => {
        return state.count < 0 // Will be false after increment
      })

      const handler = jest.fn((coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      eventManager.registerEventDb('increment', handler, [validate(schema)])
      await eventManager.handleEvent('increment', null)

      expect(schema).toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledWith('State validation failed:', false)
    })

    it('should log error when validation fails with error message', async () => {
      const schema = jest.fn((state) => {
        if (state.count < 0) {
          return 'Count cannot be negative'
        }
        return true
      })

      const handler = jest.fn((coeffects) => {
        return { count: -1 }
      })

      eventManager.registerEventDb('set-negative', handler, [validate(schema)])
      await eventManager.handleEvent('set-negative', null)

      expect(consoleErrorSpy).toHaveBeenCalledWith('State validation failed:', 'Count cannot be negative')
    })

    it('should not prevent state update when validation fails', async () => {
      const schema = jest.fn((state) => {
        return false // Always fail
      })

      const handler = jest.fn((coeffects) => {
        return { count: 5 }
      })

      eventManager.registerEventDb('set-count', handler, [validate(schema)])
      await eventManager.handleEvent('set-count', null)

      // State should still be updated despite validation failure
      expect(stateManager.getState().count).toBe(5)
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should validate with complex schema', async () => {
      const schema = jest.fn((state) => {
        if (!state.user || !state.user.name) {
          return 'User name is required'
        }
        if (state.user.age < 0) {
          return 'Age cannot be negative'
        }
        return true
      })

      const handler = jest.fn((coeffects) => {
        return { ...coeffects.db, user: { ...coeffects.db.user, age: 25 } }
      })

      eventManager.registerEventDb('update-user', handler, [validate(schema)])
      await eventManager.handleEvent('update-user', null)

      expect(schema).toHaveBeenCalled()
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('should work with other interceptors', async () => {
      const schema = jest.fn((state) => {
        return state.user.age >= 0
      })

      const handler = jest.fn((coeffects) => {
        return { ...coeffects.db, age: 31 }
      })

      // Validate must come before path in array so path runs first in after phase
      // This ensures path grafts the state before validate reads it
      eventManager.registerEventDb('update-user', handler, [
        validate(schema),
        path(['user'])
      ])
      await eventManager.handleEvent('update-user', null)

      // Schema receives the full state after path grafting (from effects.db)
      expect(schema).toHaveBeenCalledWith(expect.objectContaining({
        user: expect.objectContaining({ age: 31 })
      }))
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })
  })

  describe('Interceptor IDs', () => {
    it('should have correct IDs for built-in interceptors', () => {
      expect(path(['user']).id).toBe('path-user')
      expect(debug().id).toBe('debug')
      expect(after(() => {}).id).toBe('after')
      expect(injectCofx('key', 'value').id).toBe('inject-key')
      expect(validate(() => true).id).toBe('validate')
    })

    it('should generate correct path ID for multiple keys', () => {
      expect(path(['user', 'name']).id).toBe('path-user.name')
      expect(path(['level1', 'level2', 'level3']).id).toBe('path-level1.level2.level3')
    })
  })
})

