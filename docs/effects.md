# Effects

The Effects module handles effect execution and provides built-in effects. Effects are side effects that can be triggered by event handlers, such as dispatching other events, making HTTP requests, or updating localStorage.

## Overview

Effects are the mechanism for performing side effects in Ripple. When an event handler returns an effects map, effects are processed in a specific order:

1. **`:db` effect** - Executes first (synchronously) to update state
2. **Other effects** - Execute in parallel (asynchronously)
3. **`:fx` meta-effect** - Executes last (sequentially)

## Built-in Effects

### `:db` - State Update

Updates the application state. This effect executes first, before all other effects.

**Config:** The new state value

**Example:**
```typescript
store.registerEvent('update-state', (context, newState) => {
  return {
    db: newState  // Updates state immediately
  }
})
```

### `:dispatch` - Dispatch Single Event

Dispatches a single event. The dispatch is queued and processed after the current event completes.

**Config:**
```typescript
{
  event: string
  payload: any
}
```

**Example:**
```typescript
store.registerEvent('save-todo', (context, todo) => {
  return {
    db: { ...context.db, todos: [...context.db.todos, todo] },
    dispatch: {
      event: 'todo-saved',
      payload: { id: todo.id }
    }
  }
})
```

### `:dispatch-n` - Dispatch Multiple Events

Dispatches multiple events. All events are queued and processed sequentially.

**Config:** Array of event configs
```typescript
Array<{
  event: string
  payload: any
}>
```

**Example:**
```typescript
store.registerEvent('initialize', (context) => {
  return {
    dispatch-n: [
      { event: 'load-users', payload: {} },
      { event: 'load-settings', payload: {} },
      { event: 'load-preferences', payload: {} }
    ]
  }
})
```

### `:dispatch-later` - Delayed Event Dispatch

Dispatches events after specified delays.

**Config:** Array of delayed event configs
```typescript
Array<{
  ms: number      // Delay in milliseconds
  event: string
  payload: any
}>
```

**Example:**
```typescript
store.registerEvent('show-notification', (context, message) => {
  return {
    db: { ...context.db, notification: message },
    'dispatch-later': [
      {
        ms: 3000,
        event: 'hide-notification',
        payload: {}
      }
    ]
  }
})
```

### `:fx` - Meta-Effect

Executes multiple effects from a collection of `[effect-key, effect-value]` tuples. Effects execute sequentially in order. `null` entries are ignored (useful for conditional effects).

**Config:** Array of effect tuples
```typescript
Array<[string, any] | null>
```

**Example:**
```typescript
store.registerEvent('complex-action', (context, data) => {
  return {
    db: { ...context.db, data },
    fx: [
      ['http', { url: '/api/save', method: 'POST', body: data }],
      data.shouldNotify ? ['dispatch', { event: 'notify', payload: {} }] : null,
      ['localStorage', { key: 'last-save', value: Date.now() }]
    ]
  }
})
```

**Note:** The `:fx` effect should not contain a `:db` effect. Use the top-level `:db` effect instead.

### `:deregister-event-handler` - Dynamic Handler Removal

Removes event handlers dynamically. Useful for cleanup or conditional handler registration.

**Config:** String or array of strings (event keys)

**Example:**
```typescript
store.registerEvent('cleanup', (context) => {
  return {
    'deregister-event-handler': ['temp-handler-1', 'temp-handler-2']
  }
})
```

## Custom Effects

You can register custom effects using `registerEffect`.

### Registering a Custom Effect

```typescript
store.registerEffect('http', async (config, store) => {
  const { url, method = 'GET', body, headers } = config
  
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  })
  
  if (!response.ok) {
    await store.dispatch('http-error', { url, status: response.status })
    return
  }
  
  const data = await response.json()
  await store.dispatch('http-success', { url, data })
})
```

### Using a Custom Effect

```typescript
store.registerEvent('fetch-user', (context, userId) => {
  return {
    http: {
      url: `/api/users/${userId}`,
      method: 'GET'
    }
  }
})
```

## Effect Execution Order

Effects execute in a specific order:

1. **`:db` effect** - Executes first, synchronously
2. **All other effects** (except `:fx`) - Execute in parallel
3. **`:fx` meta-effect** - Executes last, sequentially

This ensures:
- State updates happen before side effects
- Side effects can run in parallel for performance
- The `:fx` meta-effect can coordinate multiple effects sequentially


## Error Handling

If an effect handler throws an error:

1. The error is caught and passed to the error handler
2. Other effects continue to execute (they run in parallel)
3. An error trace is recorded (if tracing is enabled)
4. The error does not prevent state updates (`:db` already executed)

**Example:**
```typescript
store.registerEffect('http', async (config, store) => {
  try {
    const response = await fetch(config.url)
    // ...
  } catch (error) {
    // Error is automatically handled by the error handler
    // Other effects will still execute
    throw error
  }
})
```

## Best Practices

1. **Use `:db` for state updates** - It's the primary way to update state
2. **Use `:dispatch` for simple event chaining** - When you need to trigger one follow-up event
3. **Use `:dispatch-n` for multiple events** - When you need to trigger several events
4. **Use `:fx` for sequential effects** - When effects must execute in order
5. **Register custom effects for reusable side effects** - HTTP requests, localStorage, etc.
6. **Handle errors in custom effects** - Throw errors to let the error handler process them
7. **Avoid `:db` in `:fx`** - Use top-level `:db` instead

## Common Patterns

### HTTP Request Effect

```typescript
store.registerEffect('http', async (config, store) => {
  const response = await fetch(config.url, config.options)
  const data = await response.json()
  
  if (response.ok) {
    await store.dispatch(config.onSuccess, data)
  } else {
    await store.dispatch(config.onError, { status: response.status, data })
  }
})
```

### LocalStorage Effect

```typescript
store.registerEffect('localStorage', (config, store) => {
  if (config.value === undefined) {
    // Read
    const value = localStorage.getItem(config.key)
    store.dispatch(config.onRead, { key: config.key, value })
  } else {
    // Write
    localStorage.setItem(config.key, JSON.stringify(config.value))
  }
})
```

### Debounced Effect

```typescript
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

store.registerEffect('debounced-dispatch', (config, store) => {
  const { key, event, payload, ms } = config
  
  // Clear existing timer
  if (debounceTimers.has(key)) {
    clearTimeout(debounceTimers.get(key)!)
  }
  
  // Set new timer
  const timer = setTimeout(() => {
    debounceTimers.delete(key)
    store.dispatch(event, payload)
  }, ms)
  
  debounceTimers.set(key, timer)
})
```

## Type Safety

You can extend the `EffectMap` interface to add type-safe custom effects:

```typescript
declare module '@rplx/core' {
  interface EffectMap {
    'http'?: {
      url: string
      method?: string
      body?: any
      onSuccess?: string
      onError?: string
    }
    'localStorage'?: {
      key: string
      value?: any
      onRead?: string
    }
  }
}
```

This provides full type checking when using your custom effects in event handlers.

