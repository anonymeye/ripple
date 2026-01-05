/**
 * Full Integration Tests for Store
 * Tests complete event lifecycle: Register → Dispatch → State → Subscribe
 * Tests coeffects, interceptors, effects, and error handling in real-world scenarios
 */

import { createStore } from '../../src/modules/store'
import { path, debug, after, injectCofx } from '../../src/modules/interceptor'
import { EffectMap } from '../../src/modules/types'
import { createSyncScheduler } from '../utils/testScheduler'

describe('Store Full Integration', () => {
  describe('Complete Event Lifecycle', () => {
    it('should handle Register → Dispatch → State → Subscribe', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0, users: [] },
        __scheduler: scheduler
      })

      // Register event
      store.registerEventDb('increment', (coeffects) => {
        return { ...coeffects.db, count: coeffects.db.count + 1 }
      })

      // Register subscription
      const subscriptionCallback = jest.fn()
      store.registerSubscription('count', {
        compute: (state) => state.count
      })
      store.subscribe('count', [], subscriptionCallback)

      // Dispatch
      await store.dispatch('increment', null)

      // Manually flush the scheduler
      scheduler.flush()

      // Verify state
      expect(store.getState().count).toBe(1)

      // Verify subscription
      expect(subscriptionCallback).toHaveBeenCalledWith(1)
    })

    it('should handle complex state updates with nested objects', async () => {
      const store = createStore({
        initialState: {
          users: {
            current: { id: 1, name: 'Alice' },
            list: []
          }
        }
      })

      store.registerEventDb('add-user', (coeffects, payload: { id: number; name: string }) => {
        return {
          ...coeffects.db,
          users: {
            ...coeffects.db.users,
            list: [...coeffects.db.users.list, payload]
          }
        }
      })

      await store.dispatch('add-user', { id: 2, name: 'Bob' })

      expect(store.getState().users.list).toHaveLength(1)
      expect(store.getState().users.list[0]).toEqual({ id: 2, name: 'Bob' })
    })
  })

  describe('Coeffects in Handlers', () => {
    it('should make coeffects available in handlers', async () => {
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

      let receivedCofx: CustomCofx | undefined
      store.registerEvent('test', (coeffects) => {
        receivedCofx = {
          userId: coeffects.userId,
          timestamp: coeffects.timestamp
        }
        return {}
      })

      await store.dispatch('test', null)

      expect(receivedCofx).toBeDefined()
      expect(receivedCofx!.userId).toBe(123)
      expect(typeof receivedCofx!.timestamp).toBe('number')
    })

    it('should compute coeffects dynamically on each event', async () => {
      let callCount = 0
      const store = createStore<{ count: number }, { callCount: number }>({
        initialState: { count: 0 },
        coeffects: {
          callCount: () => ++callCount
        }
      })

      const receivedCounts: number[] = []
      store.registerEvent('test', (coeffects) => {
        receivedCounts.push(coeffects.callCount)
        return {}
      })

      await store.dispatch('test', null)
      await store.dispatch('test', null)
      await store.dispatch('test', null)

      expect(receivedCounts).toEqual([1, 2, 3])
    })
  })

  describe('Interceptors Modify Context', () => {
    it('should apply path interceptor correctly', async () => {
      const store = createStore({
        initialState: {
          users: {
            current: { id: 1, name: 'Alice' }
          }
        }
      })

      store.registerEventDb('update-current-user', (coeffects, payload: { name: string }) => {
        // Handler receives focused state (just the user object)
        return { ...coeffects.db, name: payload.name }
      }, [path(['users', 'current'])])

      await store.dispatch('update-current-user', { name: 'Bob' })

      expect(store.getState().users.current.name).toBe('Bob')
      expect(store.getState().users.current.id).toBe(1) // Preserved
    })

    it('should apply multiple interceptors in order', async () => {
      const store = createStore({
        initialState: { count: 0 }
      })

      const interceptorLog: string[] = []
      const customInterceptor1 = {
        id: 'interceptor1',
        before: (context: any) => {
          interceptorLog.push('before1')
          return context
        },
        after: (context: any) => {
          interceptorLog.push('after1')
          return context
        }
      }

      const customInterceptor2 = {
        id: 'interceptor2',
        before: (context: any) => {
          interceptorLog.push('before2')
          return context
        },
        after: (context: any) => {
          interceptorLog.push('after2')
          return context
        }
      }

      store.registerEventDb('test', (coeffects) => {
        interceptorLog.push('handler')
        return { count: coeffects.db.count + 1 }
      }, [customInterceptor1, customInterceptor2])

      await store.dispatch('test', null)

      // Before phase: left to right
      // After phase: right to left
      expect(interceptorLog).toEqual(['before1', 'before2', 'handler', 'after2', 'after1'])
    })

    it('should apply injectCofx interceptor', async () => {
      interface CustomCofx {
        injected: string
      }

      const store = createStore<{ count: number }, CustomCofx>({
        initialState: { count: 0 },
        coeffects: {}
      })

      let receivedValue: string | undefined
      store.registerEvent('test', (coeffects) => {
        receivedValue = coeffects.injected
        return {}
      }, [injectCofx('injected', 'injected-value')])

      await store.dispatch('test', null)

      expect(receivedValue).toBe('injected-value')
    })

    it('should apply debug interceptor', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
      const store = createStore({
        initialState: { count: 0 }
      })

      store.registerEventDb('test', (coeffects) => {
        return coeffects.db
      }, [debug('test-event')])

      return store.dispatch('test', null).then(() => {
        expect(consoleLogSpy).toHaveBeenCalled()
        consoleLogSpy.mockRestore()
      })
    })
  })

  describe('Effects Execute in Correct Order', () => {
    it('should execute :db effect first, then other effects, then :fx', async () => {
      const store = createStore({
        initialState: { count: 0, log: [] as string[] }
      })

      const executionOrder: string[] = []

      // Register custom effect
      store.registerEffect('log', (message: string) => {
        executionOrder.push(`effect:${message}`)
      })

      store.registerEvent('test', (coeffects): EffectMap => {
        return {
          db: { ...coeffects.db, count: 1 },
          fx: [
            ['log', 'first'],
            ['log', 'second']
          ]
        }
      })

      await store.dispatch('test', null)

      // :db should execute first (state updated)
      expect(store.getState().count).toBe(1)
      
      // :fx effects should execute after
      expect(executionOrder).toEqual(['effect:first', 'effect:second'])
    })

    it('should handle dispatch effects', async () => {
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

      // Should increment twice: once from event, once from dispatch effect
      expect(store.getState().count).toBe(2)
    })

    it('should handle dispatch-n effects', async () => {
      const store = createStore({
        initialState: { count: 0, log: [] as string[] }
      })

      store.registerEventDb('increment', (coeffects) => {
        return { ...coeffects.db, count: coeffects.db.count + 1 }
      })

      store.registerEventDb('add-log', (coeffects, payload: string) => {
        return { ...coeffects.db, log: [...coeffects.db.log, payload] }
      })

      store.registerEvent('increment-many', (coeffects): EffectMap => {
        return {
          'dispatch-n': [
            { event: 'increment', payload: null },
            { event: 'increment', payload: null },
            { event: 'add-log', payload: 'done' }
          ]
        }
      })

      await store.dispatch('increment-many', null)
      // Wait for all queued events to process
      await store.flush()

      expect(store.getState().count).toBe(2)
      expect(store.getState().log).toEqual(['done'])
    })
  })

  describe('Error Handling at Each Phase', () => {
    it('should handle errors in event handlers', async () => {
      const errorHandler = jest.fn()
      const store = createStore({
        initialState: { count: 0 },
        errorHandler: { handler: errorHandler }
      })

      store.registerEvent('error-event', () => {
        throw new Error('Handler error')
      })

      await store.dispatch('error-event', null)

      expect(errorHandler).toHaveBeenCalled()
      const callArgs = errorHandler.mock.calls[0]
      expect(callArgs[0].message).toBe('Handler error')
      // When using registerEvent, the handler is wrapped in an fx-handler interceptor
      // So errors are caught at the interceptor phase
      expect(callArgs[1].phase).toBe('interceptor')
    })

    it('should handle errors in interceptors', async () => {
      const errorHandler = jest.fn()
      const store = createStore({
        initialState: { count: 0 },
        errorHandler: { handler: errorHandler }
      })

      const errorInterceptor = {
        before: () => {
          throw new Error('Interceptor error')
        }
      }

      store.registerEventDb('test', (coeffects) => {
        return coeffects.db
      }, [errorInterceptor])

      await store.dispatch('test', null)

      expect(errorHandler).toHaveBeenCalled()
      const callArgs = errorHandler.mock.calls[0]
      expect(callArgs[0].message).toBe('Interceptor error')
      expect(callArgs[1].phase).toBe('interceptor')
    })

    it('should handle errors in effects', async () => {
      const errorHandler = jest.fn()
      const store = createStore({
        initialState: { count: 0 },
        errorHandler: { handler: errorHandler }
      })

      store.registerEffect('error-effect', () => {
        throw new Error('Effect error')
      })

      store.registerEvent('test', (): EffectMap => {
        return {
          'error-effect': {} as any
        }
      })

      await store.dispatch('test', null)

      expect(errorHandler).toHaveBeenCalled()
      const callArgs = errorHandler.mock.calls[0]
      expect(callArgs[0].message).toBe('Effect error')
      expect(callArgs[1].phase).toBe('effect')
    })

    it('should handle errors in subscriptions', async () => {
      const errorHandler = jest.fn()
      const store = createStore({
        initialState: { count: 0 },
        errorHandler: { handler: errorHandler }
      })

      store.registerSubscription('error-sub', {
        compute: () => {
          throw new Error('Subscription error')
        }
      })

      const result = store.query('error-sub', [])

      expect(result).toBeUndefined()
      expect(errorHandler).toHaveBeenCalled()
      const callArgs = errorHandler.mock.calls[0]
      expect(callArgs[0].message).toBe('Subscription error')
      expect(callArgs[1].phase).toBe('subscription')
    })

    it('should continue processing after error (error isolation)', async () => {
      const store = createStore({
        initialState: { count: 0 }
      })

      store.registerEvent('error-event', () => {
        throw new Error('Error')
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      await store.dispatch('error-event', null)
      await store.dispatch('increment', null)

      // Store should continue working after error
      expect(store.getState().count).toBe(1)
    })
  })

  describe('Complex Scenarios', () => {
    it('should handle nested dispatches', async () => {
      const store = createStore({
        initialState: { count: 0, depth: 0 }
      })

      store.registerEventDb('increment', (coeffects) => {
        return { ...coeffects.db, count: coeffects.db.count + 1 }
      })

      store.registerEvent('increment-with-depth', (coeffects): EffectMap => {
        const newDepth = coeffects.db.depth + 1
        return {
          db: { ...coeffects.db, depth: newDepth },
          dispatch: { event: newDepth < 3 ? 'increment-with-depth' : 'increment', payload: null }
        }
      })

      await store.dispatch('increment-with-depth', null)
      // Wait for all nested dispatches to complete
      await store.flush()

      expect(store.getState().depth).toBe(3)
      expect(store.getState().count).toBe(1)
    })

    it('should handle circular subscription dependencies gracefully', () => {
      const store = createStore({
        initialState: { count: 0 }
      })

      store.registerSubscription('a', {
        deps: ['b'],
        combine: ([b]) => b
      })

      store.registerSubscription('b', {
        deps: ['a'],
        combine: ([a]) => a
      })

      // Should not throw, but may return undefined
      const resultA = store.query('a', [])
      const resultB = store.query('b', [])

      // Circular dependencies should be handled gracefully
      expect(resultA).toBeUndefined()
      expect(resultB).toBeUndefined()
    })

    it('should handle rapid state changes with batching', async () => {
      const scheduler = createSyncScheduler()
      const store = createStore({
        initialState: { count: 0 },
        __scheduler: scheduler
      })

      store.registerEventDb('increment', (coeffects) => {
        return { count: coeffects.db.count + 1 }
      })

      const subscriptionCallback = jest.fn()
      store.registerSubscription('count', {
        compute: (state) => state.count
      })
      store.subscribe('count', [], subscriptionCallback)

      // Dispatch multiple events rapidly
      await Promise.all([
        store.dispatch('increment', null),
        store.dispatch('increment', null),
        store.dispatch('increment', null)
      ])

      // Manually flush the scheduler
      scheduler.flush()

      expect(store.getState().count).toBe(3)
      // Subscription should be notified (may be called multiple times due to batching)
      expect(subscriptionCallback).toHaveBeenCalled()
    })

    it('should handle complete todo app scenario', async () => {
      interface Todo {
        id: number
        text: string
        completed: boolean
      }

      const store = createStore({
        initialState: {
          todos: [] as Todo[],
          filter: 'all' as 'all' | 'active' | 'completed'
        }
      })

      // Register events
      store.registerEventDb('add-todo', (coeffects, payload: { id: number; text: string }) => {
        return {
          ...coeffects.db,
          todos: [...coeffects.db.todos, { ...payload, completed: false }]
        }
      })

      store.registerEventDb('toggle-todo', (coeffects, payload: number) => {
        return {
          ...coeffects.db,
          todos: coeffects.db.todos.map(todo =>
            todo.id === payload ? { ...todo, completed: !todo.completed } : todo
          )
        }
      })

      store.registerEventDb('set-filter', (coeffects, payload: 'all' | 'active' | 'completed') => {
        return { ...coeffects.db, filter: payload }
      })

      // Register subscriptions
      store.registerSubscription('visible-todos', {
        deps: ['todos', 'filter'],
        combine: ([todos, filter]) => {
          if (filter === 'active') {
            return todos.filter((t: Todo) => !t.completed)
          }
          if (filter === 'completed') {
            return todos.filter((t: Todo) => t.completed)
          }
          return todos
        }
      })

      store.registerSubscription('todos', {
        compute: (state) => state.todos
      })

      store.registerSubscription('filter', {
        compute: (state) => state.filter
      })

      // Use the store
      await store.dispatch('add-todo', { id: 1, text: 'Learn Ripplex' })
      await store.dispatch('add-todo', { id: 2, text: 'Write tests' })
      await store.dispatch('toggle-todo', 1)
      await store.dispatch('set-filter', 'active')

      const visibleTodos = store.query('visible-todos', [])
      expect(visibleTodos).toHaveLength(1)
      expect(visibleTodos[0].text).toBe('Write tests')
    })
  })
})

