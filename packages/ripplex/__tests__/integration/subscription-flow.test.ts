/**
 * Integration tests for subscription flow
 * Tests the complete subscription lifecycle: Register → State Change → Subscription Notify
 */

import { createStore } from '../../src/modules/store'
import { createSyncScheduler } from '../utils/testScheduler'

describe('Subscription Flow Integration', () => {
  describe('Register → State Change → Subscription Notify', () => {
    it('should handle complete subscription lifecycle', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0, items: [] as string[] },
        __scheduler: scheduler
      })

      store.registerSubscription('double-count', {
        compute: (state) => state.count * 2
      })

      const callback = jest.fn()
      store.subscribe('double-count', [], callback)

      expect(callback).toHaveBeenCalledWith(0)

      // Dispatch event that changes state
      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1, items: coeffects.db.items }
      })

      await store.dispatch('increment', null)
      scheduler.flush() // Flush scheduler to trigger subscription notifications

      // Subscription should be notified after state change
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(2) // 1 * 2
    })

    it('should handle multiple subscriptions to same key', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerSubscription('count', {
        compute: (state) => state.count
      })

      const callback1 = jest.fn()
      const callback2 = jest.fn()
      const callback3 = jest.fn()

      store.subscribe('count', [], callback1)
      store.subscribe('count', [], callback2)
      store.subscribe('count', [], callback3)

      expect(callback1).toHaveBeenCalledWith(0)
      expect(callback2).toHaveBeenCalledWith(0)
      expect(callback3).toHaveBeenCalledWith(0)

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      await store.dispatch('increment', null)
      scheduler.flush() // Flush scheduler to trigger subscription notifications

      expect(callback1).toHaveBeenCalledTimes(2)
      expect(callback2).toHaveBeenCalledTimes(2)
      expect(callback3).toHaveBeenCalledTimes(2)
      expect(callback1).toHaveBeenLastCalledWith(1)
      expect(callback2).toHaveBeenLastCalledWith(1)
      expect(callback3).toHaveBeenLastCalledWith(1)
    })

    it('should handle subscription dependencies', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0, items: [] as string[] },
        __scheduler: scheduler
      })

      store.registerSubscription('count', {
        compute: (state) => state.count
      })

      store.registerSubscription('items-length', {
        compute: (state) => state.items.length
      })

      store.registerSubscription('sum', {
        deps: ['count', 'items-length'],
        combine: (deps: [number, number]) => deps[0] + deps[1]
      })

      const callback = jest.fn()
      store.subscribe('sum', [], callback)

      expect(callback).toHaveBeenCalledWith(0) // 0 + 0

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1, items: coeffects.db.items }
      })

      store.registerEventDb('add-item', (coeffects, payload: string) => {
        return { count: coeffects.db.count, items: [...coeffects.db.items, payload] }
      })

      await store.dispatch('increment', null)
      scheduler.flush() // Flush scheduler to trigger subscription notifications
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1) // 1 + 0

      await store.dispatch('add-item', 'a')
      scheduler.flush() // Flush scheduler to trigger subscription notifications
      expect(callback).toHaveBeenCalledTimes(3)
      expect(callback).toHaveBeenLastCalledWith(2) // 1 + 1
    })

    it('should handle unsubscribe cleanup', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerSubscription('count', {
        compute: (state) => state.count
      })

      const callback1 = jest.fn()
      const callback2 = jest.fn()

      const unsubscribe1 = store.subscribe('count', [], callback1)
      const unsubscribe2 = store.subscribe('count', [], callback2)

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      await store.dispatch('increment', null)
      scheduler.flush() // Flush scheduler to trigger subscription notifications
      expect(callback1).toHaveBeenCalledTimes(2)
      expect(callback2).toHaveBeenCalledTimes(2)

      unsubscribe1()

      await store.dispatch('increment', null)
      scheduler.flush() // Flush scheduler to trigger subscription notifications
      expect(callback1).toHaveBeenCalledTimes(2) // No more calls
      expect(callback2).toHaveBeenCalledTimes(3) // Still receiving updates
    })

    it('should handle nested subscription dependencies', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerSubscription('count', {
        compute: (state) => state.count
      })

      store.registerSubscription('double', {
        deps: ['count'],
        combine: (deps: [number]) => deps[0] * 2
      })

      store.registerSubscription('quadruple', {
        deps: ['double'],
        combine: (deps: [number]) => deps[0] * 2
      })

      const callback = jest.fn()
      store.subscribe('quadruple', [], callback)

      expect(callback).toHaveBeenCalledWith(0) // 0 * 2 * 2

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      await store.dispatch('increment', null)
      scheduler.flush() // Flush scheduler to trigger subscription notifications
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(4) // 1 * 2 * 2
    })

    it('should handle subscriptions with params', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerSubscription('multiply', {
        compute: (state, multiplier: number) => state.count * multiplier
      })

      const callback1 = jest.fn()
      const callback2 = jest.fn()

      store.subscribe('multiply', [2], callback1)
      store.subscribe('multiply', [3], callback2)

      expect(callback1).toHaveBeenCalledWith(0) // 0 * 2
      expect(callback2).toHaveBeenCalledWith(0) // 0 * 3

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      await store.dispatch('increment', null)
      scheduler.flush() // Flush scheduler to trigger subscription notifications
      expect(callback1).toHaveBeenCalledTimes(2)
      expect(callback2).toHaveBeenCalledTimes(2)
      expect(callback1).toHaveBeenLastCalledWith(2) // 1 * 2
      expect(callback2).toHaveBeenLastCalledWith(3) // 1 * 3
    })

    it('should handle complex subscription scenarios', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: {
          users: [{ id: 1, name: 'Alice', age: 25 }],
          filter: 'all'
        },
        __scheduler: scheduler
      })

      store.registerSubscription('users', {
        compute: (state) => state.users
      })

      store.registerSubscription('filter', {
        compute: (state) => state.filter
      })

      store.registerSubscription('filtered-users', {
        deps: ['users', 'filter'],
        combine: (deps: [{ id: number; name: string; age: number }[], string]) => {
          const users = deps[0]
          const filter = deps[1]
          if (filter === 'all') return users
          if (filter === 'adults') return users.filter(u => u.age >= 18)
          return []
        }
      })

      store.registerSubscription('user-count', {
        deps: ['filtered-users'],
        combine: (deps: [{ id: number; name: string; age: number }[]]) => deps[0].length
      })

      const callback = jest.fn()
      store.subscribe('user-count', [], callback)

      expect(callback).toHaveBeenCalledWith(1)

      store.registerEventDb('add-user', (coeffects, payload: { id: number; name: string; age: number }) => {
        return {
          users: [...coeffects.db.users, payload],
          filter: coeffects.db.filter
        }
      })

      await store.dispatch('add-user', { id: 2, name: 'Bob', age: 17 })
      scheduler.flush() // Flush scheduler to trigger subscription notifications
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(2) // All users (filter is 'all')
    })

    it('should handle rapid state changes', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerSubscription('count', {
        compute: (state) => state.count
      })

      const callback = jest.fn()
      store.subscribe('count', [], callback)

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      // Dispatch multiple events rapidly
      await Promise.all([
        store.dispatch('increment', null),
        store.dispatch('increment', null),
        store.dispatch('increment', null)
      ])
      scheduler.flush() // Flush scheduler to trigger subscription notifications (batched)

      // Should have been notified for each state change
      // Initial call + 1 batched update = 2 calls (scheduler batches all changes)
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(3)
    })

    it('should handle subscription errors gracefully', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerSubscription('error-sub', {
        compute: (state) => {
          if (state.count > 0) {
            throw new Error('Error when count > 0')
          }
          return 0
        }
      })

      const callback = jest.fn()
      store.subscribe('error-sub', [], callback)

      expect(callback).toHaveBeenCalledWith(0)

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      // Should not crash, but subscription won't update
      await store.dispatch('increment', null)
      scheduler.flush() // Flush scheduler to trigger subscription notifications
      // Callback should not be called again (error prevents update)
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should handle multiple subscriptions to different keys', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0, items: [] as string[] },
        __scheduler: scheduler
      })

      store.registerSubscription('count', {
        compute: (state) => state.count
      })

      store.registerSubscription('items-length', {
        compute: (state) => state.items.length
      })

      const countCallback = jest.fn()
      const itemsCallback = jest.fn()

      store.subscribe('count', [], countCallback)
      store.subscribe('items-length', [], itemsCallback)

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1, items: coeffects.db.items }
      })

      store.registerEventDb('add-item', (coeffects, payload: string) => {
        return { count: coeffects.db.count, items: [...coeffects.db.items, payload] }
      })

      await store.dispatch('increment', null)
      scheduler.flush() // Flush scheduler to trigger subscription notifications
      expect(countCallback).toHaveBeenCalledTimes(2)
      expect(itemsCallback).toHaveBeenCalledTimes(1) // No change

      await store.dispatch('add-item', 'a')
      scheduler.flush() // Flush scheduler to trigger subscription notifications
      expect(countCallback).toHaveBeenCalledTimes(2) // No change
      expect(itemsCallback).toHaveBeenCalledTimes(2) // Updated
    })

    it('should handle query without subscription', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 5 },
        __scheduler: scheduler
      })

      store.registerSubscription('double-count', {
        compute: (state) => state.count * 2
      })

      const result = store.query('double-count', [])
      expect(result).toBe(10)

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      await store.dispatch('increment', null)
      const newResult = store.query('double-count', [])
      expect(newResult).toBe(12) // 6 * 2
    })

    it('should handle subscription with same key but different params', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 5 },
        __scheduler: scheduler
      })

      store.registerSubscription('multiply', {
        compute: (state, multiplier: number) => state.count * multiplier
      })

      const callback1 = jest.fn()
      const callback2 = jest.fn()

      store.subscribe('multiply', [2], callback1)
      store.subscribe('multiply', [3], callback2)

      expect(callback1).toHaveBeenCalledWith(10) // 5 * 2
      expect(callback2).toHaveBeenCalledWith(15) // 5 * 3

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      await store.dispatch('increment', null)
      scheduler.flush() // Flush scheduler to trigger subscription notifications
      expect(callback1).toHaveBeenCalledTimes(2)
      expect(callback2).toHaveBeenCalledTimes(2)
      expect(callback1).toHaveBeenLastCalledWith(12) // 6 * 2
      expect(callback2).toHaveBeenLastCalledWith(18) // 6 * 3
    })
  })
})

