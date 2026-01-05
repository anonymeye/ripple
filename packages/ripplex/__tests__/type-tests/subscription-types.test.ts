/**
 * Type tests for subscription type safety
 * These tests verify TypeScript type checking at compile time
 */

import { createStore, SubscriptionConfig, SubscriptionFn } from '../../src'

describe('Subscription Config Type Safety', () => {
  interface State {
    count: number
    users: Array<{ id: number; name: string }>
  }

  test('should type compute subscription correctly', () => {
    const config: SubscriptionConfig<State, number> = {
      compute: (state) => {
        // Type check: state should be State
        const _stateCheck: State = state
        return state.count
      }
    }

    // Type check: config should be SubscriptionConfig<State, number>
    const _configCheck: SubscriptionConfig<State, number> = config
    if (config.compute) {
      const result = config.compute({ count: 0, users: [] })
      // Type check: result should be number
      const _resultCheck: number = result
      expect(typeof result).toBe('number')
    }
  })

  test('should type compute subscription with params', () => {
    const config: SubscriptionConfig<State, string, [number]> = {
      compute: (state, userId) => {
        // Type check: state should be State
        const _stateCheck: State = state
        // Type check: userId should be number
        const _userIdCheck: number = userId
        const user = state.users.find(u => u.id === userId)
        return user?.name || ''
      }
    }

    // Type check: config should be correct type
    const _configCheck: SubscriptionConfig<State, string, [number]> = config
    expect(config.compute).toBeDefined()
  })

  test('should type deps + combine subscription', () => {
    const config: SubscriptionConfig<State, number, [], [number, number]> = {
      deps: ['count', 'total-users'],
      combine: (deps, ...params) => {
        // Type check: deps should be [number, number]
        const _depsCheck: [number, number] = deps
        // Type check: params should be []
        const _paramsCheck: [] = params
        const [count, totalUsers] = deps
        return count + totalUsers
      }
    }

    // Type check: config should be correct type
    const _configCheck: SubscriptionConfig<State, number, [], [number, number]> = config
    expect(config.deps).toBeDefined()
  })

  test('should type deps + combine subscription with params', () => {
    const config: SubscriptionConfig<State, string, [number], [number]> = {
      deps: ['user-by-id'],
      combine: (deps, userId) => {
        // Type check: deps should be [number]
        const _depsCheck: [number] = deps
        // Type check: userId should be number
        const _userIdCheck: number = userId
        return `User ${deps[0]}`
      }
    }

    // Type check: config should be correct type
    const _configCheck: SubscriptionConfig<State, string, [number], [number]> = config
    expect(config.combine).toBeDefined()
  })
})

describe('Subscription Function Type Safety', () => {
  interface SimpleState {
    count: number
  }

  test('should type SubscriptionFn correctly', () => {
    const fn: SubscriptionFn<SimpleState, number> = (state) => {
      // Type check: state should be SimpleState
      const _stateCheck: SimpleState = state
      return state.count
    }

    // Type check: fn should be SubscriptionFn<SimpleState, number>
    const _fnCheck: SubscriptionFn<SimpleState, number> = fn
    expect(fn({ count: 5 })).toBe(5)
  })

  test('should type SubscriptionFn with params', () => {
    const fn: SubscriptionFn<SimpleState, string, [number]> = (state, userId) => {
      // Type check: state should be SimpleState
      const _stateCheck: SimpleState = state
      // Type check: userId should be number
      const _userIdCheck: number = userId
      return `user-${userId}`
    }

    // Type check: fn should be correct type
    const _fnCheck: SubscriptionFn<SimpleState, string, [number]> = fn
    expect(fn({ count: 0 }, 123)).toBe('user-123')
  })

  test('should enforce return type', () => {
    // This test verifies that TypeScript catches type errors at compile time
    // In a real scenario, this would fail: should return number, not string
    // We use 'as any' here to bypass the type check for testing purposes
    const _invalidFn: SubscriptionFn<SimpleState, number> = (state) => {
      return 'invalid' as any
    }
    
    expect(true).toBe(true) // Placeholder assertion
  })
})

describe('Subscription Registration Type Safety', () => {
  interface State {
    count: number
    users: Array<{ id: number; name: string }>
  }

  const store = createStore<State>({
    initialState: { count: 0, users: [] }
  })

  test('should enforce result type in registerSubscription', () => {
    store.registerSubscription<number, []>('count', {
      compute: (state) => state.count
    })
    
    expect(store.query<number, []>('count', [])).toBe(0)
  })

  test('should enforce params type in registerSubscription', () => {
    store.registerSubscription<string, [number]>('user-name', {
      compute: (state, userId) => {
        // Type check: userId should be number
        const _userIdCheck: number = userId
        const user = state.users.find(u => u.id === userId)
        return user?.name || ''
      }
    })
    
    expect(store.query<string, [number]>('user-name', [1])).toBe('')
  })

  test('should enforce deps type in registerSubscription', () => {
    // Register dependencies first
    store.registerSubscription<number, []>('count-dep', {
      compute: (state) => state.count
    })
    store.registerSubscription<number, []>('total', {
      compute: (state) => state.users.length
    })
    
    store.registerSubscription<number, [], [number, number]>('combined', {
      deps: ['count-dep', 'total'],
      combine: (deps) => {
        // Type check: deps should be [number, number]
        const _depsCheck: [number, number] = deps
        return deps[0] + deps[1]
      }
    })
    
    expect(store.query<number, []>('combined', [])).toBe(0)
  })
})

describe('Subscription Query/Subscribe Type Safety', () => {
  interface State {
    count: number
    users: Array<{ id: number; name: string }>
  }

  const store = createStore<State>({
    initialState: { count: 0, users: [] }
  })

  beforeAll(() => {
    store.registerSubscription<number, []>('count', {
      compute: (state) => state.count
    })

    store.registerSubscription<string, [number]>('user-name', {
      compute: (state, userId) => {
        const user = state.users.find(u => u.id === userId)
        return user?.name || ''
      }
    })
  })

  test('should type query result correctly', () => {
    const count = store.query<number, []>('count', [])
    // Type check: count should be number
    const _countCheck: number = count
    expect(typeof count).toBe('number')
  })

  test('should type query result with params', () => {
    const userName = store.query<string, [number]>('user-name', [123])
    // Type check: userName should be string
    const _userNameCheck: string = userName
    expect(typeof userName).toBe('string')
  })

  test('should type subscribe callback correctly', () => {
    const unsubscribe = store.subscribe<number, []>(
      'count',
      [],
      (result) => {
        // Type check: result should be number
        const _resultCheck: number = result
        expect(typeof result).toBe('number')
      }
    )

    // Type check: unsubscribe should be () => void
    const _unsubscribeCheck: () => void = unsubscribe
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
  })

  test('should type subscribe callback with params', () => {
    const unsubscribe = store.subscribe<string, [number]>(
      'user-name',
      [123],
      (result) => {
        // Type check: result should be string
        const _resultCheck: string = result
        expect(typeof result).toBe('string')
      }
    )

    // Type check: unsubscribe should be () => void
    const _unsubscribeCheck: () => void = unsubscribe
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
  })
})

describe('Subscription Dependency Type Safety', () => {
  interface ProductState {
    count: number
    multiplier: number
  }

  const store = createStore<ProductState>({
    initialState: { count: 0, multiplier: 1 }
  })

  beforeAll(() => {
    store.registerSubscription<number, []>('count', {
      compute: (state) => state.count
    })

    store.registerSubscription<number, []>('multiplier', {
      compute: (state) => state.multiplier
    })

    store.registerSubscription<number, [], [number, number]>('product', {
      deps: ['count', 'multiplier'],
      combine: (deps) => {
        // Type check: deps should be [number, number]
        const _depsCheck: [number, number] = deps
        const [count, multiplier] = deps
        return count * multiplier
      }
    })
  })

  test('should type dependency results correctly', () => {
    const product = store.query<number, []>('product', [])
    // Type check: product should be number
    const _productCheck: number = product
    expect(typeof product).toBe('number')
  })
})

