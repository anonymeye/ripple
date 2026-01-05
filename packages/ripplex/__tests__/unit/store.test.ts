/**
 * Tests for store creation
 * Tests createStore() with various configurations: initial state, coeffect providers, tracing, and store isolation
 */

import { createStore } from '../../src/modules/store'
import { createSyncScheduler } from '../utils/testScheduler'

describe('Store Creation', () => {
  describe('createStore', () => {
    it('should create a store with initial state', () => {
      const initialState = { count: 0, name: 'test' }
      const store = createStore({ initialState })

      expect(store).toBeDefined()
      expect(store.getState()).toBe(initialState)
      expect(store.getState()).toEqual({ count: 0, name: 'test' })
    })

    it('should create a store with empty state', () => {
      const store = createStore({ initialState: {} })

      expect(store).toBeDefined()
      expect(store.getState()).toEqual({})
    })

    it('should create a store with complex initial state', () => {
      const initialState = {
        users: {
          current: { id: 1, name: 'Alice' },
          list: [{ id: 1, name: 'Alice' }]
        },
        settings: {
          theme: 'dark',
          notifications: true
        }
      }
      const store = createStore({ initialState })

      expect(store.getState()).toEqual(initialState)
    })

    it('should create a store with coeffect providers', () => {
      interface CustomCofx {
        userId: number
        timestamp: number
      }

      const store = createStore<{ count: number }, CustomCofx>({
        initialState: { count: 0 },
        coeffects: {
          userId: () => 123,
          timestamp: () => Date.now()
        }
      })

      expect(store).toBeDefined()
      
      // Test that coeffects are available in handlers
      let receivedCofx: CustomCofx | undefined
      store.registerEvent('test-event', (coeffects) => {
        receivedCofx = {
          userId: coeffects.userId,
          timestamp: coeffects.timestamp
        }
        return {}
      })

      return store.dispatch('test-event', null).then(() => {
        expect(receivedCofx).toBeDefined()
        expect(receivedCofx!.userId).toBe(123)
        expect(typeof receivedCofx!.timestamp).toBe('number')
      })
    })

    it('should create a store with onStateChange callback', async () => {
      const onStateChange = jest.fn()
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        onStateChange,
        __scheduler: scheduler
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      await store.dispatch('increment', null)
      
      // Manually flush the scheduler
      scheduler.flush()

      expect(onStateChange).toHaveBeenCalledWith({ count: 1 })
    })

    it('should create a store with error handler', () => {
      const errorHandler = jest.fn()
      const store = createStore({
        initialState: { count: 0 },
        errorHandler: {
          handler: errorHandler
        }
      })

      store.registerEvent('error-event', () => {
        throw new Error('Test error')
      })

      return store.dispatch('error-event', null).then(() => {
        expect(errorHandler).toHaveBeenCalled()
        const callArgs = errorHandler.mock.calls[0]
        expect(callArgs[0]).toBeInstanceOf(Error)
        expect(callArgs[0].message).toBe('Test error')
        expect(callArgs[1].eventKey).toBe('error-event')
      })
    })

    it('should create a store with error handler and rethrow config', () => {
      const errorHandler = jest.fn()
      const store = createStore({
        initialState: { count: 0 },
        errorHandler: {
          handler: errorHandler,
          rethrow: true
        }
      })

      store.registerEvent('error-event', () => {
        throw new Error('Test error')
      })

      return expect(store.dispatch('error-event', null)).rejects.toThrow('Test error')
    })

    it('should create a store with tracing disabled (default)', () => {
      const traceCallback = jest.fn()
      const store = createStore({
        initialState: { count: 0 }
      })

      store.registerTraceCallback('test', traceCallback)

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      return store.dispatch('increment', null).then(() => {
        // Tracing is disabled by default, so callback should not be called
        expect(traceCallback).not.toHaveBeenCalled()
      })
    })

    it('should create a store with tracing enabled', (done) => {
      const traceCallback = jest.fn((traces) => {
        expect(traces.length).toBeGreaterThan(0)
        expect(traces[0].eventKey).toBe('increment')
        expect(traces[0].payload).toBe(null)
        done()
      })

      const store = createStore({
        initialState: { count: 0 },
        tracing: {
          enabled: true
        }
      })

      store.registerTraceCallback('test', traceCallback)

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      store.dispatch('increment', null)
    })

    it('should create a store with custom tracing debounce time', (done) => {
      const traceCallback = jest.fn((traces) => {
        expect(traces.length).toBeGreaterThan(0)
        done()
      })

      const store = createStore({
        initialState: { count: 0 },
        tracing: {
          enabled: true,
          debounceTime: 10 // Short debounce for testing
        }
      })

      store.registerTraceCallback('test', traceCallback)

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      store.dispatch('increment', null)
    })

    it('should return complete StoreAPI', () => {
      const store = createStore({ initialState: { count: 0 } })

      // Check that all expected methods exist
      expect(typeof store.getState).toBe('function')
      expect(typeof store.dispatch).toBe('function')
      expect(typeof store.flush).toBe('function')
      expect(typeof store.registerEventDb).toBe('function')
      expect(typeof store.registerEvent).toBe('function')
      expect(typeof store.deregisterEvent).toBe('function')
      expect(typeof store.registerEffect).toBe('function')
      expect(typeof store.registerSubscription).toBe('function')
      expect(typeof store.subscribe).toBe('function')
      expect(typeof store.query).toBe('function')
      expect(typeof store.getSubscription).toBe('function')
      expect(typeof store.registerErrorHandler).toBe('function')
      expect(typeof store.getInterceptors).toBe('function')
      expect(typeof store.registerTraceCallback).toBe('function')
      expect(typeof store.removeTraceCallback).toBe('function')
    })

    it('should create isolated stores (multiple stores do not interfere)', async () => {
      const store1 = createStore({ initialState: { count: 0 } })
      const store2 = createStore({ initialState: { count: 100 } })

      store1.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      store2.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 10 }
      })

      await store1.dispatch('increment', null)
      await store2.dispatch('increment', null)

      expect(store1.getState()).toEqual({ count: 1 })
      expect(store2.getState()).toEqual({ count: 110 })
    })

    it('should create stores with different state types', () => {
      interface State1 {
        count: number
      }
      interface State2 {
        name: string
        age: number
      }

      const store1 = createStore<State1>({ initialState: { count: 0 } })
      const store2 = createStore<State2>({ initialState: { name: 'Alice', age: 30 } })

      expect(store1.getState()).toEqual({ count: 0 })
      expect(store2.getState()).toEqual({ name: 'Alice', age: 30 })
    })

    it('should create stores with different coeffect types', () => {
      interface Cofx1 {
        userId: number
      }
      interface Cofx2 {
        sessionId: string
      }

      const store1 = createStore<{ count: number }, Cofx1>({
        initialState: { count: 0 },
        coeffects: {
          userId: () => 123
        }
      })

      const store2 = createStore<{ count: number }, Cofx2>({
        initialState: { count: 0 },
        coeffects: {
          sessionId: () => 'session-456'
        }
      })

      let cofx1: Cofx1 | undefined
      let cofx2: Cofx2 | undefined

      store1.registerEvent('test', (coeffects) => {
        cofx1 = { userId: coeffects.userId }
        return {}
      })

      store2.registerEvent('test', (coeffects) => {
        cofx2 = { sessionId: coeffects.sessionId }
        return {}
      })

      return Promise.all([
        store1.dispatch('test', null),
        store2.dispatch('test', null)
      ]).then(() => {
        expect(cofx1).toEqual({ userId: 123 })
        expect(cofx2).toEqual({ sessionId: 'session-456' })
      })
    })

    it('should handle store creation with all optional configs', async () => {
      const onStateChange = jest.fn()
      const errorHandler = jest.fn()
      const traceCallback = jest.fn()
      const scheduler = createSyncScheduler()

      const store = createStore({
        initialState: { count: 0 },
        coeffects: {
          userId: () => 123
        },
        onStateChange,
        errorHandler: {
          handler: errorHandler,
          rethrow: false
        },
        tracing: {
          enabled: true,
          debounceTime: 50
        },
        __scheduler: scheduler
      })

      store.registerTraceCallback('test', traceCallback)
      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      await store.dispatch('increment', null)
      
      // Manually flush the scheduler
      scheduler.flush()

      expect(onStateChange).toHaveBeenCalled()
      expect(store.getState()).toEqual({ count: 1 })
    })
  })
})

