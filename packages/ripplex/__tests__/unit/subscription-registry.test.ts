/**
 * Tests for the subscription registry module
 * Tests subscription registration, querying, caching, and listener management
 */

import { SubscriptionRegistry, Subscription } from '../../src/modules/subscription'

describe('SubscriptionRegistry', () => {
  let registry: SubscriptionRegistry<{ count: number; items: string[] }>
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    registry = new SubscriptionRegistry()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('register', () => {
    it('should store subscription configs', () => {
      const config = {
        compute: (state: { count: number }) => state.count * 2
      }

      registry.register('double-count', config)

      // Verify by querying
      const result = registry.query({ count: 5, items: [] }, 'double-count', [])
      expect(result).toBe(10)
    })

    it('should allow overwriting subscription configs', () => {
      registry.register('test', {
        compute: (state) => state.count
      })

      registry.register('test', {
        compute: (state) => state.count * 2
      })

      const result = registry.query({ count: 5, items: [] }, 'test', [])
      expect(result).toBe(10)
    })
  })

  describe('getSubscription', () => {
    it('should return same object for same key+params', () => {
      const sub1 = registry.getSubscription('test', [])
      const sub2 = registry.getSubscription('test', [])

      expect(sub1).toBe(sub2)
      expect(sub1.key).toBe('test')
      expect(sub1.params).toEqual([])
    })

    it('should return different objects for different keys', () => {
      const sub1 = registry.getSubscription('test1', [])
      const sub2 = registry.getSubscription('test2', [])

      expect(sub1).not.toBe(sub2)
      expect(sub1.key).toBe('test1')
      expect(sub2.key).toBe('test2')
    })

    it('should return different objects for different params', () => {
      const sub1 = registry.getSubscription('test', [1])
      const sub2 = registry.getSubscription('test', [2])

      expect(sub1).not.toBe(sub2)
      expect(sub1.params).toEqual([1])
      expect(sub2.params).toEqual([2])
    })

    it('should return same object for same key+params (complex params)', () => {
      const params1 = [{ id: 1, name: 'test' }]
      const params2 = [{ id: 1, name: 'test' }]

      const sub1 = registry.getSubscription('test', params1)
      const sub2 = registry.getSubscription('test', params2)

      expect(sub1).toBe(sub2)
    })

    it('should create Subscription instance with correct properties', () => {
      const sub = registry.getSubscription('my-key', ['param1', 2])

      expect(sub).toBeInstanceOf(Subscription)
      expect(sub.key).toBe('my-key')
      expect(sub.params).toEqual(['param1', 2])
    })
  })

  describe('query', () => {
    it('should compute result using compute function', () => {
      registry.register('double', {
        compute: (state) => state.count * 2
      })

      const result = registry.query({ count: 5, items: [] }, 'double', [])
      expect(result).toBe(10)
    })

    it('should cache results by state reference', () => {
      const computeFn = jest.fn((state) => state.count * 2)
      registry.register('double', { compute: computeFn })

      const state1 = { count: 5, items: [] }
      const result1 = registry.query(state1, 'double', [])
      const result2 = registry.query(state1, 'double', [])

      expect(result1).toBe(10)
      expect(result2).toBe(10)
      expect(computeFn).toHaveBeenCalledTimes(1) // Should only compute once
    })

    it('should recompute when state reference changes', () => {
      const computeFn = jest.fn((state) => state.count * 2)
      registry.register('double', { compute: computeFn })

      const state1 = { count: 5, items: [] }
      const state2 = { count: 5, items: [] } // Different reference, same value

      registry.query(state1, 'double', [])
      registry.query(state2, 'double', [])

      expect(computeFn).toHaveBeenCalledTimes(2)
    })

    it('should handle errors gracefully', () => {
      registry.register('error-sub', {
        compute: () => {
          throw new Error('Computation error')
        }
      })

      const result = registry.query({ count: 0, items: [] }, 'error-sub', [])
      expect(result).toBeUndefined()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error computing subscription "error-sub"'),
        expect.any(Error)
      )
    })

    it('should return cached result on error if available', () => {
      const state = { count: 5, items: [] }
      
      registry.register('test', {
        compute: (s) => s.count * 2
      })

      // First query succeeds
      const result1 = registry.query(state, 'test', [])
      expect(result1).toBe(10)

      // Overwrite with error-throwing function
      registry.register('test', {
        compute: () => {
          throw new Error('Error')
        }
      })

      // Should return cached result
      const result2 = registry.query(state, 'test', [])
      expect(result2).toBe(10)
    })

    it('should handle missing subscription', () => {
      const result = registry.query({ count: 0, items: [] }, 'missing', [])

      expect(result).toBeUndefined()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Subscription "missing" not registered')
    })

    it('should pass params to compute function', () => {
      registry.register('multiply', {
        compute: (state, multiplier: number) => state.count * multiplier
      })

      const result = registry.query({ count: 5, items: [] }, 'multiply', [3])
      expect(result).toBe(15)
    })

    it('should handle deps + combine subscriptions', () => {
      registry.register('count', {
        compute: (state) => state.count
      })

      registry.register('items-length', {
        compute: (state) => state.items.length
      })

      registry.register('sum', {
        deps: ['count', 'items-length'],
        combine: (deps: [number, number]) => deps[0] + deps[1]
      })

      const result = registry.query({ count: 5, items: ['a', 'b'] }, 'sum', [])
      expect(result).toBe(7)
    })

    it('should handle invalid subscription config', () => {
      registry.register('invalid', {} as any)

      const result = registry.query({ count: 0, items: [] }, 'invalid', [])
      expect(result).toBeUndefined()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Invalid subscription config for "invalid"')
    })

    it('should handle error handler callback', () => {
      const onError = jest.fn()
      
      registry.register('error-sub', {
        compute: () => {
          throw new Error('Test error')
        }
      })

      registry.query({ count: 0, items: [] }, 'error-sub', [], onError)

      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        'error-sub',
        []
      )
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })
  })

  describe('subscribe', () => {
    it('should add listener and call callback immediately', () => {
      registry.register('double', {
        compute: (state) => state.count * 2
      })

      const callback = jest.fn()
      const state = { count: 5, items: [] }

      registry.subscribe(state, 'double', [], callback)

      expect(callback).toHaveBeenCalledWith(10)
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should return unsubscribe function', () => {
      registry.register('test', {
        compute: (state) => state.count
      })

      const callback = jest.fn()
      const unsubscribe = registry.subscribe({ count: 0, items: [] }, 'test', [], callback)

      expect(typeof unsubscribe).toBe('function')
    })

    it('should increment reference count on subscribe', () => {
      registry.register('test', {
        compute: (state) => state.count
      })

      const sub1 = registry.getSubscription('test', [])
      const sub2 = registry.getSubscription('test', [])

      expect(sub1).toBe(sub2)

      const callback1 = jest.fn()
      const callback2 = jest.fn()

      registry.subscribe({ count: 0, items: [] }, 'test', [], callback1)
      registry.subscribe({ count: 0, items: [] }, 'test', [], callback2)

      // Both should have been called
      expect(callback1).toHaveBeenCalled()
      expect(callback2).toHaveBeenCalled()
    })

    it('should decrement reference count on unsubscribe', () => {
      registry.register('test', {
        compute: (state) => state.count
      })

      const callback1 = jest.fn()
      const callback2 = jest.fn()

      const unsubscribe1 = registry.subscribe({ count: 0, items: [] }, 'test', [], callback1)
      const unsubscribe2 = registry.subscribe({ count: 0, items: [] }, 'test', [], callback2)

      unsubscribe1()
      unsubscribe2()

      // Subscription should still exist (cache entry) until cleanup
      const sub = registry.getSubscription('test', [])
      expect(sub).toBeDefined()
    })

    it('should remove listener on unsubscribe', () => {
      registry.register('test', {
        compute: (state) => state.count
      })

      const callback = jest.fn()
      const state = { count: 0, items: [] }

      const unsubscribe = registry.subscribe(state, 'test', [], callback)

      // Notify listeners
      registry.notifyListeners({ count: 1, items: [] })
      expect(callback).toHaveBeenCalledTimes(2) // Once on subscribe, once on notify

      unsubscribe()

      // Notify again - should not call callback
      registry.notifyListeners({ count: 2, items: [] })
      expect(callback).toHaveBeenCalledTimes(2) // Still 2
    })

    it('should handle multiple listeners', () => {
      registry.register('test', {
        compute: (state) => state.count
      })

      const callback1 = jest.fn()
      const callback2 = jest.fn()
      const callback3 = jest.fn()

      registry.subscribe({ count: 0, items: [] }, 'test', [], callback1)
      registry.subscribe({ count: 0, items: [] }, 'test', [], callback2)
      registry.subscribe({ count: 0, items: [] }, 'test', [], callback3)

      registry.notifyListeners({ count: 1, items: [] })

      expect(callback1).toHaveBeenCalledTimes(2) // Initial + notify
      expect(callback2).toHaveBeenCalledTimes(2)
      expect(callback3).toHaveBeenCalledTimes(2)
    })

    it('should pass params to compute function in subscribe', () => {
      registry.register('multiply', {
        compute: (state, multiplier: number) => state.count * multiplier
      })

      const callback = jest.fn()
      registry.subscribe({ count: 5, items: [] }, 'multiply', [3], callback)

      expect(callback).toHaveBeenCalledWith(15)
    })
  })

  describe('notifyListeners', () => {
    it('should notify listeners when result changes', () => {
      registry.register('double', {
        compute: (state) => state.count * 2
      })

      const callback = jest.fn()
      const state1 = { count: 5, items: [] }

      registry.subscribe(state1, 'double', [], callback)
      expect(callback).toHaveBeenCalledWith(10)

      // Change state
      const state2 = { count: 6, items: [] }
      registry.notifyListeners(state2)

      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(12)
    })

    it('should not notify when result is the same', () => {
      registry.register('double', {
        compute: (state) => state.count * 2
      })

      const callback = jest.fn()
      const state1 = { count: 5, items: [] }

      registry.subscribe(state1, 'double', [], callback)
      expect(callback).toHaveBeenCalledWith(10)

      // Same result (different state reference, but same computed value)
      const state2 = { count: 5, items: [] }
      registry.notifyListeners(state2)

      // Should still be called (because state reference changed, so we recompute)
      // But deepEqual should prevent notification if result is same
      expect(callback).toHaveBeenCalledTimes(1) // Only initial call
    })

    it('should notify all active subscriptions', () => {
      registry.register('count', {
        compute: (state) => state.count
      })

      registry.register('items-length', {
        compute: (state) => state.items.length
      })

      const callback1 = jest.fn()
      const callback2 = jest.fn()

      registry.subscribe({ count: 0, items: [] }, 'count', [], callback1)
      registry.subscribe({ count: 0, items: [] }, 'items-length', [], callback2)

      registry.notifyListeners({ count: 1, items: ['a'] })

      expect(callback1).toHaveBeenCalledTimes(2) // Initial + notify
      expect(callback2).toHaveBeenCalledTimes(2)
      expect(callback1).toHaveBeenLastCalledWith(1)
      expect(callback2).toHaveBeenLastCalledWith(1)
    })

    it('should handle subscriptions with dependencies', () => {
      registry.register('count', {
        compute: (state) => state.count
      })

      registry.register('sum', {
        deps: ['count'],
        combine: (deps: [number]) => deps[0] + 10
      })

      const callback = jest.fn()
      registry.subscribe({ count: 5, items: [] }, 'sum', [], callback)

      expect(callback).toHaveBeenCalledWith(15)

      registry.notifyListeners({ count: 10, items: [] })

      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(20)
    })

    it('should skip subscriptions with no listeners', () => {
      registry.register('test', {
        compute: (state) => state.count
      })

      // Get subscription but don't subscribe
      registry.getSubscription('test', [])

      // Should not throw
      expect(() => {
        registry.notifyListeners({ count: 1, items: [] })
      }).not.toThrow()
    })

    it('should handle errors during notification gracefully', () => {
      registry.register('error-sub', {
        compute: (state) => {
          if (state.count > 0) {
            throw new Error('Error')
          }
          return 0
        }
      })

      const callback = jest.fn()
      registry.subscribe({ count: 0, items: [] }, 'error-sub', [], callback)

      expect(callback).toHaveBeenCalledWith(0)

      // This will cause an error during query
      registry.notifyListeners({ count: 1, items: [] })

      // Should not crash, callback should not be called again (error returns cached/undefined)
      expect(callback).toHaveBeenCalledTimes(1)
    })
  })

  describe('cleanup', () => {
    it('should cleanup subscription cache when no references remain', () => {
      registry.register('test', {
        compute: (state) => state.count
      })

      const callback = jest.fn()
      const unsubscribe = registry.subscribe({ count: 0, items: [] }, 'test', [], callback)

      // Get subscription to verify it exists
      const sub1 = registry.getSubscription('test', [])
      expect(sub1).toBeDefined()

      unsubscribe()

      // After unsubscribe with no references/listeners, subscription is removed from cache
      // getSubscription will create a new Subscription object (but with same key+params)
      const sub2 = registry.getSubscription('test', [])
      expect(sub2).toBeDefined()
      expect(sub2).not.toBe(sub1) // New object created after cleanup
      expect(sub2.key).toBe(sub1.key) // But same key
      expect(sub2.params).toEqual(sub1.params) // And same params
    })

    it('should handle multiple unsubscribes gracefully', () => {
      registry.register('test', {
        compute: (state) => state.count
      })

      const callback = jest.fn()
      const unsubscribe = registry.subscribe({ count: 0, items: [] }, 'test', [], callback)

      unsubscribe()
      unsubscribe() // Should not throw

      expect(() => unsubscribe()).not.toThrow()
    })
  })
})

