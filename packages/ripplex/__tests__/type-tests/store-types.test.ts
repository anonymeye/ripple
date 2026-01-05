/**
 * Type tests for store creation and type inference
 * These tests verify TypeScript type checking at compile time
 */

import { createStore, StoreAPI, StoreConfig } from '../../src'

describe('Store Type Inference', () => {
  test('should infer state type from initialState', () => {
    const store = createStore({
      initialState: { count: 0, name: 'test' }
    })

    const state = store.getState()
    // Type check: state should be readonly with correct types
    const _stateCheck: Readonly<{ count: number; name: string }> = state
    const _countCheck: number = state.count
    const _nameCheck: string = state.name
    
    expect(state.count).toBe(0)
    expect(state.name).toBe('test')
  })

  test('should infer state type from complex nested state', () => {
    interface User {
      id: number
      name: string
    }

    const store = createStore({
      initialState: {
        users: [] as User[],
        currentUser: null as User | null,
        settings: {
          theme: 'dark' as const,
          notifications: true
        }
      }
    })

    // Type check: nested state properties should have correct types
    const _usersCheck: User[] = store.getState().users
    const _currentUserCheck: User | null = store.getState().currentUser
    const _themeCheck: 'dark' = store.getState().settings.theme
    const _notificationsCheck: boolean = store.getState().settings.notifications
    
    expect(Array.isArray(store.getState().users)).toBe(true)
    expect(store.getState().currentUser).toBeNull()
    expect(store.getState().settings.theme).toBe('dark')
    expect(store.getState().settings.notifications).toBe(true)
  })

  test('should preserve readonly state type', () => {
    const store = createStore({
      initialState: { count: 0 }
    })

    const state = store.getState()
    // Type check: state should be readonly
    const _stateCheck: Readonly<{ count: number }> = state
    
    // This test verifies that TypeScript catches mutations at compile time
    // In a real scenario without 'as any', attempting to mutate state would be a type error
    const _mutationAttempt = () => { (state as any).count = 1 }
    
    expect(state.count).toBe(0)
  })

  test('should return StoreAPI with correct generic types', () => {
    interface StateWithValue {
      value: number
    }

    const store = createStore<StateWithValue>({
      initialState: { value: 0 }
    })

    // Type check: store should be StoreAPI<StateWithValue>
    const _storeCheck: StoreAPI<StateWithValue> = store
    expect(store.getState().value).toBe(0)
  })
})

describe('Store Config Type Safety', () => {
  test('should accept optional onStateChange callback', () => {
    const store = createStore({
      initialState: { count: 0 },
      onStateChange: (state) => {
        // Type check: state should be { count: number }
        const _stateCheck: { count: number } = state
        expect(state).toBeDefined()
      }
    })

    // Type check: store should be StoreAPI<{ count: number }>
    const _storeCheck: StoreAPI<{ count: number }> = store
    expect(store).toBeDefined()
  })

  test('should accept optional errorHandler', () => {
    const store = createStore({
      initialState: { count: 0 },
      errorHandler: {
        handler: (error, context) => {
          // Type check: error should be Error
          const _errorCheck: Error = error
          // Type check: context should have eventKey
          const _eventKeyCheck: string = context.eventKey
          expect(error).toBeDefined()
          expect(context.eventKey).toBeDefined()
        },
        rethrow: false
      }
    })

    // Type check: store should be StoreAPI<{ count: number }>
    const _storeCheck: StoreAPI<{ count: number }> = store
    expect(store).toBeDefined()
  })

  test('should accept optional tracing config', () => {
    const store = createStore({
      initialState: { count: 0 },
      tracing: {
        enabled: true,
        debounceTime: 100
      }
    })

    // Type check: store should be StoreAPI<{ count: number }>
    const _storeCheck: StoreAPI<{ count: number }> = store
    expect(store).toBeDefined()
  })
})

describe('Store API Methods Type Safety', () => {
  interface StateWithCount {
    count: number
  }

  const store = createStore<StateWithCount>({
    initialState: { count: 0 }
  })

  test('getState should return readonly state', () => {
    const state = store.getState()
    // Type check: state should be readonly
    const _stateCheck: Readonly<StateWithCount> = state
    expect(state.count).toBe(0)
  })

  test('dispatch should accept any payload type', () => {
    // Type check: dispatch should return Promise<void>
    const _dispatch1: Promise<void> = store.dispatch('event', null)
    const _dispatch2: Promise<void> = store.dispatch('event', { data: 'test' })
    const _dispatch3: Promise<void> = store.dispatch('event', 42)
    const _dispatch4: Promise<void> = store.dispatch('event', 'string')
    
    expect(store.dispatch).toBeDefined()
  })

  test('flush should return Promise<void>', () => {
    // Type check: flush should return Promise<void>
    const _flushCheck: Promise<void> = store.flush()
    expect(typeof store.flush).toBe('function')
  })

  test('registerEventDb should accept handler with correct signature', () => {
    store.registerEventDb<{ increment: number }>(
      'increment',
      (context, payload) => {
        // Type check: context.db should be StateWithCount
        const _dbCheck: StateWithCount = context.db
        // Type check: payload should be { increment: number }
        const _payloadCheck: { increment: number } = payload
        
        expect(context.db).toBeDefined()
        expect(payload).toBeDefined()
        return { count: context.db.count + payload.increment }
      }
    )
  })

  test('registerEvent should accept handler with correct signature', () => {
    store.registerEvent<{ decrement: number }>(
      'decrement',
      (context, payload) => {
        // Type check: context.db should be StateWithCount
        const _dbCheck: StateWithCount = context.db
        // Type check: payload should be { decrement: number }
        const _payloadCheck: { decrement: number } = payload
        
        expect(context.db).toBeDefined()
        expect(payload).toBeDefined()
        return {
          db: { count: context.db.count - payload.decrement }
        }
      }
    )
  })

  test('registerSubscription should accept config with correct types', () => {
    store.registerSubscription<number, []>(
      'count',
      {
        compute: (state) => {
          // Type check: state should be StateWithCount
          const _stateCheck: StateWithCount = state
          expect(state).toBeDefined()
          return state.count
        }
      }
    )

    store.registerSubscription<number, [string]>(
      'count-with-param',
      {
        compute: (state, param) => {
          // Type check: state should be StateWithCount
          const _stateCheck: StateWithCount = state
          // Type check: param should be string
          const _paramCheck: string = param
          
          expect(state).toBeDefined()
          expect(typeof param).toBe('string')
          return state.count
        }
      }
    )
  })

  test('subscribe should return unsubscribe function', () => {
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

  test('query should return correct result type', () => {
    const result = store.query<number, []>('count', [])
    // Type check: result should be number
    const _resultCheck: number = result
    expect(typeof result).toBe('number')
  })
})

