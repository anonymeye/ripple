# Subscriptions

Subscriptions are computed values derived from state. They provide a reactive way to derive and subscribe to state changes, similar to re-frame's subscription system.

## Overview

Subscriptions allow you to:
- Derive computed values from state
- Compose subscriptions from other subscriptions
- Subscribe to changes and get notified when values change
- Query values once without subscribing
- Share subscription instances for efficient memoization (useful for React)

## Core Concepts

### Subscription Types

There are two ways to define subscriptions:

1. **Compute Function** - Directly compute a value from state
2. **Dependent Subscriptions** - Combine values from other subscriptions

### Subscription Instances

Each unique `key + params` combination gets a shared `Subscription` object. This enables:
- Efficient memoization in React
- Automatic cleanup when no longer referenced
- Result caching per subscription instance

## API

### `registerSubscription<Result, Params, Deps>(key, config)`

Register a subscription definition.

**Type Parameters:**
- `Result` - The type of the subscription result
- `Params` - The type of parameters array (defaults to `[]`)
- `Deps` - The type of dependent subscription results array (defaults to `any[]`)

**Parameters:**
- `key` - String identifier for the subscription
- `config` - Subscription configuration
  - `compute` - Function `(state: State, ...params: Params) => Result`
  - `deps` - Array of subscription keys this subscription depends on
  - `combine` - Function `(deps: Deps, ...params: Params) => Result`

**Example (Compute Function):**
```typescript
store.registerSubscription('todos/count', {
  compute: (state) => state.todos.length
})
```

**Example (Dependent Subscriptions):**
```typescript
store.registerSubscription('todos/active', {
  deps: ['todos/count', 'todos/filter'],
  combine: ([count, filter], filterValue) => {
    if (filter === 'active') {
      return count
    }
    return 0
  }
})
```

### `subscribe<Result, Params>(key, params, callback)`

Subscribe to state changes via a subscription. The callback is invoked whenever the subscription value changes.

**Type Parameters:**
- `Result` - The type of the subscription result
- `Params` - The type of parameters array

**Parameters:**
- `key` - String identifier for the subscription
- `params` - Parameters to pass to the subscription
- `callback` - Function called with the new subscription value

**Returns:** Unsubscribe function

**Example:**
```typescript
const unsubscribe = store.subscribe('todos/count', [], (count) => {
  console.log('Todo count changed:', count)
})

// Later, to unsubscribe:
unsubscribe()
```

### `query<Result, Params>(key, params)`

Query a subscription once without subscribing to changes.

**Type Parameters:**
- `Result` - The type of the subscription result
- `Params` - The type of parameters array

**Parameters:**
- `key` - String identifier for the subscription
- `params` - Parameters to pass to the subscription

**Returns:** The current subscription value

**Example:**
```typescript
const count = store.query('todos/count', [])
console.log('Current todo count:', count)
```

### `getSubscription<Result, Params>(key, params)`

Get or create a shared `Subscription` object for the given key and params. Returns the same object for the same key+params, which is useful for React memoization.

**Type Parameters:**
- `Result` - The type of the subscription result
- `Params` - The type of parameters array

**Parameters:**
- `key` - String identifier for the subscription
- `params` - Parameters to pass to the subscription

**Returns:** `Subscription<State, Result, Params>`

**Example:**
```typescript
const subscription = store.getSubscription('todos/count', [])
// Same object is returned for same key+params
const sameSubscription = store.getSubscription('todos/count', [])
console.log(subscription === sameSubscription) // true
```

## Examples

### Simple Compute Subscription

```typescript
// Register
store.registerSubscription('user/name', {
  compute: (state) => state.user?.name || 'Guest'
})

// Subscribe
store.subscribe('user/name', [], (name) => {
  console.log('User name:', name)
})

// Query
const name = store.query('user/name', [])
```

### Parameterized Subscription

```typescript
// Register
store.registerSubscription('todo/by-id', {
  compute: (state, id: string) => {
    return state.todos.find(todo => todo.id === id)
  }
})

// Subscribe with params
store.subscribe('todo/by-id', ['todo-123'], (todo) => {
  console.log('Todo:', todo)
})

// Query with params
const todo = store.query('todo/by-id', ['todo-123'])
```

### Dependent Subscriptions

```typescript
// Base subscriptions
store.registerSubscription('todos/all', {
  compute: (state) => state.todos
})

store.registerSubscription('todos/filter', {
  compute: (state) => state.filter
})

// Dependent subscription
store.registerSubscription('todos/filtered', {
  deps: ['todos/all', 'todos/filter'],
  combine: ([todos, filter]) => {
    if (filter === 'all') {
      return todos
    }
    return todos.filter(todo => {
      if (filter === 'active') return !todo.completed
      if (filter === 'completed') return todo.completed
      return true
    })
  }
})

// Subscribe to filtered todos
store.subscribe('todos/filtered', [], (filteredTodos) => {
  console.log('Filtered todos:', filteredTodos)
})
```

### Complex Dependent Subscription

```typescript
store.registerSubscription('todos/stats', {
  deps: ['todos/all'],
  combine: ([todos]) => {
    return {
      total: todos.length,
      active: todos.filter(t => !t.completed).length,
      completed: todos.filter(t => t.completed).length
    }
  }
})

store.subscribe('todos/stats', [], (stats) => {
  console.log('Stats:', stats)
  // { total: 10, active: 7, completed: 3 }
})
```


## Change Detection

Subscriptions automatically detect when values change and notify subscribers. The comparison uses deep equality checking to determine if a value has changed.

## Error Handling

If a subscription computation throws an error:

1. The error is caught and passed to the error handler
2. The cached result (if available) is returned
3. Subscribers are not notified
4. The error is logged (if no error handler is registered)

**Example:**
```typescript
store.registerSubscription('todos/count', {
  compute: (state) => {
    // If state.todos is undefined, this will throw
    return state.todos.length
  }
})

// Error is handled gracefully
const count = store.query('todos/count', []) // Returns undefined if error occurred
```

## Best Practices

1. **Use descriptive keys** - Use namespaced keys like `todos/count`, `user/profile`
2. **Keep compute functions pure** - They should be deterministic functions of state
3. **Use dependent subscriptions** - Compose subscriptions from other subscriptions
4. **Memoize expensive computations** - The subscription system caches results automatically
5. **Unsubscribe when done** - Always call the unsubscribe function to prevent memory leaks
6. **Use `query` for one-time reads** - Don't subscribe if you only need the value once
7. **Use `getSubscription` for React** - Helps with React memoization

## React Integration

The `getSubscription` method is particularly useful for React integration:

```typescript
// In a React hook
function useStoreState<Result, Params extends any[]>(
  key: string,
  params: Params
): Result {
  const store = useStore()
  const [result, setResult] = useState(() => store.query<Result, Params>(key, params))
  
  useEffect(() => {
    return store.subscribe<Result, Params>(key, params, setResult)
  }, [store, key, ...params])
  
  return result
}
```

The shared `Subscription` object returned by `getSubscription` can be used as a dependency in `useMemo` or `React.memo` for efficient memoization.

## Performance Considerations

1. **Result Caching** - Results are cached per subscription instance, so repeated queries are fast
2. **Change Detection** - Only subscribers are notified when values actually change
3. **Automatic Cleanup** - Unused subscription instances are automatically cleaned up
4. **Parallel Computation** - Dependent subscriptions are computed in the correct order

## Common Patterns

### Filtered List

```typescript
store.registerSubscription('todos/active', {
  compute: (state) => state.todos.filter(t => !t.completed)
})
```

### Sorted List

```typescript
store.registerSubscription('todos/sorted', {
  compute: (state) => {
    return [...state.todos].sort((a, b) => {
      return b.createdAt - a.createdAt
    })
  }
})
```

### Aggregations

```typescript
store.registerSubscription('todos/summary', {
  compute: (state) => {
    const todos = state.todos
    return {
      total: todos.length,
      completed: todos.filter(t => t.completed).length,
      active: todos.filter(t => !t.completed).length
    }
  }
})
```

### Lookups

```typescript
store.registerSubscription('todo/by-id', {
  compute: (state, id: string) => {
    return state.todos.find(t => t.id === id)
  }
})
```

