/**
 * Tests for useSubscription hook
 * Tests subscription hook and createSubscriptionHook factory
 */

import React from 'react'
import { render, screen, act, waitFor } from '@testing-library/react'
import { createStore } from '@rplx/core'
import { StoreProvider, useSubscription, createSubscriptionHook } from '../../src'

describe('useSubscription', () => {
  describe('Basic Subscription', () => {
    it('should return subscription result on initial render', () => {
      interface State {
        users: { id: number; name: string }[]
      }

      const initialState: State = {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      }

      const store = createStore({ initialState })

      store.registerSubscription('user-count', {
        compute: (state: State) => state.users.length,
      })

      function TestComponent() {
        const count = useSubscription<number>('user-count')
        return <div data-testid="count">{count}</div>
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByTestId('count')).toHaveTextContent('2')
    })

    it('should update when subscription dependencies change', async () => {
      interface State {
        users: { id: number; name: string }[]
      }

      const initialState: State = {
        users: [],
      }

      const store = createStore({ initialState })

      store.registerSubscription('user-count', {
        compute: (state: State) => state.users.length,
      })

      store.registerEventDb('add-user', (context, payload: { id: number; name: string }) => {
        return {
          ...context.db,
          users: [...context.db.users, payload],
        }
      })

      function TestComponent() {
        const count = useSubscription<number>('user-count')
        return <div data-testid="count">{count}</div>
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByTestId('count')).toHaveTextContent('0')

      await act(async () => {
        await store.dispatch('add-user', { id: 1, name: 'Alice' })
      })

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('1')
      })
    })

    it('should work with subscription parameters', () => {
      interface State {
        users: { id: number; name: string }[]
      }

      const initialState: State = {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      }

      const store = createStore({ initialState })

      store.registerSubscription('user-by-id', {
        compute: (state: State, id: number) => {
          return state.users.find(u => u.id === id) || null
        },
      })

      function TestComponent() {
        const user = useSubscription<{ id: number; name: string } | null, [number]>('user-by-id', 1)
        return <div data-testid="user">{user?.name ?? 'not found'}</div>
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByTestId('user')).toHaveTextContent('Alice')
    })

    it('should update when subscription parameters change', async () => {
      interface State {
        users: { id: number; name: string }[]
      }

      const initialState: State = {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      }

      const store = createStore({ initialState })

      store.registerSubscription('user-by-id', {
        compute: (state: State, id: number) => {
          return state.users.find(u => u.id === id) || null
        },
      })

      function TestComponent({ userId }: { userId: number }) {
        const user = useSubscription<{ id: number; name: string } | null, [number]>('user-by-id', userId)
        return <div data-testid="user">{user?.name ?? 'not found'}</div>
      }

      const { rerender } = render(
        <StoreProvider store={store}>
          <TestComponent userId={1} />
        </StoreProvider>
      )

      expect(screen.getByTestId('user')).toHaveTextContent('Alice')

      rerender(
        <StoreProvider store={store}>
          <TestComponent userId={2} />
        </StoreProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('Bob')
      })
    })
  })

  describe('Subscription Dependencies', () => {
    it('should update when dependent subscriptions change', async () => {
      interface State {
        todos: { id: number; text: string; completed: boolean }[]
      }

      const initialState: State = {
        todos: [
          { id: 1, text: 'Task 1', completed: false },
          { id: 2, text: 'Task 2', completed: true },
        ],
      }

      const store = createStore({ initialState })

      store.registerSubscription('all-todos', {
        compute: (state: State) => state.todos,
      })

      store.registerSubscription('completed-count', {
        deps: ['all-todos'],
        combine: ([allTodos]: [State['todos']]) => {
          return allTodos.filter(t => t.completed).length
        },
      })

      store.registerEventDb('toggle-todo', (context, payload: number) => {
        return {
          ...context.db,
          todos: context.db.todos.map(t =>
            t.id === payload ? { ...t, completed: !t.completed } : t
          ),
        }
      })

      function TestComponent() {
        const count = useSubscription<number>('completed-count')
        return <div data-testid="count">{count}</div>
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByTestId('count')).toHaveTextContent('1')

      await act(async () => {
        await store.dispatch('toggle-todo', 1)
      })

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('2')
      })
    })
  })

  describe('Cleanup on Unmount', () => {
    it('should unsubscribe when component unmounts', async () => {
      const initialState = { count: 0 }
      const store = createStore({ initialState })

      store.registerSubscription('count', {
        compute: (state: typeof initialState) => state.count,
      })

      const subscribeSpy = jest.spyOn(store, 'subscribe')

      function TestComponent() {
        const count = useSubscription<number>('count')
        return <div data-testid="count">{count}</div>
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
      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      await act(async () => {
        await store.dispatch('increment', null)
      })

      // No assertions needed - just verify no errors occurred
    })
  })

  describe('Error Handling', () => {
    it('should throw error when used outside StoreProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      function TestComponent() {
        useSubscription('test')
        return <div>Test</div>
      }

      expect(() => {
        render(<TestComponent />)
      }).toThrow('useStore must be used within a StoreProvider')

      consoleSpy.mockRestore()
    })

    it('should handle subscription errors gracefully', async () => {
      const store = createStore({ initialState: { count: 0 } })

      const errorHandler = jest.fn()
      store.registerErrorHandler(errorHandler)

      store.registerSubscription('error-sub', {
        compute: () => {
          throw new Error('Subscription error')
        },
      })

      function TestComponent() {
        try {
          const result = useSubscription('error-sub')
          return <div data-testid="result">{String(result)}</div>
        } catch (e) {
          return <div data-testid="error">{(e as Error).message}</div>
        }
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      // Error handler should be called when subscription is queried
      // The subscription throws an error, which is caught and handled
      // Wait a bit for async error handling to complete
      await waitFor(() => {
        expect(errorHandler).toHaveBeenCalled()
      })
    })
  })

  describe('createSubscriptionHook', () => {
    it('should create a reusable hook for a subscription', () => {
      interface State {
        users: { id: number; name: string }[]
      }

      const initialState: State = {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      }

      const store = createStore({ initialState })

      store.registerSubscription('user-count', {
        compute: (state: State) => state.users.length,
      })

      const useUserCount = createSubscriptionHook<number>('user-count')

      function TestComponent() {
        const count = useUserCount()
        return <div data-testid="count">{count}</div>
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByTestId('count')).toHaveTextContent('2')
    })

    it('should create a hook that accepts parameters', () => {
      interface State {
        users: { id: number; name: string }[]
      }

      const initialState: State = {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      }

      const store = createStore({ initialState })

      store.registerSubscription('user-by-id', {
        compute: (state: State, id: number) => {
          return state.users.find(u => u.id === id) || null
        },
      })

      const useUserById = createSubscriptionHook<{ id: number; name: string } | null, [number]>('user-by-id')

      function TestComponent() {
        const user = useUserById(1)
        return <div data-testid="user">{user?.name ?? 'not found'}</div>
      }

      render(
        <StoreProvider store={store}>
          <TestComponent />
        </StoreProvider>
      )

      expect(screen.getByTestId('user')).toHaveTextContent('Alice')
    })

    it('should update when parameters change', async () => {
      interface State {
        users: { id: number; name: string }[]
      }

      const initialState: State = {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      }

      const store = createStore({ initialState })

      store.registerSubscription('user-by-id', {
        compute: (state: State, id: number) => {
          return state.users.find(u => u.id === id) || null
        },
      })

      const useUserById = createSubscriptionHook<{ id: number; name: string } | null, [number]>('user-by-id')

      function TestComponent({ userId }: { userId: number }) {
        const user = useUserById(userId)
        return <div data-testid="user">{user?.name ?? 'not found'}</div>
      }

      const { rerender } = render(
        <StoreProvider store={store}>
          <TestComponent userId={1} />
        </StoreProvider>
      )

      expect(screen.getByTestId('user')).toHaveTextContent('Alice')

      rerender(
        <StoreProvider store={store}>
          <TestComponent userId={2} />
        </StoreProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('Bob')
      })
    })
  })

  describe('Multiple Subscriptions', () => {
    it('should allow multiple components to use the same subscription', async () => {
      interface State {
        count: number
      }

      const initialState: State = { count: 0 }
      const store = createStore({ initialState })

      store.registerSubscription('count', {
        compute: (state: State) => state.count,
      })

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      function Counter1() {
        const count = useSubscription<number>('count')
        return <div data-testid="counter1">{count}</div>
      }

      function Counter2() {
        const count = useSubscription<number>('count')
        return <div data-testid="counter2">{count}</div>
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

    it('should handle different subscriptions independently', async () => {
      interface State {
        count: number
        items: string[]
      }

      const initialState: State = { count: 0, items: [] }
      const store = createStore({ initialState })

      store.registerSubscription('count', {
        compute: (state: State) => state.count,
      })

      store.registerSubscription('item-count', {
        compute: (state: State) => state.items.length,
      })

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      store.registerEventDb('add-item', (context, payload: string) => {
        return { ...context.db, items: [...context.db.items, payload] }
      })

      function CountDisplay() {
        const count = useSubscription<number>('count')
        return <div data-testid="count">{count}</div>
      }

      function ItemCountDisplay() {
        const itemCount = useSubscription<number>('item-count')
        return <div data-testid="item-count">{itemCount}</div>
      }

      render(
        <StoreProvider store={store}>
          <CountDisplay />
          <ItemCountDisplay />
        </StoreProvider>
      )

      expect(screen.getByTestId('count')).toHaveTextContent('0')
      expect(screen.getByTestId('item-count')).toHaveTextContent('0')

      await act(async () => {
        await store.dispatch('increment', null)
      })

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('1')
        expect(screen.getByTestId('item-count')).toHaveTextContent('0')
      })

      await act(async () => {
        await store.dispatch('add-item', 'item1')
      })

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('1')
        expect(screen.getByTestId('item-count')).toHaveTextContent('1')
      })
    })
  })
})

