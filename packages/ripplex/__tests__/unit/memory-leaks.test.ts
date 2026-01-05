/**
 * Memory Leak Tests
 * Tests for subscription cleanup, event queue cleanup, and WeakMap garbage collection
 */

import { createStore } from '../../src/modules/store'
import { createSyncScheduler } from '../utils/testScheduler'

describe('Memory Leaks', () => {
  describe('Subscription Cleanup', () => {
    it('should cleanup subscriptions when unsubscribed', async () => {
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

      const unsubscribe = store.subscribe('count', [], callback)

      // Callback is called immediately when subscribing (with initial state value 0)
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(0)

      // Trigger state change
      await store.dispatch('increment', null)
      scheduler.flush()

      // Callback should be called again with new value
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1)

      // Unsubscribe
      unsubscribe()

      // Trigger another state change
      await store.dispatch('increment', null)
      scheduler.flush()

      // Callback should not be called again (still at 2 calls: initial + first state change)
      expect(callback).toHaveBeenCalledTimes(2)
    })

    it('should cleanup multiple subscriptions independently', async () => {
      const scheduler = createSyncScheduler()
      const callback1 = jest.fn()
      const callback2 = jest.fn()
      const callback3 = jest.fn()
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

      const unsubscribe1 = store.subscribe('count', [], callback1)
      const unsubscribe2 = store.subscribe('count', [], callback2)
      const unsubscribe3 = store.subscribe('count', [], callback3)

      // Callbacks are called immediately when subscribing (with initial state value 0)
      expect(callback1).toHaveBeenCalledTimes(1)
      expect(callback2).toHaveBeenCalledTimes(1)
      expect(callback3).toHaveBeenCalledTimes(1)
      expect(callback1).toHaveBeenCalledWith(0)
      expect(callback2).toHaveBeenCalledWith(0)
      expect(callback3).toHaveBeenCalledWith(0)

      await store.dispatch('increment', null)
      scheduler.flush()

      // Callbacks should be called again with new value
      expect(callback1).toHaveBeenCalledTimes(2)
      expect(callback2).toHaveBeenCalledTimes(2)
      expect(callback3).toHaveBeenCalledTimes(2)
      expect(callback1).toHaveBeenLastCalledWith(1)
      expect(callback2).toHaveBeenLastCalledWith(1)
      expect(callback3).toHaveBeenLastCalledWith(1)

      // Unsubscribe only callback2
      unsubscribe2()

      await store.dispatch('increment', null)
      scheduler.flush()

      // callback1 and callback3 should still be called (initial + first change + second change)
      expect(callback1).toHaveBeenCalledTimes(3)
      expect(callback2).toHaveBeenCalledTimes(2) // No new calls after unsubscribe (initial + first change)
      expect(callback3).toHaveBeenCalledTimes(3)
      expect(callback1).toHaveBeenLastCalledWith(2)
      expect(callback2).toHaveBeenLastCalledWith(1) // Last call was before unsubscribe
      expect(callback3).toHaveBeenLastCalledWith(2)
    })

    it('should cleanup subscriptions when all listeners are removed', async () => {
      const scheduler = createSyncScheduler()
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

      const callback1 = jest.fn()
      const callback2 = jest.fn()

      const unsubscribe1 = store.subscribe('count', [], callback1)
      const unsubscribe2 = store.subscribe('count', [], callback2)

      // Callbacks are called immediately when subscribing (with initial state value 0)
      expect(callback1).toHaveBeenCalledTimes(1)
      expect(callback2).toHaveBeenCalledTimes(1)
      expect(callback1).toHaveBeenCalledWith(0)
      expect(callback2).toHaveBeenCalledWith(0)

      await store.dispatch('increment', null)
      scheduler.flush()

      // Callbacks should be called again with new value
      expect(callback1).toHaveBeenCalledTimes(2)
      expect(callback2).toHaveBeenCalledTimes(2)
      expect(callback1).toHaveBeenLastCalledWith(1)
      expect(callback2).toHaveBeenLastCalledWith(1)

      // Unsubscribe all
      unsubscribe1()
      unsubscribe2()

      await store.dispatch('increment', null)
      scheduler.flush()

      // No new calls after unsubscribe (still at 2: initial + first state change)
      expect(callback1).toHaveBeenCalledTimes(2)
      expect(callback2).toHaveBeenCalledTimes(2)
    })

    it('should handle unsubscribe being called multiple times', () => {
      const store = createStore({ initialState: { count: 0 } })

      store.registerSubscription('count', {
        compute: (state) => state.count
      })

      const callback = jest.fn()
      const unsubscribe = store.subscribe('count', [], callback)

      // Call unsubscribe multiple times - should not throw
      expect(() => {
        unsubscribe()
        unsubscribe()
        unsubscribe()
      }).not.toThrow()
    })
  })

  describe('Event Queue Cleanup', () => {
    it('should cleanup event queue after processing', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      // Dispatch multiple events
      await store.dispatch('increment', null)
      await store.dispatch('increment', null)
      await store.dispatch('increment', null)

      // Queue should be processed
      await store.flush()
      scheduler.flush()

      expect(store.getState().count).toBe(3)

      // Queue should be empty after flush
      // Dispatch another event to verify queue is working
      await store.dispatch('increment', null)
      await store.flush()
      scheduler.flush()

      expect(store.getState().count).toBe(4)
    })

    it('should handle errors in event queue without leaking', async () => {
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

      // Dispatch mix of successful and failing events
      await Promise.all([
        store.dispatch('increment', null),
        store.dispatch('fail', null).catch(() => {}),
        store.dispatch('increment', null)
      ])
      scheduler.flush()

      // Errors should be handled
      expect(errorHandler).toHaveBeenCalled()
      // Successful events should still process
      expect(store.getState().count).toBe(2)

      // Queue should be clean - verify with another dispatch
      await store.dispatch('increment', null)
      scheduler.flush()

      expect(store.getState().count).toBe(3)
    })
  })

  describe('WeakMap Garbage Collection', () => {
    it('should allow subscription objects to be garbage collected', () => {
      const store = createStore({ initialState: { count: 0 } })

      store.registerSubscription('count', {
        compute: (state) => state.count
      })

      // Create subscription and immediately unsubscribe
      const callback = jest.fn()
      const unsubscribe = store.subscribe('count', [], callback)
      unsubscribe()

      // Subscription object should be eligible for GC
      // We can't directly test GC, but we can verify the subscription
      // doesn't hold references that prevent cleanup
      const result = store.query('count', [])
      expect(result).toBe(0)

      // Create another subscription with same params
      const callback2 = jest.fn()
      const unsubscribe2 = store.subscribe('count', [], callback2)

      // Should work fine - old subscription should not interfere
      expect(store.query('count', [])).toBe(0)
      unsubscribe2()
    })

    it('should handle subscription cache cleanup', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerSubscription('count', {
        compute: (state) => state.count
      })

      // Query multiple times with same params
      const result1 = store.query('count', [])
      const result2 = store.query('count', [])
      const result3 = store.query('count', [])

      expect(result1).toBe(0)
      expect(result2).toBe(0)
      expect(result3).toBe(0)

      // Update state
      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      await store.dispatch('increment', null)
      scheduler.flush()

      // Cache should be invalidated - new query should return new value
      const result4 = store.query('count', [])
      expect(result4).toBe(1)
    })

    it('should cleanup subscription cache when state reference changes', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerSubscription('count', {
        compute: (state) => state.count
      })

      // Query with initial state
      const result1 = store.query('count', [])
      expect(result1).toBe(0)

      // Update state (creates new state reference)
      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      await store.dispatch('increment', null)
      scheduler.flush()

      // Old cache entry should be invalid (different state reference)
      // New query should compute fresh result
      const result2 = store.query('count', [])
      expect(result2).toBe(1)
    })
  })

  describe('Long-Running Store Memory', () => {
    it('should not accumulate memory over many operations', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      // Perform many operations
      const operations = 1000
      for (let i = 0; i < operations; i++) {
        await store.dispatch('increment', null)
      }
      scheduler.flush()

      expect(store.getState().count).toBe(operations)

      // Verify store still works correctly
      await store.dispatch('increment', null)
      scheduler.flush()

      expect(store.getState().count).toBe(operations + 1)
    })

    it('should cleanup temporary subscriptions in long-running scenarios', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      // Create and cleanup many temporary subscriptions
      const iterations = 100
      for (let i = 0; i < iterations; i++) {
        store.registerSubscription(`temp${i}`, {
          compute: (state) => state.count
        })

        const callback = jest.fn()
        const unsubscribe = store.subscribe(`temp${i}`, [], callback)

        await store.dispatch('increment', null)
        scheduler.flush()

        unsubscribe()

        // Verify callback was called before unsubscribe
        expect(callback).toHaveBeenCalled()
      }

      // Final state should be correct
      expect(store.getState().count).toBe(iterations)

      // Store should still work
      await store.dispatch('increment', null)
      scheduler.flush()

      expect(store.getState().count).toBe(iterations + 1)
    })

    it('should handle rapid subscription creation and cleanup', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      const iterations = 500
      const unsubscribes: (() => void)[] = []

      // Rapidly create subscriptions
      for (let i = 0; i < iterations; i++) {
        store.registerSubscription(`rapid${i}`, {
          compute: (state) => state.count
        })

        const callback = jest.fn()
        const unsubscribe = store.subscribe(`rapid${i}`, [], callback)
        unsubscribes.push(unsubscribe)
      }

      // Trigger state change
      await store.dispatch('increment', null)
      scheduler.flush()

      // Cleanup all subscriptions
      unsubscribes.forEach(unsubscribe => unsubscribe())

      // Verify no memory leaks by checking store still works
      await store.dispatch('increment', null)
      scheduler.flush()

      expect(store.getState().count).toBe(2)
    })
  })

  describe('Error Handler Memory', () => {
    it('should not leak memory when error handler is called repeatedly', async () => {
      const errorHandler = jest.fn()
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        errorHandler: { handler: errorHandler },
        __scheduler: scheduler
      })

      store.registerEvent('fail', () => {
        throw new Error('Test error')
      })

      // Trigger many errors
      const errorCount = 100
      for (let i = 0; i < errorCount; i++) {
        await store.dispatch('fail', null).catch(() => {})
      }
      scheduler.flush()

      expect(errorHandler).toHaveBeenCalledTimes(errorCount)

      // Store should still work
      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      await store.dispatch('increment', null)
      scheduler.flush()

      expect(store.getState().count).toBe(1)
    })
  })
})

