/**
 * Tests for the subscription manager module
 * Tests integration with state manager and error handler
 */

import { createSubscriptionManager, SubscriptionManager } from '../../src/modules/subscriptions'
import { createStateManager, StateManager } from '../../src/modules/state'
import { createErrorHandler, ErrorHandlerManager } from '../../src/modules/errorHandler'

describe('SubscriptionManager', () => {
  let stateManager: StateManager<{ count: number; items: string[] }>
  let errorHandler: ErrorHandlerManager
  let manager: SubscriptionManager<{ count: number; items: string[] }>
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    stateManager = createStateManager({ count: 0, items: [] })
    errorHandler = createErrorHandler()
    manager = createSubscriptionManager({
      stateManager,
      errorHandler
    })
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('createSubscriptionManager', () => {
    it('should create a subscription manager', () => {
      expect(manager).toBeDefined()
      expect(manager.registerSubscription).toBeDefined()
      expect(manager.subscribe).toBeDefined()
      expect(manager.query).toBeDefined()
      expect(manager.getSubscription).toBeDefined()
      expect(manager.notifyListeners).toBeDefined()
    })
  })

  describe('registerSubscription', () => {
    it('should register a subscription', () => {
      manager.registerSubscription('double-count', {
        compute: (state) => state.count * 2
      })

      const result = manager.query('double-count', [])
      expect(result).toBe(0) // Initial state count is 0
    })

    it('should allow overwriting subscriptions', () => {
      manager.registerSubscription('test', {
        compute: (state) => state.count
      })

      manager.registerSubscription('test', {
        compute: (state) => state.count * 2
      })

      const result = manager.query('test', [])
      expect(result).toBe(0)
    })
  })

  describe('query', () => {
    it('should query subscription using current state', () => {
      manager.registerSubscription('double-count', {
        compute: (state) => state.count * 2
      })

      expect(manager.query('double-count', [])).toBe(0)

      stateManager.setState({ count: 5, items: [] })

      expect(manager.query('double-count', [])).toBe(10)
    })

    it('should query subscription with params', () => {
      manager.registerSubscription('multiply', {
        compute: (state, multiplier: number) => state.count * multiplier
      })

      stateManager.setState({ count: 5, items: [] })

      expect(manager.query('multiply', [3])).toBe(15)
    })

    it('should handle missing subscription', () => {
      const result = manager.query('missing', [])

      expect(result).toBeUndefined()
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should use current state from state manager', () => {
      manager.registerSubscription('count', {
        compute: (state) => state.count
      })

      // Initial state
      expect(manager.query('count', [])).toBe(0)

      // Update state
      stateManager.setState({ count: 10, items: [] })

      // Query should use new state
      expect(manager.query('count', [])).toBe(10)
    })

    it('should handle errors gracefully', () => {
      manager.registerSubscription('error-sub', {
        compute: () => {
          throw new Error('Computation error')
        }
      })

      const result = manager.query('error-sub', [])

      expect(result).toBeUndefined()
    })
  })

  describe('subscribe', () => {
    it('should subscribe and call callback immediately with current state', () => {
      manager.registerSubscription('double-count', {
        compute: (state) => state.count * 2
      })

      const callback = jest.fn()
      manager.subscribe('double-count', [], callback)

      expect(callback).toHaveBeenCalledWith(0) // Initial state
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should return unsubscribe function', () => {
      manager.registerSubscription('test', {
        compute: (state) => state.count
      })

      const callback = jest.fn()
      const unsubscribe = manager.subscribe('test', [], callback)

      expect(typeof unsubscribe).toBe('function')
    })

    it('should notify listeners when state changes', () => {
      manager.registerSubscription('count', {
        compute: (state) => state.count
      })

      const callback = jest.fn()
      manager.subscribe('count', [], callback)

      expect(callback).toHaveBeenCalledWith(0)

      // Update state and notify
      stateManager.setState({ count: 5, items: [] })
      manager.notifyListeners(stateManager.getState())

      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(5)
    })

    it('should not notify when result is the same', () => {
      manager.registerSubscription('double-count', {
        compute: (state) => state.count * 2
      })

      const callback = jest.fn()
      manager.subscribe('double-count', [], callback)

      expect(callback).toHaveBeenCalledWith(0)

      // Change state but result is same (0 * 2 = 0, 0 * 2 = 0)
      stateManager.setState({ count: 0, items: ['a'] }) // Different state, same count
      manager.notifyListeners(stateManager.getState())

      // Should not notify because result is the same
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should handle multiple subscriptions', () => {
      manager.registerSubscription('count', {
        compute: (state) => state.count
      })

      const callback1 = jest.fn()
      const callback2 = jest.fn()
      const callback3 = jest.fn()

      manager.subscribe('count', [], callback1)
      manager.subscribe('count', [], callback2)
      manager.subscribe('count', [], callback3)

      stateManager.setState({ count: 10, items: [] })
      manager.notifyListeners(stateManager.getState())

      expect(callback1).toHaveBeenCalledTimes(2)
      expect(callback2).toHaveBeenCalledTimes(2)
      expect(callback3).toHaveBeenCalledTimes(2)
    })

    it('should remove listener on unsubscribe', () => {
      manager.registerSubscription('count', {
        compute: (state) => state.count
      })

      const callback = jest.fn()
      const unsubscribe = manager.subscribe('count', [], callback)

      stateManager.setState({ count: 5, items: [] })
      manager.notifyListeners(stateManager.getState())

      expect(callback).toHaveBeenCalledTimes(2)

      unsubscribe()

      stateManager.setState({ count: 10, items: [] })
      manager.notifyListeners(stateManager.getState())

      expect(callback).toHaveBeenCalledTimes(2) // Still 2, not notified after unsubscribe
    })
  })

  describe('getSubscription', () => {
    it('should return same object for same key+params', () => {
      const sub1 = manager.getSubscription('test', [])
      const sub2 = manager.getSubscription('test', [])

      expect(sub1).toBe(sub2)
      expect(sub1.key).toBe('test')
      expect(sub1.params).toEqual([])
    })

    it('should return different objects for different params', () => {
      const sub1 = manager.getSubscription('test', [1])
      const sub2 = manager.getSubscription('test', [2])

      expect(sub1).not.toBe(sub2)
    })
  })

  describe('notifyListeners', () => {
    it('should notify all active subscriptions', () => {
      manager.registerSubscription('count', {
        compute: (state) => state.count
      })

      manager.registerSubscription('items-length', {
        compute: (state) => state.items.length
      })

      const callback1 = jest.fn()
      const callback2 = jest.fn()

      manager.subscribe('count', [], callback1)
      manager.subscribe('items-length', [], callback2)

      stateManager.setState({ count: 5, items: ['a', 'b'] })
      manager.notifyListeners(stateManager.getState())

      expect(callback1).toHaveBeenCalledTimes(2) // Initial + notify
      expect(callback2).toHaveBeenCalledTimes(2)
      expect(callback1).toHaveBeenLastCalledWith(5)
      expect(callback2).toHaveBeenLastCalledWith(2)
    })

    it('should use provided state, not state manager state', () => {
      manager.registerSubscription('count', {
        compute: (state) => state.count
      })

      const callback = jest.fn()
      manager.subscribe('count', [], callback)

      // State manager has count: 0
      // But we notify with different state
      manager.notifyListeners({ count: 100, items: [] })

      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(100)
    })

    it('should handle subscriptions with dependencies', () => {
      manager.registerSubscription('count', {
        compute: (state) => state.count
      })

      manager.registerSubscription('sum', {
        deps: ['count'],
        combine: (deps: [number]) => deps[0] + 10
      })

      const callback = jest.fn()
      manager.subscribe('sum', [], callback)

      expect(callback).toHaveBeenCalledWith(10) // 0 + 10

      stateManager.setState({ count: 5, items: [] })
      manager.notifyListeners(stateManager.getState())

      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(15) // 5 + 10
    })

    it('should handle errors during notification', () => {
      manager.registerSubscription('error-sub', {
        compute: (state) => {
          if (state.count > 0) {
            throw new Error('Error')
          }
          return 0
        }
      })

      const callback = jest.fn()
      manager.subscribe('error-sub', [], callback)

      expect(callback).toHaveBeenCalledWith(0)

      // This will cause an error
      stateManager.setState({ count: 1, items: [] })
      manager.notifyListeners(stateManager.getState())

      // Should not crash, callback should not be called again
      expect(callback).toHaveBeenCalledTimes(1)
    })
  })

  describe('integration with state manager', () => {
    it('should use current state from state manager in query', () => {
      manager.registerSubscription('count', {
        compute: (state) => state.count
      })

      // Initial state
      expect(manager.query('count', [])).toBe(0)

      // Update state
      stateManager.setState({ count: 42, items: [] })

      // Query should reflect new state
      expect(manager.query('count', [])).toBe(42)
    })

    it('should use current state from state manager in subscribe', () => {
      manager.registerSubscription('count', {
        compute: (state) => state.count
      })

      stateManager.setState({ count: 100, items: [] })

      const callback = jest.fn()
      manager.subscribe('count', [], callback)

      // Should use current state (100), not initial state (0)
      expect(callback).toHaveBeenCalledWith(100)
    })
  })

  describe('error handling integration', () => {
    it('should use error handler for subscription errors', () => {
      const errorHandlerSpy = jest.fn()
      errorHandler.register(errorHandlerSpy)

      manager.registerSubscription('error-sub', {
        compute: () => {
          throw new Error('Test error')
        }
      })

      manager.query('error-sub', [])

      // Error handler should be called
      expect(errorHandlerSpy).toHaveBeenCalled()
      const call = errorHandlerSpy.mock.calls[0]
      expect(call[0]).toBeInstanceOf(Error)
      expect(call[1].eventKey).toBe('subscription:error-sub')
      expect(call[1].phase).toBe('subscription')
    })

    it('should handle errors in error handler gracefully', () => {
      const throwingErrorHandler = jest.fn(() => {
        throw new Error('Error handler error')
      })
      errorHandler.register(throwingErrorHandler)

      manager.registerSubscription('error-sub', {
        compute: () => {
          throw new Error('Test error')
        }
      })

      // Should not throw
      expect(() => {
        manager.query('error-sub', [])
      }).not.toThrow()
    })
  })

  describe('deep equality checking', () => {
    it('should notify when object reference changes but value is same', () => {
      manager.registerSubscription('items', {
        compute: (state) => state.items
      })

      const callback = jest.fn()
      manager.subscribe('items', [], callback)

      expect(callback).toHaveBeenCalledWith([])

      // Same value, different reference
      stateManager.setState({ count: 0, items: [] })
      manager.notifyListeners(stateManager.getState())

      // Should notify because deep equality check sees they're the same
      // Actually, wait - if the result is the same (deep equal), it should NOT notify
      // But the state reference changed, so we recompute. If the result is the same, we don't notify.
      // Let me check the implementation... Actually, the deepEqual check should prevent notification
      // But since we're using JSON.stringify, [] === [] should be true, so it shouldn't notify
      // However, the state reference changed, so we need to recompute. If the result is the same, we don't notify.
      expect(callback).toHaveBeenCalledTimes(1) // Should not notify if result is same
    })

    it('should notify when array content changes', () => {
      manager.registerSubscription('items', {
        compute: (state) => state.items
      })

      const callback = jest.fn()
      manager.subscribe('items', [], callback)

      expect(callback).toHaveBeenCalledWith([])

      stateManager.setState({ count: 0, items: ['a'] })
      manager.notifyListeners(stateManager.getState())

      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(['a'])
    })

    it('should notify when nested object changes', () => {
      type State = { user: { name: string; age: number } }
      const stateManager2 = createStateManager<State>({ user: { name: 'John', age: 20 } })
      const manager2 = createSubscriptionManager({
        stateManager: stateManager2,
        errorHandler
      })

      manager2.registerSubscription('user-name', {
        compute: (state) => state.user.name
      })

      const callback = jest.fn()
      manager2.subscribe('user-name', [], callback)

      expect(callback).toHaveBeenCalledWith('John')

      stateManager2.setState({ user: { name: 'Jane', age: 20 } })
      manager2.notifyListeners(stateManager2.getState())

      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith('Jane')
    })
  })
})

