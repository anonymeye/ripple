# Tracing

The Tracing module provides event tracing and debugging capabilities. It collects detailed information about event execution, including state changes, interceptor chains, and effect execution.

## Overview

The Tracing module is responsible for:
- Collecting event traces with detailed execution information
- Debouncing trace delivery for performance
- Supporting multiple trace callbacks
- Providing debugging information for development tools

## Configuration

Tracing is configured when creating the store:

```typescript
const store = createStore({
  initialState: {},
  tracing: {
    enabled: true,           // Enable tracing (default: false)
    debounceTime: 50        // Debounce time in ms (default: 50)
  }
})
```

## API

### `registerTraceCallback(key, callback)`

Register a callback to receive event traces. Traces are delivered in batches (debounced).

**Parameters:**
- `key` - Unique identifier for the callback
- `callback` - Function that receives batches of traces

**Example:**
```typescript
store.registerTraceCallback('devtools', (traces) => {
  console.log('Event traces:', traces)
  // Send to devtools extension
  devtoolsExtension.sendTraces(traces)
})
```

### `removeTraceCallback(key)`

Remove a trace callback.

**Parameters:**
- `key` - Unique identifier for the callback to remove

**Example:**
```typescript
store.removeTraceCallback('devtools')
```

## Event Trace Structure

Each event trace contains detailed information about event execution:

```typescript
interface EventTrace<State> {
  id: number                    // Unique trace ID (auto-generated)
  eventKey: string              // Event key
  payload: any                  // Event payload
  timestamp: number             // Event timestamp (ms)
  stateBefore: State            // State before event
  stateAfter: State             // State after event
  interceptors: Array<{        // Interceptor chain
    id?: string
    order: number
  }>
  effectMap: EffectMap         // Effects returned by handler
  effectsExecuted: Array<{     // Effects that were executed
    effectType: string
    config: any
    start: number
    end: number
    duration: number
    error?: Error
  }>
  duration: number              // Total event duration (ms)
  error?: Error                 // Error if event failed
}
```

## Trace Delivery

Traces are delivered in batches with debouncing to ensure optimal performance. Multiple events result in one callback invocation, and traces are delivered within the configured debounce time (default: 50ms).

## Usage Examples

### Basic Tracing

```typescript
const store = createStore({
  initialState: {},
  tracing: {
    enabled: true
  }
})

store.registerTraceCallback('console', (traces) => {
  traces.forEach(trace => {
    console.log(`Event: ${trace.eventKey}`, {
      duration: trace.duration,
      stateChange: trace.stateBefore !== trace.stateAfter
    })
  })
})
```

### DevTools Integration

```typescript
store.registerTraceCallback('devtools', (traces) => {
  // Send to Redux DevTools or similar
  traces.forEach(trace => {
    window.__REDUX_DEVTOOLS_EXTENSION__.send({
      type: trace.eventKey,
      payload: trace.payload,
      state: trace.stateAfter,
      timestamp: trace.timestamp
    }, trace.stateAfter)
  })
})
```

### Performance Monitoring

```typescript
store.registerTraceCallback('performance', (traces) => {
  traces.forEach(trace => {
    if (trace.duration > 100) {
      // Log slow events
      performanceMonitor.logSlowEvent({
        eventKey: trace.eventKey,
        duration: trace.duration
      })
    }
  })
})
```

### Error Tracking

```typescript
store.registerTraceCallback('errors', (traces) => {
  traces
    .filter(trace => trace.error)
    .forEach(trace => {
      errorTrackingService.captureException(trace.error!, {
        tags: {
          eventKey: trace.eventKey
        },
        extra: {
          payload: trace.payload,
          stateBefore: trace.stateBefore,
          stateAfter: trace.stateAfter
        }
      })
    })
})
```

## Effect Execution Traces

Each trace includes information about effects that were executed:

```typescript
interface EffectExecutionTrace {
  effectType: string      // Effect type (e.g., 'db', 'dispatch', 'http')
  config: any             // Effect configuration
  start: number           // Start time (ms)
  end: number             // End time (ms)
  duration: number        // Duration (ms)
  error?: Error           // Error if effect failed
}
```

**Example:**
```typescript
store.registerTraceCallback('effects', (traces) => {
  traces.forEach(trace => {
    trace.effectsExecuted.forEach(effect => {
      console.log(`Effect: ${effect.effectType}`, {
        duration: effect.duration,
        success: !effect.error
      })
    })
  })
})
```

## Interceptor Chain Information

Traces include information about the interceptor chain:

```typescript
trace.interceptors.forEach(interceptor => {
  console.log(`Interceptor ${interceptor.order}: ${interceptor.id}`)
})
```

## Best Practices

1. **Enable tracing in development** - Use tracing to debug and understand event flow
2. **Disable in production** - Tracing has performance overhead
3. **Use multiple callbacks** - Different callbacks for different purposes (devtools, logging, monitoring)
4. **Filter traces** - Only process traces you need (e.g., filter by event key)
5. **Handle errors in callbacks** - Errors in trace callbacks are caught and logged


## Debugging with Traces

Traces provide comprehensive debugging information:

```typescript
store.registerTraceCallback('debug', (traces) => {
  traces.forEach(trace => {
    console.group(`Event: ${trace.eventKey}`)
    console.log('Payload:', trace.payload)
    console.log('State Before:', trace.stateBefore)
    console.log('State After:', trace.stateAfter)
    console.log('Interceptors:', trace.interceptors)
    console.log('Effects:', trace.effectMap)
    console.log('Effects Executed:', trace.effectsExecuted)
    console.log('Duration:', trace.duration, 'ms')
    if (trace.error) {
      console.error('Error:', trace.error)
    }
    console.groupEnd()
  })
})
```

## Integration with DevTools

Traces can be integrated with browser devtools:

```typescript
// Redux DevTools integration
store.registerTraceCallback('redux-devtools', (traces) => {
  const devTools = window.__REDUX_DEVTOOLS_EXTENSION__
  if (!devTools) return
  
  traces.forEach(trace => {
    devTools.send(
      { type: trace.eventKey, payload: trace.payload },
      trace.stateAfter
    )
  })
})

// Custom devtools
store.registerTraceCallback('custom-devtools', (traces) => {
  window.postMessage({
    type: 'RIPPLE_TRACES',
    traces
  }, '*')
})
```

## Testing

In tests, you can use traces to verify event execution:

```typescript
const traces: EventTrace[] = []

store.registerTraceCallback('test', (batch) => {
  traces.push(...batch)
})

await store.dispatch('test-event', {})

expect(traces).toHaveLength(1)
expect(traces[0].eventKey).toBe('test-event')
expect(traces[0].stateAfter).toEqual(expectedState)
```

## Performance Considerations

Tracing adds some performance overhead due to state snapshots and timing collection. Traces are held in memory until delivered and are debounced to reduce callback invocations. Only traces from the period when tracing is enabled are collected.

## Disabling Tracing

To disable tracing, either:

1. Don't enable it in store config
2. Remove all trace callbacks
3. Set `enabled: false` in config

```typescript
const store = createStore({
  initialState: {},
  tracing: {
    enabled: false  // Tracing disabled
  }
})
```

