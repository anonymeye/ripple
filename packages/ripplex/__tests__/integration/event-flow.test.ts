/**
 * Integration tests for event flow
 * Tests the complete event lifecycle: Register → Dispatch → State Update
 */

import { createStore } from '../../src/modules/store'
import { EffectMap } from '../../src/modules/types'

describe('Event Flow Integration', () => {
  describe('Register → Dispatch → State Update', () => {
    it('should handle complete event lifecycle', async () => {
      const store = createStore({
        initialState: { count: 0 }
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      await store.dispatch('increment', null)

      expect(store.getState()).toEqual({ count: 1 })
    })

    it('should handle multiple events in sequence', async () => {
      const store = createStore({
        initialState: { count: 0 }
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      store.registerEventDb('double', (coeffects) => {
        return { count: coeffects.db.count * 2 }
      })

      await store.dispatch('increment', null)
      expect(store.getState()).toEqual({ count: 1 })

      await store.dispatch('double', null)
      expect(store.getState()).toEqual({ count: 2 })

      await store.dispatch('increment', null)
      expect(store.getState()).toEqual({ count: 3 })
    })

    it('should handle events with effects', async () => {
      const store = createStore({
        initialState: { count: 0, log: [] as string[] }
      })

      store.registerEvent('add-log', (coeffects, payload: string): EffectMap => {
        return {
          db: {
            ...coeffects.db,
            log: [...coeffects.db.log, payload]
          }
        }
      })

      await store.dispatch('add-log', 'message1')
      await store.dispatch('add-log', 'message2')

      expect(store.getState()).toEqual({
        count: 0,
        log: ['message1', 'message2']
      })
    })

    it('should handle event with dispatch effect', async () => {
      const store = createStore({
        initialState: { count: 0 }
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      store.registerEvent('increment-and-dispatch', (coeffects): EffectMap => {
        return {
          db: { count: coeffects.db.count + 1 },
          dispatch: { event: 'increment', payload: null }
        }
      })

      await store.dispatch('increment-and-dispatch', null)

      // Should increment twice: once from the event, once from the dispatch effect
      expect(store.getState()).toEqual({ count: 2 })
    })

    it('should handle nested dispatches', async () => {
      const store = createStore({
        initialState: { count: 0 }
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      store.registerEvent('increment-twice', (coeffects): EffectMap => {
        return {
          db: { count: coeffects.db.count + 1 },
          'dispatch-n': [
            { event: 'increment', payload: null },
            { event: 'increment', payload: null }
          ]
        }
      })

      await store.dispatch('increment-twice', null)
      await store.flush() // Wait for nested dispatches to complete

      // Should increment 3 times total
      expect(store.getState()).toEqual({ count: 3 })
    })
  })

  describe('Error Recovery', () => {
    it('should continue processing after event fails', async () => {
      const store = createStore({
        initialState: { count: 0 }
      })

      const errorHandler = jest.fn().mockResolvedValue(undefined)
      store.registerErrorHandler(errorHandler)

      store.registerEventDb('failing-event', () => {
        throw new Error('Event failed')
      })

      store.registerEventDb('success-event', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      // Dispatch failing event
      await store.dispatch('failing-event', null)
      expect(errorHandler).toHaveBeenCalled()

      // State should not change
      expect(store.getState()).toEqual({ count: 0 })

      // Subsequent events should still work
      await store.dispatch('success-event', null)
      expect(store.getState()).toEqual({ count: 1 })
    })

    it('should handle errors in effects gracefully', async () => {
      const store = createStore({
        initialState: { count: 0 }
      })

      const errorHandler = jest.fn().mockResolvedValue(undefined)
      store.registerErrorHandler(errorHandler)

      // Register a custom effect that throws
      store.registerEffect('failing-effect', async () => {
        throw new Error('Effect failed')
      })

      store.registerEvent('event-with-failing-effect', (): EffectMap => {
        return {
          db: { count: 1 },
          'failing-effect': {} // Pass non-null config so effect actually runs
        }
      })

      await store.dispatch('event-with-failing-effect', null)

      // State should still update (db effect succeeded)
      expect(store.getState()).toEqual({ count: 1 })
      expect(errorHandler).toHaveBeenCalled()
    })
  })

  describe('Complex Scenarios', () => {
    it('should handle event with multiple effects', async () => {
      const store = createStore({
        initialState: { count: 0, messages: [] as string[] }
      })

      store.registerEventDb('increment', (coeffects) => {
        return { 
          count: coeffects.db.count + 1,
          messages: coeffects.db.messages
        }
      })

      store.registerEvent('complex-event', (coeffects): EffectMap => {
        return {
          db: {
            count: coeffects.db.count,
            messages: [...coeffects.db.messages, 'processed']
          },
          dispatch: { event: 'increment', payload: null }
        }
      })

      await store.dispatch('complex-event', null)

      expect(store.getState()).toEqual({
        count: 1,
        messages: ['processed']
      })
    })

    it('should handle event with interceptors', async () => {
      const { path } = await import('../../src/modules/interceptor')
      
      const store = createStore({
        initialState: { counter: { value: 0 } }
      })

      store.registerEventDb(
        'increment-counter',
        (coeffects) => {
          return { value: coeffects.db.value + 1 }
        },
        [path(['counter'])]
      )

      await store.dispatch('increment-counter', null)

      expect(store.getState()).toEqual({
        counter: { value: 1 }
      })
    })

    it('should handle rapid state changes', async () => {
      const store = createStore({
        initialState: { count: 0 }
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      // Dispatch many events rapidly
      const promises = Array.from({ length: 100 }, () =>
        store.dispatch('increment', null)
      )

      await Promise.all(promises)

      expect(store.getState()).toEqual({ count: 100 })
    })

    it('should handle events with payloads', async () => {
      const store = createStore({
        initialState: { items: [] as number[] }
      })

      store.registerEventDb('add-item', (coeffects, payload: number) => {
        return {
          items: [...coeffects.db.items, payload]
        }
      })

      await store.dispatch('add-item', 1)
      await store.dispatch('add-item', 2)
      await store.dispatch('add-item', 3)

      expect(store.getState()).toEqual({
        items: [1, 2, 3]
      })
    })
  })
})

