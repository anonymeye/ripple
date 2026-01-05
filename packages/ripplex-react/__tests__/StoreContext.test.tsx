/**
 * Tests for StoreContext and StoreProvider
 * Tests store provider functionality and useStore hook
 */

import React from 'react'
import { render, screen, act, waitFor } from '@testing-library/react'
import { createStore } from '@rplx/core'
import { StoreProvider, useStore, useStoreState } from '../src'

describe('StoreContext', () => {
  describe('StoreProvider', () => {
    it('should provide store to children', () => {
      const initialState = { count: 0 }
      const store = createStore({ initialState })

      function TestComponent() {
        const state = useStoreState<typeof initialState>()
        return <div data-testid="count">{state.count}</div>
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByTestId('count')).toHaveTextContent('0')
    })

    it('should allow nested providers with different stores', () => {
      const store1 = createStore({ initialState: { count: 1 } })
      const store2 = createStore({ initialState: { count: 2 } })

      function InnerComponent() {
        const state = useStoreState<{ count: number }>()
        return <div data-testid="inner">{state.count}</div>
      }

      function OuterComponent() {
        const state = useStoreState<{ count: number }>()
        return (
          <div>
            <div data-testid="outer">{state.count}</div>
            <StoreProvider store={store2}>
              <InnerComponent />
            </StoreProvider>
          </div>
        )
      }

      render(
        <StoreProvider store={store1}>
          <OuterComponent />
        </StoreProvider>
      )

      expect(screen.getByTestId('outer')).toHaveTextContent('1')
      expect(screen.getByTestId('inner')).toHaveTextContent('2')
    })

    it('should update when store prop changes', async () => {
      const store1 = createStore({ initialState: { count: 1 } })
      const store2 = createStore({ initialState: { count: 2 } })

      function TestComponent() {
        const state = useStoreState<{ count: number }>()
        return <div data-testid="count">{state.count}</div>
      }

      const { rerender } = render(
        <StoreProvider store={store1}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByTestId('count')).toHaveTextContent('1')

      rerender(
        <StoreProvider store={store2}>
          <TestComponent />
        </StoreProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('2')
      })
    })

    it('should handle state changes from store', async () => {
      const initialState = { count: 0 }
      const store = createStore({ initialState })

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      function TestComponent() {
        const state = useStoreState<typeof initialState>()
        return <div data-testid="count">{state.count}</div>
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByTestId('count')).toHaveTextContent('0')

      await act(async () => {
        await store.dispatch('increment', null)
      })

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('1')
      })
    })

    it('should handle multiple subscribers', async () => {
      const initialState = { count: 0 }
      const store = createStore({ initialState })

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      function Counter1() {
        const state = useStoreState<typeof initialState>()
        return <div data-testid="counter1">{state.count}</div>
      }

      function Counter2() {
        const state = useStoreState<typeof initialState>()
        return <div data-testid="counter2">{state.count}</div>
      }

      render(
        <StoreProvider store={store}>
          <Counter1 />
          <Counter2 />
        </StoreProvider>
      )

      expect(screen.getByTestId('counter1')).toHaveTextContent('0')
      expect(screen.getByTestId('counter2')).toHaveTextContent('0')

      await act(async () => {
        await store.dispatch('increment', null)
      })

      await waitFor(() => {
        expect(screen.getByTestId('counter1')).toHaveTextContent('1')
        expect(screen.getByTestId('counter2')).toHaveTextContent('1')
      })
    })

    it('should clean up subscriptions when provider unmounts', async () => {
      const initialState = { count: 0 }
      const store = createStore({ initialState })

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      function TestComponent() {
        const state = useStoreState<typeof initialState>()
        return <div data-testid="count">{state.count}</div>
      }

      const { unmount } = render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByTestId('count')).toHaveTextContent('0')

      unmount()

      // Dispatch after unmount - should not cause errors
      await act(async () => {
        await store.dispatch('increment', null)
      })

      // No assertions needed - just verify no errors occurred
    })
  })

  describe('useStore', () => {
    it('should return the store instance', () => {
      const initialState = { count: 0 }
      const store = createStore({ initialState })

      function TestComponent() {
        const storeInstance = useStore<typeof initialState>()
        const state = storeInstance.getState()
        return <div data-testid="count">{state.count}</div>
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByTestId('count')).toHaveTextContent('0')
    })

    it('should allow direct store access', async () => {
      const initialState = { count: 0 }
      const store = createStore({ initialState })

      // Register the subscription that StoreProvider uses
      store.registerSubscription('__ripple_react_state_tracker__', {
        compute: (state: typeof initialState) => state
      })

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      function TestComponent() {
        const storeInstance = useStore<typeof initialState>()
        const [count, setCount] = React.useState(storeInstance.getState().count)

        React.useEffect(() => {
          const unsubscribe = storeInstance.subscribe('__ripple_react_state_tracker__', [], (newState) => {
            if (newState) {
              setCount(newState.count)
            }
          })
          return unsubscribe
        }, [storeInstance])

        return <div data-testid="count">{count}</div>
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByTestId('count')).toHaveTextContent('0')

      await act(async () => {
        await store.dispatch('increment', null)
      })

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('1')
      })
    })

    it('should throw error when used outside StoreProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      function TestComponent() {
        useStore()
        return <div>Test</div>
      }

      expect(() => {
        render(<TestComponent />)
      }).toThrow('useStore must be used within a StoreProvider')

      consoleSpy.mockRestore()
    })

    it('should return the same store reference', () => {
      const initialState = { count: 0 }
      const store = createStore({ initialState })

      const storeRefs: any[] = []

      function TestComponent() {
        const storeInstance = useStore<typeof initialState>()

        React.useEffect(() => {
          storeRefs.push(storeInstance)
        })

        return <div>Test</div>
      }

      const { rerender } = render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      const firstStore = storeRefs[0]

      rerender(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      // Store reference should be the same
      expect(storeRefs[storeRefs.length - 1]).toBe(firstStore)
    })
  })

  describe('Context Updates', () => {
    it('should propagate state changes to all subscribers', async () => {
      const initialState = { count: 0 }
      const store = createStore({ initialState })

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      const subscriber1 = jest.fn()
      const subscriber2 = jest.fn()

      function Component1() {
        const state = useStoreState<typeof initialState>()
        React.useEffect(() => {
          subscriber1(state)
        }, [state])
        return <div data-testid="comp1">{state.count}</div>
      }

      function Component2() {
        const state = useStoreState<typeof initialState>()
        React.useEffect(() => {
          subscriber2(state)
        }, [state])
        return <div data-testid="comp2">{state.count}</div>
      }

      render(
        <StoreProvider store={store}>
          <Component1 />
          <Component2 />
        </StoreProvider>
      )

      expect(subscriber1).toHaveBeenCalledWith({ count: 0 })
      expect(subscriber2).toHaveBeenCalledWith({ count: 0 })

      await act(async () => {
        await store.dispatch('increment', null)
      })

      await waitFor(() => {
        expect(subscriber1).toHaveBeenCalledWith({ count: 1 })
        expect(subscriber2).toHaveBeenCalledWith({ count: 1 })
      })
    })

    it('should handle errors in subscriber callbacks gracefully', async () => {
      const initialState = { count: 0 }
      const store = createStore({ initialState })

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      // Use ErrorBoundary to catch rendering errors
      class ErrorBoundary extends React.Component<
        { children: React.ReactNode },
        { hasError: boolean }
      > {
        constructor(props: { children: React.ReactNode }) {
          super(props)
          this.state = { hasError: false }
        }

        static getDerivedStateFromError() {
          return { hasError: true }
        }

        componentDidCatch(error: Error) {
          // Error is caught, component2 should still render
        }

        render() {
          if (this.state.hasError) {
            return <div data-testid="error-boundary">Error caught</div>
          }
          return this.props.children
        }
      }

      function Component1() {
        const state = useStoreState<typeof initialState>()
        // This will cause an error when state changes
        if (state.count > 0) {
          throw new Error('Test error')
        }
        return <div data-testid="comp1">{state.count}</div>
      }

      function Component2() {
        const state = useStoreState<typeof initialState>()
        return <div data-testid="comp2">{state.count}</div>
      }

      render(
        <StoreProvider store={store}>
          <ErrorBoundary>
            <Component1 />
          </ErrorBoundary>
          <Component2 />
        </StoreProvider>
      )

      expect(screen.getByTestId('comp1')).toHaveTextContent('0')
      expect(screen.getByTestId('comp2')).toHaveTextContent('0')

      // Component2 should still work even if Component1 errors
      await act(async () => {
        await store.dispatch('increment', null)
      })

      // Component1 should show error boundary, Component2 should have updated
      await waitFor(() => {
        expect(screen.getByTestId('error-boundary')).toBeInTheDocument()
        expect(screen.getByTestId('comp2')).toHaveTextContent('1')
      })

      consoleErrorSpy.mockRestore()
    })
  })
})

