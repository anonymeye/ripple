/**
 * Tests for useDispatch hook
 * Tests dispatch function memoization and usage
 */

import React from 'react'
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react'
import { createStore } from '@rplx/core'
import { StoreProvider, useDispatch, useStoreState } from '../../src'

describe('useDispatch', () => {
  describe('Dispatch Function', () => {
    it('should return a dispatch function', () => {
      const store = createStore({ initialState: { count: 0 } })

      function TestComponent() {
        const dispatch = useDispatch()
        return (
          <button onClick={() => dispatch('increment', null)}>
            Increment
          </button>
        )
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByText('Increment')).toBeInTheDocument()
    })

    it('should dispatch events correctly', async () => {
      const initialState = { count: 0 }
      const store = createStore({ initialState })

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      function TestComponent() {
        const dispatch = useDispatch()
        const state = useStoreState<typeof initialState>()

        return (
          <div>
            <div data-testid="count">{state.count}</div>
            <button onClick={() => dispatch('increment', null)}>
              Increment
            </button>
          </div>
        )
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByTestId('count')).toHaveTextContent('0')

      await act(async () => {
        const button = screen.getByText('Increment')
        fireEvent.click(button)
        // Wait for dispatch to complete and state to update
        await store.flush()
        // Wait for requestAnimationFrame to execute
        await new Promise(resolve => requestAnimationFrame(resolve))
      })

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('1')
      })
    })

    it('should dispatch events with payload', async () => {
      interface State {
        items: string[]
      }

      const initialState: State = { items: [] }
      const store = createStore({ initialState })

      store.registerEventDb('add-item', (context, payload: string) => {
        return { ...context.db, items: [...context.db.items, payload] }
      })

      function TestComponent() {
        const dispatch = useDispatch<string>()
        const state = useStoreState<State>()

        return (
          <div>
            <div data-testid="items">{state.items.join(',')}</div>
            <button onClick={() => dispatch('add-item', 'item1')}>
              Add Item
            </button>
          </div>
        )
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByTestId('items')).toHaveTextContent('')

      await act(async () => {
        const button = screen.getByText('Add Item')
        fireEvent.click(button)
        // Wait for dispatch to complete and state to update
        await store.flush()
        // Wait for requestAnimationFrame to execute
        await new Promise(resolve => requestAnimationFrame(resolve))
      })

      await waitFor(() => {
        expect(screen.getByTestId('items')).toHaveTextContent('item1')
      })
    })

    it('should return a promise from dispatch', async () => {
      const store = createStore({ initialState: { count: 0 } })

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      function TestComponent() {
        const dispatch = useDispatch()
        const [isDispatching, setIsDispatching] = React.useState(false)

        const handleClick = async () => {
          setIsDispatching(true)
          await dispatch('increment', null)
          setIsDispatching(false)
        }

        return (
          <button onClick={handleClick} data-testid="button">
            {isDispatching ? 'Dispatching...' : 'Dispatch'}
          </button>
        )
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByTestId('button')).toHaveTextContent('Dispatch')

      await act(async () => {
        const button = screen.getByTestId('button')
        button.click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('button')).toHaveTextContent('Dispatch')
      })
    })
  })

  describe('Memoization', () => {
    it('should return the same dispatch function reference on re-renders', () => {
      const store = createStore({ initialState: { count: 0 } })

      const dispatchRefs: any[] = []

      function TestComponent() {
        const dispatch = useDispatch()
        const state = useStoreState<{ count: number }>()

        React.useEffect(() => {
          dispatchRefs.push(dispatch)
        })

        return (
          <div>
            <div data-testid="count">{state.count}</div>
            <button onClick={() => dispatch('increment', null)}>
              Increment
            </button>
          </div>
        )
      }

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      const { rerender } = render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      const firstDispatch = dispatchRefs[0]

      // Trigger re-render by updating state
      act(() => {
        store.dispatch('increment', null)
      })

      rerender(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      // Dispatch function should be the same reference
      expect(dispatchRefs[dispatchRefs.length - 1]).toBe(firstDispatch)
    })

    it('should update dispatch function when store changes', () => {
      const store1 = createStore({ initialState: { count: 0 } })
      const store2 = createStore({ initialState: { count: 0 } })

      const dispatchRefs: any[] = []

      function TestComponent() {
        const dispatch = useDispatch()

        React.useEffect(() => {
          dispatchRefs.push(dispatch)
        })

        return <div>Test</div>
      }

      const { rerender } = render(
        <StoreProvider store={store1}>
          <TestComponent />
        </StoreProvider>
      )

      const firstDispatch = dispatchRefs[0]

      rerender(
        <StoreProvider store={store2}>
          <TestComponent />
        </StoreProvider>
      )

      // Dispatch function should be different when store changes
      expect(dispatchRefs[dispatchRefs.length - 1]).not.toBe(firstDispatch)
    })
  })

  describe('Error Handling', () => {
    it('should throw error when used outside StoreProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      function TestComponent() {
        useDispatch()
        return <div>Test</div>
      }

      expect(() => {
        render(<TestComponent />)
      }).toThrow('useStore must be used within a StoreProvider')

      consoleSpy.mockRestore()
    })

    it('should handle dispatch errors gracefully', async () => {
      const store = createStore({ initialState: { count: 0 } })

      store.registerEvent('error-event', () => {
        throw new Error('Test error')
      })

      const errorHandler = jest.fn()
      store.registerErrorHandler(errorHandler)

      function TestComponent() {
        const dispatch = useDispatch()
        const [error, setError] = React.useState<string | null>(null)

        const handleClick = async () => {
          try {
            await dispatch('error-event', null)
          } catch (e) {
            setError((e as Error).message)
          }
        }

        return (
          <div>
            {error && <div data-testid="error">{error}</div>}
            <button onClick={handleClick}>Trigger Error</button>
          </div>
        )
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      await act(async () => {
        const button = screen.getByText('Trigger Error')
        button.click()
      })

      // Error handler should be called
      await waitFor(() => {
        expect(errorHandler).toHaveBeenCalled()
      })
    })
  })

  describe('Multiple Components', () => {
    it('should allow multiple components to dispatch events', async () => {
      const initialState = { count: 0 }
      const store = createStore({ initialState })

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      function Counter1() {
        const dispatch = useDispatch()
        const state = useStoreState<typeof initialState>()
        return (
          <div>
            <div data-testid="counter1">{state.count}</div>
            <button onClick={() => dispatch('increment', null)}>
              Increment 1
            </button>
          </div>
        )
      }

      function Counter2() {
        const dispatch = useDispatch()
        const state = useStoreState<typeof initialState>()
        return (
          <div>
            <div data-testid="counter2">{state.count}</div>
            <button onClick={() => dispatch('increment', null)}>
              Increment 2
            </button>
          </div>
        )
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
        const button1 = screen.getByText('Increment 1')
        fireEvent.click(button1)
        // Wait for dispatch to complete and state to update
        await store.flush()
        // Wait for requestAnimationFrame to execute
        await new Promise(resolve => requestAnimationFrame(resolve))
      })

      await waitFor(() => {
        expect(screen.getByTestId('counter1')).toHaveTextContent('1')
        expect(screen.getByTestId('counter2')).toHaveTextContent('1')
      })

      await act(async () => {
        const button2 = screen.getByText('Increment 2')
        fireEvent.click(button2)
        // Wait for dispatch to complete and state to update
        await store.flush()
        // Wait for requestAnimationFrame to execute
        await new Promise(resolve => requestAnimationFrame(resolve))
      })

      await waitFor(() => {
        expect(screen.getByTestId('counter1')).toHaveTextContent('2')
        expect(screen.getByTestId('counter2')).toHaveTextContent('2')
      })
    })
  })
})

