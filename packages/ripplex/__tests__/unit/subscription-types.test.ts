/**
 * Tests for subscription types
 * Tests compute subscriptions, deps+combine subscriptions, and edge cases
 */

import { SubscriptionRegistry } from '../../src/modules/subscription'

describe('Subscription Types', () => {
  let registry: SubscriptionRegistry<{
    count: number
    items: string[]
    user: { name: string; age: number }
  }>
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    registry = new SubscriptionRegistry()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('compute subscriptions', () => {
    it('should work with simple compute function', () => {
      registry.register('double-count', {
        compute: (state) => state.count * 2
      })

      const result = registry.query({ count: 5, items: [], user: { name: 'Test', age: 20 } }, 'double-count', [])
      expect(result).toBe(10)
    })

    it('should work with compute function that uses params', () => {
      registry.register('multiply', {
        compute: (state, multiplier: number) => state.count * multiplier
      })

      const result = registry.query({ count: 5, items: [], user: { name: 'Test', age: 20 } }, 'multiply', [3])
      expect(result).toBe(15)
    })

    it('should work with compute function that returns complex objects', () => {
      registry.register('user-info', {
        compute: (state) => ({
          name: state.user.name,
          age: state.user.age,
          isAdult: state.user.age >= 18
        })
      })

      const result = registry.query(
        { count: 0, items: [], user: { name: 'John', age: 25 } },
        'user-info',
        []
      )

      expect(result).toEqual({
        name: 'John',
        age: 25,
        isAdult: true
      })
    })

    it('should work with compute function that returns arrays', () => {
      registry.register('items-upper', {
        compute: (state) => state.items.map(item => item.toUpperCase())
      })

      const result = registry.query(
        { count: 0, items: ['a', 'b', 'c'], user: { name: 'Test', age: 20 } },
        'items-upper',
        []
      )

      expect(result).toEqual(['A', 'B', 'C'])
    })

    it('should work with compute function that filters', () => {
      registry.register('even-count', {
        compute: (state) => state.count % 2 === 0
      })

      expect(registry.query({ count: 4, items: [], user: { name: 'Test', age: 20 } }, 'even-count', [])).toBe(true)
      expect(registry.query({ count: 5, items: [], user: { name: 'Test', age: 20 } }, 'even-count', [])).toBe(false)
    })
  })

  describe('deps + combine subscriptions', () => {
    it('should work with single dependency', () => {
      registry.register('count', {
        compute: (state) => state.count
      })

      registry.register('count-plus-ten', {
        deps: ['count'],
        combine: (deps: [number]) => deps[0] + 10
      })

      const result = registry.query(
        { count: 5, items: [], user: { name: 'Test', age: 20 } },
        'count-plus-ten',
        []
      )

      expect(result).toBe(15)
    })

    it('should work with multiple dependencies', () => {
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

      const result = registry.query(
        { count: 5, items: ['a', 'b'], user: { name: 'Test', age: 20 } },
        'sum',
        []
      )

      expect(result).toBe(7)
    })

    it('should work with params in combine function', () => {
      registry.register('count', {
        compute: (state) => state.count
      })

      registry.register('count-plus', {
        deps: ['count'],
        combine: (deps: [number], addend: number) => deps[0] + addend
      })

      const result = registry.query(
        { count: 5, items: [], user: { name: 'Test', age: 20 } },
        'count-plus',
        [20]
      )

      expect(result).toBe(25)
    })

    it('should work with nested dependencies', () => {
      registry.register('count', {
        compute: (state) => state.count
      })

      registry.register('count-doubled', {
        deps: ['count'],
        combine: (deps: [number]) => deps[0] * 2
      })

      registry.register('count-quadrupled', {
        deps: ['count-doubled'],
        combine: (deps: [number]) => deps[0] * 2
      })

      const result = registry.query(
        { count: 5, items: [], user: { name: 'Test', age: 20 } },
        'count-quadrupled',
        []
      )

      expect(result).toBe(20) // 5 * 2 * 2
    })

    it('should work with complex dependency chains', () => {
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

      registry.register('product', {
        deps: ['count', 'items-length'],
        combine: (deps: [number, number]) => deps[0] * deps[1]
      })

      registry.register('total', {
        deps: ['sum', 'product'],
        combine: (deps: [number, number]) => deps[0] + deps[1]
      })

      const result = registry.query(
        { count: 3, items: ['a', 'b'], user: { name: 'Test', age: 20 } },
        'total',
        []
      )

      // sum = 3 + 2 = 5, product = 3 * 2 = 6, total = 5 + 6 = 11
      expect(result).toBe(11)
    })

    it('should handle missing dependency gracefully', () => {
      registry.register('missing-dep', {
        deps: ['non-existent'],
        combine: (deps: [any]) => deps[0]
      })

      const result = registry.query(
        { count: 0, items: [], user: { name: 'Test', age: 20 } },
        'missing-dep',
        []
      )

      expect(result).toBeUndefined()
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should handle error in dependency computation', () => {
      registry.register('error-dep', {
        compute: () => {
          throw new Error('Dependency error')
        }
      })

      registry.register('uses-error-dep', {
        deps: ['error-dep'],
        combine: (deps: [any]) => deps[0]
      })

      const result = registry.query(
        { count: 0, items: [], user: { name: 'Test', age: 20 } },
        'uses-error-dep',
        []
      )

      expect(result).toBeUndefined()
    })

    it('should handle error in combine function', () => {
      registry.register('count', {
        compute: (state) => state.count
      })

      registry.register('error-combine', {
        deps: ['count'],
        combine: () => {
          throw new Error('Combine error')
        }
      })

      const result = registry.query(
        { count: 5, items: [], user: { name: 'Test', age: 20 } },
        'error-combine',
        []
      )

      expect(result).toBeUndefined()
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('invalid configs', () => {
    it('should handle config with neither compute nor deps+combine', () => {
      registry.register('invalid', {} as any)

      const result = registry.query(
        { count: 0, items: [], user: { name: 'Test', age: 20 } },
        'invalid',
        []
      )

      expect(result).toBeUndefined()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Invalid subscription config for "invalid"')
    })

    it('should handle config with deps but no combine', () => {
      registry.register('invalid', {
        deps: ['count']
      } as any)

      const result = registry.query(
        { count: 0, items: [], user: { name: 'Test', age: 20 } },
        'invalid',
        []
      )

      expect(result).toBeUndefined()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Invalid subscription config for "invalid"')
    })

    it('should handle config with combine but no deps', () => {
      registry.register('invalid', {
        combine: (deps: any[]) => deps[0]
      } as any)

      const result = registry.query(
        { count: 0, items: [], user: { name: 'Test', age: 20 } },
        'invalid',
        []
      )

      expect(result).toBeUndefined()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Invalid subscription config for "invalid"')
    })

    it('should handle empty deps array', () => {
      registry.register('empty-deps', {
        deps: [],
        combine: () => 42
      })

      const result = registry.query(
        { count: 0, items: [], user: { name: 'Test', age: 20 } },
        'empty-deps',
        []
      )

      expect(result).toBe(42)
    })
  })

  describe('circular dependency detection', () => {
    it('should handle direct circular dependency', () => {
      registry.register('a', {
        deps: ['a'],
        combine: (deps: [any]) => deps[0]
      })

      // This will cause infinite recursion if not handled
      // The query will fail when trying to query 'a' which depends on 'a'
      const result = registry.query(
        { count: 0, items: [], user: { name: 'Test', age: 20 } },
        'a',
        []
      )

      // Should handle gracefully (will query 'a' which queries 'a' which queries 'a'...)
      // The error handler should catch this
      expect(result).toBeUndefined()
    })

    it('should handle indirect circular dependency', () => {
      registry.register('a', {
        deps: ['b'],
        combine: (deps: [any]) => deps[0]
      })

      registry.register('b', {
        deps: ['c'],
        combine: (deps: [any]) => deps[0]
      })

      registry.register('c', {
        deps: ['a'],
        combine: (deps: [any]) => deps[0]
      })

      // a -> b -> c -> a (circular)
      const result = registry.query(
        { count: 0, items: [], user: { name: 'Test', age: 20 } },
        'a',
        []
      )

      // Should handle gracefully
      expect(result).toBeUndefined()
    })

    it('should handle self-referential compute subscription', () => {
      // This is not a circular dependency in the deps sense,
      // but a compute function that queries itself would cause issues
      // However, compute functions don't have access to query, so this is not possible
      // This test is just to document the behavior
      registry.register('self-ref', {
        compute: (state) => state.count
      })

      const result = registry.query(
        { count: 5, items: [], user: { name: 'Test', age: 20 } },
        'self-ref',
        []
      )

      expect(result).toBe(5)
    })
  })

  describe('edge cases', () => {
    it('should handle null and undefined values', () => {
      registry.register('null-value', {
        compute: () => null
      })

      registry.register('undefined-value', {
        compute: () => undefined
      })

      expect(registry.query({ count: 0, items: [], user: { name: 'Test', age: 20 } }, 'null-value', [])).toBeNull()
      expect(
        registry.query({ count: 0, items: [], user: { name: 'Test', age: 20 } }, 'undefined-value', [])
      ).toBeUndefined()
    })

    it('should handle empty arrays and objects', () => {
      registry.register('empty-array', {
        compute: () => []
      })

      registry.register('empty-object', {
        compute: () => ({})
      })

      expect(registry.query({ count: 0, items: [], user: { name: 'Test', age: 20 } }, 'empty-array', [])).toEqual([])
      expect(registry.query({ count: 0, items: [], user: { name: 'Test', age: 20 } }, 'empty-object', [])).toEqual({})
    })

    it('should handle very deep dependency chains', () => {
      // Create a chain of 10 dependencies
      registry.register('level-0', {
        compute: (state) => state.count
      })

      for (let i = 1; i <= 10; i++) {
        registry.register(`level-${i}`, {
          deps: [`level-${i - 1}`],
          combine: (deps: [number]) => deps[0] + 1
        })
      }

      const result = registry.query(
        { count: 0, items: [], user: { name: 'Test', age: 20 } },
        'level-10',
        []
      )

      expect(result).toBe(10)
    })

    it('should handle subscriptions with many params', () => {
      registry.register('many-params', {
        compute: (state, a: number, b: number, c: number, d: number, e: number) => a + b + c + d + e
      })

      const result = registry.query(
        { count: 0, items: [], user: { name: 'Test', age: 20 } },
        'many-params',
        [1, 2, 3, 4, 5]
      )

      expect(result).toBe(15)
    })
  })
})

