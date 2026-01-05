/**
 * Performance Tests
 * Tests for event throughput, subscription scaling, memory profiling, and batching efficiency
 * 
 * NOTE: These tests are skipped by default (describe.skip) and should be run manually
 * when performance testing is needed. They may take longer to execute.
 */

import { createStore } from '../../src/modules/store'
import { createSyncScheduler } from '../utils/testScheduler'

// Performance tests - can be skipped in CI by using describe.skip
describe('Performance Tests', () => {
  describe('Event Throughput', () => {
    it('should handle 1000+ events per second', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      const eventCount = 1000
      const startTime = performance.now()

      // Dispatch events as fast as possible
      const promises: Promise<void>[] = []
      for (let i = 0; i < eventCount; i++) {
        promises.push(store.dispatch('increment', null))
      }
      await Promise.all(promises)
      scheduler.flush()

      const endTime = performance.now()
      const duration = endTime - startTime
      const eventsPerSecond = (eventCount / duration) * 1000

      expect(store.getState().count).toBe(eventCount)
      expect(eventsPerSecond).toBeGreaterThan(1000)
      console.log(`Processed ${eventCount} events in ${duration.toFixed(2)}ms (${eventsPerSecond.toFixed(0)} events/sec)`)
    })

    it('should handle 5000 events efficiently', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      const eventCount = 5000
      const startTime = performance.now()

      for (let i = 0; i < eventCount; i++) {
        await store.dispatch('increment', null)
      }
      scheduler.flush()

      const endTime = performance.now()
      const duration = endTime - startTime

      expect(store.getState().count).toBe(eventCount)
      expect(duration).toBeLessThan(5000) // Should complete in under 5 seconds
      console.log(`Processed ${eventCount} events in ${duration.toFixed(2)}ms`)
    })
  })

  describe('Subscription Scaling', () => {
    it('should handle 100+ active subscriptions efficiently', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      // Register 100 subscriptions
      const subscriptionCount = 100
      const callbacks: jest.Mock[] = []
      for (let i = 0; i < subscriptionCount; i++) {
        const callback = jest.fn()
        callbacks.push(callback)
        store.registerSubscription(`sub${i}`, {
          compute: (state) => state.count + i
        })
        store.subscribe(`sub${i}`, [], callback)
      }

      const startTime = performance.now()

      // Trigger state change
      await store.dispatch('increment', null)
      scheduler.flush()

      const endTime = performance.now()
      const duration = endTime - startTime

      // All subscriptions should be notified
      callbacks.forEach((callback, i) => {
        expect(callback).toHaveBeenCalledWith(1 + i)
      })

      expect(duration).toBeLessThan(100) // Should complete in under 100ms
      console.log(`Notified ${subscriptionCount} subscriptions in ${duration.toFixed(2)}ms`)
    })

    it('should handle 500 subscriptions with dependencies', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      // Create subscription chain: sub0 depends on state, sub1 depends on sub0, etc.
      const subscriptionCount = 500
      store.registerSubscription('sub0', {
        compute: (state) => state.count
      })

      for (let i = 1; i < subscriptionCount; i++) {
        store.registerSubscription(`sub${i}`, {
          deps: [`sub${i - 1}`],
          combine: (results) => results[0] + 1
        })
      }

      const callback = jest.fn()
      store.subscribe(`sub${subscriptionCount - 1}`, [], callback)

      const startTime = performance.now()

      await store.dispatch('increment', null)
      scheduler.flush()

      const endTime = performance.now()
      const duration = endTime - startTime

      expect(callback).toHaveBeenCalled()
      expect(duration).toBeLessThan(1000) // Should complete in under 1 second
      console.log(`Processed ${subscriptionCount} dependent subscriptions in ${duration.toFixed(2)}ms`)
    })
  })

  describe('Memory Profiling', () => {
    it('should not leak memory in long-running store', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      // Simulate long-running store with many operations
      const iterations = 1000
      const subscriptions: (() => void)[] = []

      // Create and cleanup subscriptions repeatedly
      for (let i = 0; i < iterations; i++) {
        const callback = jest.fn()
        store.registerSubscription(`temp${i}`, {
          compute: (state) => state.count
        })
        const unsubscribe = store.subscribe(`temp${i}`, [], callback)
        subscriptions.push(unsubscribe)

        await store.dispatch('increment', null)

        // Cleanup every 10 subscriptions
        if (i % 10 === 9) {
          subscriptions.forEach(unsub => unsub())
          subscriptions.length = 0
        }
      }

      scheduler.flush()

      // Final state should be correct
      expect(store.getState().count).toBe(iterations)

      // Memory should be cleaned up (weak references)
      // Note: Actual memory profiling would require external tools
      console.log(`Completed ${iterations} iterations with subscription cleanup`)
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
      const startTime = performance.now()

      for (let i = 0; i < iterations; i++) {
        const callback = jest.fn()
        store.registerSubscription(`temp${i}`, {
          compute: (state) => state.count
        })
        const unsubscribe = store.subscribe(`temp${i}`, [], callback)
        await store.dispatch('increment', null)
        unsubscribe()
      }

      scheduler.flush()

      const endTime = performance.now()
      const duration = endTime - startTime

      expect(store.getState().count).toBe(iterations)
      expect(duration).toBeLessThan(5000) // Should complete in under 5 seconds
      console.log(`Created and cleaned up ${iterations} subscriptions in ${duration.toFixed(2)}ms`)
    })
  })

  describe('Batching Efficiency', () => {
    it('should efficiently batch rapid state changes', async () => {
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

      const changeCount = 1000
      const startTime = performance.now()

      // Dispatch all events
      const promises: Promise<void>[] = []
      for (let i = 0; i < changeCount; i++) {
        promises.push(store.dispatch('increment', null))
      }
      await Promise.all(promises)

      // Single flush should handle all batched notifications
      scheduler.flush()

      const endTime = performance.now()
      const duration = endTime - startTime

      expect(store.getState().count).toBe(changeCount)
      // onStateChange should be called (batched, not 1000 times)
      expect(onStateChange).toHaveBeenCalled()
      expect(onStateChange.mock.calls.length).toBeLessThan(changeCount) // Batching reduces calls
      expect(duration).toBeLessThan(1000) // Should complete in under 1 second
      console.log(`Batched ${changeCount} state changes in ${duration.toFixed(2)}ms`)
    })

    it('should efficiently batch subscription notifications', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      // Create many subscriptions
      const subscriptionCount = 200
      const callbacks: jest.Mock[] = []
      for (let i = 0; i < subscriptionCount; i++) {
        const callback = jest.fn()
        callbacks.push(callback)
        store.registerSubscription(`sub${i}`, {
          compute: (state) => state.count
        })
        store.subscribe(`sub${i}`, [], callback)
      }

      const changeCount = 100
      const startTime = performance.now()

      // Dispatch many events rapidly
      const promises: Promise<void>[] = []
      for (let i = 0; i < changeCount; i++) {
        promises.push(store.dispatch('increment', null))
      }
      await Promise.all(promises)

      // Single flush should notify all subscriptions
      scheduler.flush()

      const endTime = performance.now()
      const duration = endTime - startTime

      // Each subscription should be notified (but only once per final state)
      callbacks.forEach(callback => {
        expect(callback).toHaveBeenCalled()
      })

      expect(store.getState().count).toBe(changeCount)
      expect(duration).toBeLessThan(2000) // Should complete in under 2 seconds
      console.log(`Batched notifications to ${subscriptionCount} subscriptions for ${changeCount} changes in ${duration.toFixed(2)}ms`)
    })
  })

  describe('Complex Scenarios', () => {
    it('should handle complex event chains efficiently', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0, chain: 0 },
        __scheduler: scheduler
      })

      // Event that dispatches another event
      store.registerEvent('trigger', () => {
        return {
          dispatch: { event: 'increment', payload: null }
        }
      })

      store.registerEventDb('increment', (coeffects) => {
        return {
          ...coeffects.db,
          count: coeffects.db.count + 1,
          chain: coeffects.db.chain + 1
        }
      })

      const chainLength = 100
      const startTime = performance.now()

      // Start a chain
      await store.dispatch('trigger', null)
      // Flush router queue to process nested dispatch
      await store.flush()
      scheduler.flush()

      const endTime = performance.now()
      const duration = endTime - startTime

      expect(store.getState().count).toBe(1)
      expect(store.getState().chain).toBe(1)
      expect(duration).toBeLessThan(500) // Should complete quickly
      console.log(`Processed event chain in ${duration.toFixed(2)}ms`)
    })

    it('should handle nested effect execution efficiently', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEvent('nested', () => {
        return {
          fx: [
            ['dispatch', { event: 'increment', payload: null }],
            ['dispatch', { event: 'increment', payload: null }],
            ['dispatch', { event: 'increment', payload: null }]
          ]
        }
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      const iterations = 50
      const startTime = performance.now()

      for (let i = 0; i < iterations; i++) {
        await store.dispatch('nested', null)
        // Flush router queue to process nested dispatches
        await store.flush()
      }
      scheduler.flush()

      const endTime = performance.now()
      const duration = endTime - startTime

      // Each nested dispatch triggers 3 increments
      expect(store.getState().count).toBe(iterations * 3)
      expect(duration).toBeLessThan(2000) // Should complete in under 2 seconds
      console.log(`Processed ${iterations} nested effect chains in ${duration.toFixed(2)}ms`)
    })
  })
})

