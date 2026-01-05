/**
 * Tests for Store API methods
 * Tests all public methods exposed by the Store API to ensure they delegate correctly
 */

import { createStore } from '../../src/modules/store'
import { path, debug } from '../../src/modules/interceptor'
import { EffectMap } from '../../src/modules/types'
import { createSyncScheduler } from '../utils/testScheduler'

describe('Store API Methods', () => {
  let store: ReturnType<typeof createStore<{ count: number }>>

  beforeEach(() => {
    store = createStore({ initialState: { count: 0 } })
  })

  describe('getState', () => {
    it('should return current state', () => {
      expect(store.getState()).toEqual({ count: 0 })
    })

    it('should return updated state after dispatch', async () => {
      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      await store.dispatch('increment', null)
      expect(store.getState()).toEqual({ count: 1 })
    })

    it('should return readonly state (same reference)', () => {
      const state1 = store.getState()
      const state2 = store.getState()
      expect(state1).toBe(state2)
    })
  })

  describe('dispatch', () => {
    it('should dispatch events', async () => {
      let handlerCalled = false
      store.registerEventDb('test-event', (coeffects, payload) => {
        handlerCalled = true
        expect(payload).toBe('test-payload')
        return coeffects.db
      })

      await store.dispatch('test-event', 'test-payload')
      expect(handlerCalled).toBe(true)
    })

    it('should return a promise', () => {
      store.registerEventDb('test', (coeffects) => coeffects.db)
      const result = store.dispatch('test', null)
      expect(result).toBeInstanceOf(Promise)
    })

    it('should handle missing event handler gracefully', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      
      await store.dispatch('missing-event', null)
      
      expect(consoleWarnSpy).toHaveBeenCalled()
      consoleWarnSpy.mockRestore()
    })

    it('should process events sequentially', async () => {
      const order: string[] = []
      
      store.registerEventDb('first', (coeffects) => {
        order.push('first')
        return { count: coeffects.db.count + 1 }
      })

      store.registerEventDb('second', (coeffects) => {
        order.push('second')
        return { count: coeffects.db.count + 1 }
      })

      await store.dispatch('first', null)
      await store.dispatch('second', null)

      expect(order).toEqual(['first', 'second'])
    })
  })

  describe('flush', () => {
    it('should flush event queue', async () => {
      let callCount = 0
      store.registerEventDb('test', (coeffects) => {
        callCount++
        return coeffects.db
      })

      // Dispatch events without awaiting (they'll be queued)
      const promise1 = store.dispatch('test', null)
      const promise2 = store.dispatch('test', null)
      
      // Events may start processing immediately, so we just verify flush completes all
      await store.flush()
      
      // Wait for all dispatches to complete
      await Promise.all([promise1, promise2])
      
      expect(callCount).toBe(2)
    })

    it('should return a promise', () => {
      const result = store.flush()
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('registerEventDb', () => {
    it('should register event handler that returns state', async () => {
      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      await store.dispatch('increment', null)
      expect(store.getState()).toEqual({ count: 1 })
    })

    it('should register event handler with interceptors', async () => {
      const interceptorBefore = jest.fn()
      const customInterceptor = {
        before: (context: any) => {
          interceptorBefore()
          return context
        }
      }

      store.registerEventDb('test', (coeffects) => {
        return coeffects.db
      }, [customInterceptor])

      await store.dispatch('test', null)
      expect(interceptorBefore).toHaveBeenCalled()
    })

    it('should allow overwriting event handlers', async () => {
      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 10 }
      })

      await store.dispatch('increment', null)
      expect(store.getState()).toEqual({ count: 10 })
    })
  })

  describe('registerEvent', () => {
    it('should register event handler that returns effects', async () => {
      store.registerEvent('set-count', (coeffects, payload: number): EffectMap => {
        return {
          db: { count: payload }
        }
      })

      await store.dispatch('set-count', 42)
      expect(store.getState()).toEqual({ count: 42 })
    })

    it('should register event handler with interceptors', async () => {
      const interceptorAfter = jest.fn()
      const customInterceptor = {
        after: (context: any) => {
          interceptorAfter()
          return context
        }
      }

      store.registerEvent('test', (coeffects): EffectMap => {
        return {}
      }, [customInterceptor])

      await store.dispatch('test', null)
      expect(interceptorAfter).toHaveBeenCalled()
    })
  })

  describe('deregisterEvent', () => {
    it('should remove event handler', async () => {
      store.registerEventDb('test', (coeffects) => {
        return { count: 1 }
      })

      store.deregisterEvent('test')

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      await store.dispatch('test', null)
      
      expect(consoleWarnSpy).toHaveBeenCalled()
      expect(store.getState()).toEqual({ count: 0 })
      consoleWarnSpy.mockRestore()
    })

    it('should handle deregistering non-existent event', () => {
      expect(() => {
        store.deregisterEvent('non-existent')
      }).not.toThrow()
    })
  })

  describe('registerEffect', () => {
    it('should register custom effect handler', async () => {
      const effectHandler = jest.fn().mockResolvedValue(undefined)
      
      store.registerEffect('custom-effect', effectHandler)

      store.registerEvent('test', (coeffects): EffectMap => {
        return {
          'custom-effect': { data: 'test' }
        } as any
      })

      await store.dispatch('test', null)
      expect(effectHandler).toHaveBeenCalledWith({ data: 'test' }, expect.anything())
    })

    it('should warn when overwriting effect handler', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      
      store.registerEffect('test-effect', () => {})
      store.registerEffect('test-effect', () => {})

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Effect handler for "test-effect" is being overwritten')
      )
      consoleWarnSpy.mockRestore()
    })
  })

  describe('registerSubscription', () => {
    it('should register a subscription', () => {
      store.registerSubscription('double-count', {
        compute: (state) => state.count * 2
      })

      const result = store.query('double-count', [])
      expect(result).toBe(0)
    })

    it('should register subscription with params', () => {
      store.registerSubscription('multiply', {
        compute: (state, multiplier: number) => state.count * multiplier
      })

      const result = store.query('multiply', [5])
      expect(result).toBe(0)
    })

    it('should register subscription with dependencies', () => {
      store.registerSubscription('base', {
        compute: (state) => state.count
      })

      store.registerSubscription('double', {
        deps: ['base'],
        combine: ([base]) => base * 2
      })

      const result = store.query('double', [])
      expect(result).toBe(0)
    })
  })

  describe('subscribe', () => {
    it('should subscribe to subscription and return unsubscribe function', () => {
      store.registerSubscription('count', {
        compute: (state) => state.count
      })

      const callback = jest.fn()
      const unsubscribe = store.subscribe('count', [], callback)

      expect(typeof unsubscribe).toBe('function')
    })

    it('should call callback when subscription result changes', async () => {
      const scheduler = createSyncScheduler()
      const testStore = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      testStore.registerSubscription('count', {
        compute: (state) => state.count
      })

      const callback = jest.fn()
      testStore.subscribe('count', [], callback)

      testStore.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      await testStore.dispatch('increment', null)
      
      // Manually flush the scheduler
      scheduler.flush()
      
      expect(callback).toHaveBeenCalledWith(1)
    })

    it('should unsubscribe when unsubscribe function is called', async () => {
      const scheduler = createSyncScheduler()
      const testStore = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      testStore.registerSubscription('count', {
        compute: (state) => state.count
      })

      const callback = jest.fn()
      const unsubscribe = testStore.subscribe('count', [], callback)

      // Callback is called immediately on subscribe with initial state
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenLastCalledWith(0)

      // Clear the mock to only track calls after unsubscribe
      callback.mockClear()

      // Unsubscribe before any state changes
      unsubscribe()

      testStore.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      await testStore.dispatch('increment', null)
      
      // Manually flush the scheduler
      scheduler.flush()

      // Callback should not be called after unsubscribe
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('query', () => {
    it('should query subscription result', () => {
      store.registerSubscription('double-count', {
        compute: (state) => state.count * 2
      })

      const result = store.query('double-count', [])
      expect(result).toBe(0)
    })

    it('should query subscription with params', () => {
      store.registerSubscription('multiply', {
        compute: (state, multiplier: number) => state.count * multiplier
      })

      const result = store.query('multiply', [3])
      expect(result).toBe(0)
    })

    it('should return undefined for missing subscription', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      
      const result = store.query('missing', [])
      
      expect(result).toBeUndefined()
      consoleErrorSpy.mockRestore()
    })
  })

  describe('getSubscription', () => {
    it('should return subscription instance', () => {
      store.registerSubscription('count', {
        compute: (state) => state.count
      })

      const subscription = store.getSubscription('count', [])
      expect(subscription).toBeDefined()
    })

    it('should return same subscription for same key and params', () => {
      store.registerSubscription('count', {
        compute: (state) => state.count
      })

      const sub1 = store.getSubscription('count', [])
      const sub2 = store.getSubscription('count', [])
      expect(sub1).toBe(sub2)
    })
  })

  describe('registerErrorHandler', () => {
    it('should register error handler', async () => {
      const errorHandler = jest.fn()
      
      store.registerErrorHandler(errorHandler)

      store.registerEvent('error-event', () => {
        throw new Error('Test error')
      })

      await store.dispatch('error-event', null)
      
      expect(errorHandler).toHaveBeenCalled()
      const callArgs = errorHandler.mock.calls[0]
      expect(callArgs[0]).toBeInstanceOf(Error)
      expect(callArgs[1].eventKey).toBe('error-event')
    })

    it('should register error handler with config', async () => {
      const errorHandler = jest.fn()
      
      store.registerErrorHandler(errorHandler, { rethrow: true })

      store.registerEvent('error-event', () => {
        throw new Error('Test error')
      })

      await expect(store.dispatch('error-event', null)).rejects.toThrow('Test error')
    })
  })

  describe('getInterceptors', () => {
    it('should return interceptors for event', () => {
      const interceptors = [path(['count']), debug('test')]
      
      store.registerEventDb('test', (coeffects) => {
        return coeffects.db
      }, interceptors)

      const result = store.getInterceptors('test')
      // The result includes user interceptors plus the db-handler wrapper
      expect(result).toBeDefined()
      expect(result!.length).toBe(interceptors.length + 1) // user interceptors + db-handler
      // Verify user interceptors are included
      expect(result!.slice(0, interceptors.length)).toEqual(interceptors)
      // Verify db-handler is at the end
      expect(result![result!.length - 1].id).toBe('db-handler')
    })

    it('should return interceptors array for event without user interceptors', () => {
      store.registerEventDb('test', (coeffects) => {
        return coeffects.db
      })

      const result = store.getInterceptors('test')
      // Even without user interceptors, db-handler wrapper is added
      expect(result).toBeDefined()
      expect(result!.length).toBe(1)
      expect(result![0].id).toBe('db-handler')
    })

    it('should return undefined for non-existent event', () => {
      const result = store.getInterceptors('non-existent')
      expect(result).toBeUndefined()
    })
  })

  describe('registerTraceCallback', () => {
    it('should register trace callback', (done) => {
      const store = createStore({
        initialState: { count: 0 },
        tracing: { enabled: true }
      })

      const callback = jest.fn((traces) => {
        expect(traces.length).toBeGreaterThan(0)
        done()
      })

      store.registerTraceCallback('test', callback)

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      store.dispatch('increment', null)
    })

    it('should warn when tracing is not enabled', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      
      store.registerTraceCallback('test', () => {})

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tracing is not enabled')
      )
      consoleWarnSpy.mockRestore()
    })
  })

  describe('removeTraceCallback', () => {
    it('should remove trace callback', (done) => {
      const store = createStore({
        initialState: { count: 0 },
        tracing: { enabled: true }
      })

      const callback1 = jest.fn()
      const callback2 = jest.fn((traces) => {
        expect(callback1).not.toHaveBeenCalled()
        expect(traces.length).toBeGreaterThan(0)
        done()
      })

      store.registerTraceCallback('callback1', callback1)
      store.registerTraceCallback('callback2', callback2)
      store.removeTraceCallback('callback1')

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      store.dispatch('increment', null)
    })
  })

  describe('API Integration', () => {
    it('should work with all API methods together', async () => {
      // Register event
      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      // Register subscription
      store.registerSubscription('double-count', {
        compute: (state) => state.count * 2
      })

      // Register effect
      const effectHandler = jest.fn()
      store.registerEffect('log', effectHandler)

      // Subscribe
      const subscriptionCallback = jest.fn()
      store.subscribe('double-count', [], subscriptionCallback)

      // Dispatch
      await store.dispatch('increment', null)

      // Query
      const result = store.query('double-count', [])
      expect(result).toBe(2)

      // Get state
      expect(store.getState()).toEqual({ count: 1 })

      // Get interceptors
      const interceptors = store.getInterceptors('increment')
      // registerEventDb always adds a db-handler interceptor
      expect(interceptors).toBeDefined()
      expect(interceptors!.length).toBe(1)
      expect(interceptors![0].id).toBe('db-handler')
    })
  })
})

