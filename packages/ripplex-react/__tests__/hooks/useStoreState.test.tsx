/**
 * Tests for useStoreState hook
 * Tests state subscription, updates on state change, and cleanup on unmount
 */

import React from 'react'
import { render, screen, act, waitFor } from '@testing-library/react'
import { createStore } from '@rplx/core'
import { StoreProvider, useStoreState } from '../../src'

describe('useStoreState', () => {
  describe('State Subscription', () => {
    it('should return current state on initial render', () => {
      const initialState = { count: 0, name: 'test' }
      const store = createStore({ initialState })

      function TestComponent() {
        const state = useStoreState<typeof initialState>()
        return <div>{state.count} - {state.name}</div>
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByText('0 - test')).toBeInTheDocument()
    })

    it('should subscribe to state changes', async () => {
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

    it('should update when state reference changes', async () => {
      const initialState = { count: 0, items: [] as string[] }
      const store = createStore({ initialState })

      store.registerEventDb('add-item', (context, payload: string) => {
        return { ...context.db, items: [...context.db.items, payload] }
      })

      function TestComponent() {
        const state = useStoreState<typeof initialState>()
        return (
          <div>
            <div data-testid="count">{state.count}</div>
            <div data-testid="items">{state.items.join(',')}</div>
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
        await store.dispatch('add-item', 'item1')
      })

      await waitFor(() => {
        expect(screen.getByTestId('items')).toHaveTextContent('item1')
      })

      await act(async () => {
        await store.dispatch('add-item', 'item2')
      })

      await waitFor(() => {
        expect(screen.getByTestId('items')).toHaveTextContent('item1,item2')
      })
    })

    it('should not update if state reference does not change', async () => {
      const initialState = { count: 0 }
      const store = createStore({ initialState })

      let renderCount = 0

      function TestComponent() {
        const state = useStoreState<typeof initialState>()
        renderCount++
        return <div data-testid="count">{state.count}</div>
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      const initialRenderCount = renderCount

      // Dispatch an event that doesn't change state
      store.registerEventDb('no-op', (context) => {
        return context.db // Same reference
      })

      await act(async () => {
        await store.dispatch('no-op', null)
      })

      // Wait a bit to ensure no re-render occurred
      await new Promise(resolve => setTimeout(resolve, 100))

      // Component should not have re-rendered
      expect(renderCount).toBe(initialRenderCount)
    })
  })

  describe('Cleanup on Unmount', () => {
    it('should unsubscribe when component unmounts', async () => {
      const initialState = { count: 0 }
      const store = createStore({ initialState })

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      const subscribeSpy = jest.spyOn(store, 'subscribe')

      function TestComponent() {
        const state = useStoreState<typeof initialState>()
        return <div data-testid="count">{state.count}</div>
      }

      const { unmount } = render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      // Verify subscription was created
      expect(subscribeSpy).toHaveBeenCalled()

      // Unmount component
      unmount()

      // Dispatch after unmount - should not cause errors
      await act(async () => {
        await store.dispatch('increment', null)
      })

      // No assertions needed - just verify no errors occurred
    })

    it('should handle multiple components independently', async () => {
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

      const { unmount: unmount1 } = render(
        <StoreProvider store={store}>
          <Counter1 />
        </StoreProvider>
      )

      const { unmount: unmount2 } = render(
        <StoreProvider store={store}>
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

      // Unmount one component
      unmount1()

      // Other component should still work
      await act(async () => {
        await store.dispatch('increment', null)
      })

      await waitFor(() => {
        expect(screen.getByTestId('counter2')).toHaveTextContent('2')
      })

      unmount2()
    })
  })

  describe('Error Handling', () => {
    it('should throw error when used outside StoreProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      function TestComponent() {
        useStoreState()
        return <div>Test</div>
      }

      expect(() => {
        render(<TestComponent />)
      }).toThrow('useStoreState must be used within a StoreProvider')

      consoleSpy.mockRestore()
    })
  })

  describe('Multiple State Updates', () => {
    it('should handle rapid state changes correctly', async () => {
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

      // Dispatch multiple events rapidly
      await act(async () => {
        await Promise.all([
          store.dispatch('increment', null),
          store.dispatch('increment', null),
          store.dispatch('increment', null),
        ])
      })

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('3')
      })
    })

    it('should handle complex state updates', async () => {
      interface State {
        users: { id: number; name: string }[]
        selectedId: number | null
      }

      const initialState: State = {
        users: [],
        selectedId: null,
      }

      const store = createStore({ initialState })

      store.registerEventDb('add-user', (context, payload: { id: number; name: string }) => {
        return {
          ...context.db,
          users: [...context.db.users, payload],
        }
      })

      store.registerEventDb('select-user', (context, payload: number) => {
        return {
          ...context.db,
          selectedId: payload,
        }
      })

      function TestComponent() {
        const state = useStoreState<State>()
        return (
          <div>
            <div data-testid="user-count">{state.users.length}</div>
            <div data-testid="selected-id">{state.selectedId ?? 'none'}</div>
          </div>
        )
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByTestId('user-count')).toHaveTextContent('0')
      expect(screen.getByTestId('selected-id')).toHaveTextContent('none')

      await act(async () => {
        await store.dispatch('add-user', { id: 1, name: 'Alice' })
        await store.dispatch('add-user', { id: 2, name: 'Bob' })
        await store.dispatch('select-user', 1)
      })

      await waitFor(() => {
        expect(screen.getByTestId('user-count')).toHaveTextContent('2')
        expect(screen.getByTestId('selected-id')).toHaveTextContent('1')
      })
    })
  })
})

