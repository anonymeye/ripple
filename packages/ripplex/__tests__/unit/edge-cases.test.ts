/**
 * Edge Cases Tests
 * Tests edge cases: empty state, null/undefined, circular refs, deep paths,
 * missing handlers, invalid inputs, rapid state changes, concurrent dispatches
 */

import { createStore } from '../../src/modules/store'
import { createSyncScheduler } from '../utils/testScheduler'

describe('Edge Cases', () => {
  describe('Empty State Objects', () => {
    it('should handle empty state object', () => {
      const store = createStore({ initialState: {} })
      expect(store.getState()).toEqual({})
    })

    it('should handle empty arrays in state', () => {
      const store = createStore({ initialState: { items: [] } })
      expect(store.getState().items).toEqual([])
    })

    it('should handle nested empty objects', () => {
      const store = createStore({
        initialState: { a: {}, b: { c: {} } }
      })
      expect(store.getState()).toEqual({ a: {}, b: { c: {} } })
    })

    it('should update empty state', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: {},
        __scheduler: scheduler
      })

      store.registerEventDb('set', (coeffects) => {
        return { value: 42 }
      })

      await store.dispatch('set', null)
      scheduler.flush()

      expect(store.getState()).toEqual({ value: 42 })
    })
  })

  describe('Null/Undefined Handling', () => {
    it('should handle null values in state', () => {
      const store = createStore({ initialState: { value: null } })
      expect(store.getState().value).toBeNull()
    })

    it('should handle undefined values in state', () => {
      const store = createStore({ initialState: { value: undefined } })
      expect(store.getState().value).toBeUndefined()
    })

    it('should handle null as initial state', () => {
      const store = createStore({ initialState: null as any })
      expect(store.getState()).toBeNull()
    })

    it('should handle null payloads', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEventDb('set', (coeffects, payload) => {
        return { count: payload === null ? 0 : 1 }
      })

      await store.dispatch('set', null)
      scheduler.flush()

      expect(store.getState().count).toBe(0)
    })

    it('should handle undefined payloads', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEventDb('set', (coeffects, payload) => {
        return { count: payload === undefined ? 0 : 1 }
      })

      await store.dispatch('set', undefined)
      scheduler.flush()

      expect(store.getState().count).toBe(0)
    })

    it('should handle null in nested state', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { user: { name: 'Alice' } },
        __scheduler: scheduler
      })

      store.registerEventDb('clearUser', () => {
        return { user: null }
      })

      await store.dispatch('clearUser', null)
      scheduler.flush()

      expect(store.getState().user).toBeNull()
    })
  })

  describe('Circular References', () => {
    it('should handle circular references in state (JSON.stringify limitation)', () => {
      const circular: any = { value: 1 }
      circular.self = circular

      // Store should accept it (though JSON operations will fail)
      const store = createStore({ initialState: circular })
      expect(store.getState().value).toBe(1)
      expect(store.getState().self).toBe(store.getState())
    })

    it('should handle circular references in payload', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { data: null },
        __scheduler: scheduler
      })

      const circular: any = { value: 42 }
      circular.self = circular

      store.registerEventDb('set', (coeffects, payload) => {
        return { data: payload }
      })

      await store.dispatch('set', circular)
      scheduler.flush()

      expect(store.getState().data.value).toBe(42)
      expect(store.getState().data.self).toBe(store.getState().data)
    })
  })

  describe('Very Deep State Paths', () => {
    it('should handle deeply nested state updates', async () => {
      const scheduler = createSyncScheduler()
      const initialState: any = {}
      let current = initialState
      for (let i = 0; i < 20; i++) {
        current[`level${i}`] = {}
        current = current[`level${i}`]
      }
      current.value = 0

      const store = createStore({
        initialState,
        __scheduler: scheduler
      })

      store.registerEventDb('increment', (coeffects) => {
        // Recursively update nested path
        function updateNestedPath(obj: any, path: string[], value: number): any {
          if (path.length === 0) {
            return { ...obj, value }
          }
          const [first, ...rest] = path
          return {
            ...obj,
            [first]: updateNestedPath(obj[first] || {}, rest, value)
          }
        }

        const path = Array.from({ length: 20 }, (_, i) => `level${i}`)
        const currentValue = (() => {
          let curr = coeffects.db
          for (const key of path) {
            curr = curr?.[key]
          }
          return curr?.value || 0
        })()

        return updateNestedPath(coeffects.db, path, currentValue + 1)
      })

      await store.dispatch('increment', null)
      scheduler.flush()

      let result = store.getState()
      for (let i = 0; i < 20; i++) {
        result = result[`level${i}`]
      }
      expect(result.value).toBe(1)
    })
  })

  describe('Missing Handlers', () => {
    it('should handle missing event handler gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      const store = createStore({ initialState: { count: 0 } })

      await store.dispatch('nonexistent', null)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No handler registered for event')
      )
      consoleSpy.mockRestore()
    })

    it('should handle missing effect handler gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEvent('test', () => {
        return {
          ':unknown-effect': { value: 42 }
        }
      })

      await store.dispatch('test', null)
      scheduler.flush()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No effect handler registered')
      )
      consoleSpy.mockRestore()
    })

    it('should handle missing subscription gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      const store = createStore({ initialState: { count: 0 } })

      const result = store.query('nonexistent', [])

      expect(result).toBeUndefined()
      // Error handler logs with format: "Error in subscription \"subscription:nonexistent\":", [Error: ...]
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in subscription'),
        expect.any(Error)
      )
      consoleSpy.mockRestore()
    })

    it('should handle missing subscription with error handler', () => {
      const errorHandler = jest.fn()
      const store = createStore({
        initialState: { count: 0 },
        errorHandler: { handler: errorHandler }
      })

      const result = store.query('nonexistent', [])

      expect(result).toBeUndefined()
      expect(errorHandler).toHaveBeenCalled()
    })
  })

  describe('Invalid Inputs', () => {
    it('should handle invalid event key (empty string)', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      const store = createStore({ initialState: { count: 0 } })

      await store.dispatch('', null)

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should handle invalid subscription config (missing compute and deps)', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      const store = createStore({ initialState: { count: 0 } })

      store.registerSubscription('invalid', {} as any)

      const result = store.query('invalid', [])

      expect(result).toBeUndefined()
      // Error handler logs with format: "Error in subscription \"subscription:invalid\":", [Error: ...]
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in subscription'),
        expect.any(Error)
      )
      consoleSpy.mockRestore()
    })

    it('should handle invalid effect config gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEvent('test', () => {
        return {
          ':dispatch': 'invalid' as any // Should be array or object
        }
      })

      await store.dispatch('test', null)
      scheduler.flush()

      // Effect executor should handle invalid configs
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('Rapid State Changes', () => {
    it('should batch rapid state changes', async () => {
      const scheduler = createSyncScheduler()
      const onStateChange = jest.fn()
      const store = createStore({
        initialState: { count: 0 },
        onStateChange,
        __scheduler: scheduler
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      // Dispatch multiple events rapidly
      const promises = []
      for (let i = 0; i < 10; i++) {
        promises.push(store.dispatch('increment', null))
      }
      await Promise.all(promises)

      // Flush scheduler once
      scheduler.flush()

      // Should have batched notifications
      expect(store.getState().count).toBe(10)
      // onStateChange should be called (batched)
      expect(onStateChange).toHaveBeenCalled()
    })

    it('should handle rapid state changes with subscriptions', async () => {
      const scheduler = createSyncScheduler()
      const callback = jest.fn()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      store.registerSubscription('count', {
        compute: (state) => state.count
      })
      store.subscribe('count', [], callback)

      // Dispatch multiple events rapidly
      for (let i = 0; i < 5; i++) {
        await store.dispatch('increment', null)
      }
      scheduler.flush()

      // Subscription may be notified multiple times as state changes (0->1->2->3->4->5)
      // The deep equality check prevents duplicate notifications for same value,
      // but each increment changes the value, so we expect multiple calls
      expect(callback).toHaveBeenCalled()
      expect(callback).toHaveBeenLastCalledWith(5)
      // Should be called at least once, but may be called multiple times as state increments
      expect(callback.mock.calls.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Concurrent Dispatches', () => {
    it('should process concurrent dispatches sequentially', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      // Dispatch multiple events concurrently
      await Promise.all([
        store.dispatch('increment', null),
        store.dispatch('increment', null),
        store.dispatch('increment', null)
      ])
      scheduler.flush()

      // Should process sequentially (FIFO)
      expect(store.getState().count).toBe(3)
    })

    it('should handle concurrent dispatches with different events', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { a: 0, b: 0 },
        __scheduler: scheduler
      })

      store.registerEventDb('incrementA', (coeffects) => {
        return { ...coeffects.db, a: coeffects.db.a + 1 }
      })

      store.registerEventDb('incrementB', (coeffects) => {
        return { ...coeffects.db, b: coeffects.db.b + 1 }
      })

      // Dispatch concurrently
      await Promise.all([
        store.dispatch('incrementA', null),
        store.dispatch('incrementB', null),
        store.dispatch('incrementA', null)
      ])
      scheduler.flush()

      expect(store.getState().a).toBe(2)
      expect(store.getState().b).toBe(1)
    })

    it('should handle errors in concurrent dispatches independently', async () => {
      const errorHandler = jest.fn()
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        errorHandler: { handler: errorHandler },
        __scheduler: scheduler
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      store.registerEvent('fail', () => {
        throw new Error('Test error')
      })

      // Dispatch concurrently - one fails, one succeeds
      await Promise.all([
        store.dispatch('increment', null),
        store.dispatch('fail', null).catch(() => {}) // Catch to prevent unhandled rejection
      ])
      scheduler.flush()

      // Error should be handled
      expect(errorHandler).toHaveBeenCalled()
      // Successful dispatch should still work
      expect(store.getState().count).toBe(1)
    })
  })

  describe('Edge Cases in Subscriptions', () => {
    it('should handle subscription with null result', () => {
      const store = createStore({ initialState: { data: null } })

      store.registerSubscription('data', {
        compute: (state) => state.data
      })

      const result = store.query('data', [])
      expect(result).toBeNull()
    })

    it('should handle subscription with undefined result', () => {
      const store = createStore({ initialState: {} })

      store.registerSubscription('missing', {
        compute: () => undefined
      })

      const result = store.query('missing', [])
      expect(result).toBeUndefined()
    })

    it('should handle subscription errors gracefully', () => {
      const errorHandler = jest.fn()
      const store = createStore({
        initialState: { count: 0 },
        errorHandler: { handler: errorHandler }
      })

      store.registerSubscription('failing', {
        compute: () => {
          throw new Error('Subscription error')
        }
      })

      const result = store.query('failing', [])
      expect(result).toBeUndefined()
      expect(errorHandler).toHaveBeenCalled()
    })

    it('should handle circular subscription dependencies', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      const store = createStore({ initialState: { count: 0 } })

      // Try to create circular dependency
      store.registerSubscription('a', {
        deps: ['b'],
        combine: (results) => results[0]
      })

      store.registerSubscription('b', {
        deps: ['a'],
        combine: (results) => results[0]
      })

      // Querying should handle the circular dependency gracefully
      // This will cause a stack overflow, but it's caught and handled
      const result = store.query('a', [])
      
      // Should return undefined when error occurs
      expect(result).toBeUndefined()
      
      // Error should be logged (stack overflow is caught and handled)
      // The error handler formats it as "Error in subscription \"subscription:...\":"
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in subscription'),
        expect.any(Error)
      )
      
      consoleSpy.mockRestore()
    })
  })

  describe('Edge Cases in Effects', () => {
    it('should handle effect that dispatches missing event', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      // :dispatch expects {event: string, payload: any}
      store.registerEvent('test', () => {
        return {
          dispatch: { event: 'missing-event', payload: null }
        }
      })

      await store.dispatch('test', null)
      // Need to flush again to process the nested dispatch
      await store.flush()
      scheduler.flush()

      // The :dispatch effect will dispatch the missing event
      // which will log a warning about missing handler
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No handler registered for event')
      )
      consoleSpy.mockRestore()
    })

    it('should handle effect with invalid dispatch config', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEvent('test', () => {
        return {
          ':dispatch': { invalid: 'config' } as any
        }
      })

      await store.dispatch('test', null)
      scheduler.flush()

      // Should handle invalid config gracefully
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })
})

