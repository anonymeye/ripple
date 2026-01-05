/**
 * Integration tests for React package
 * Tests full React component integration scenarios
 */

import React from 'react'
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react'
import { createStore } from '@rplx/core'
import { StoreProvider, useStoreState, useDispatch, useSubscription } from '../../src'

describe('React Integration', () => {
  describe('Full Component Integration', () => {
    it('should handle complete component lifecycle with state updates', async () => {
      interface State {
        count: number
        todos: { id: number; text: string; completed: boolean }[]
      }

      const initialState: State = {
        count: 0,
        todos: [],
      }

      const store = createStore({ initialState })

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      store.registerEventDb('add-todo', (context, payload: { id: number; text: string }) => {
        return {
          ...context.db,
          todos: [...context.db.todos, { ...payload, completed: false }],
        }
      })

      store.registerEventDb('toggle-todo', (context, payload: number) => {
        return {
          ...context.db,
          todos: context.db.todos.map(t =>
            t.id === payload ? { ...t, completed: !t.completed } : t
          ),
        }
      })

      function TodoApp() {
        const state = useStoreState<State>()
        const dispatch = useDispatch()

        return (
          <div>
            <div data-testid="count">Count: {state.count}</div>
            <button
              data-testid="increment-btn"
              onClick={() => dispatch('increment', null)}
            >
              Increment
            </button>
            <div data-testid="todo-count">Todos: {state.todos.length}</div>
            <button
              data-testid="add-todo-btn"
              onClick={() => dispatch('add-todo', { id: 1, text: 'Test Todo' })}
            >
              Add Todo
            </button>
            <div data-testid="todos">
              {state.todos.map(todo => (
                <div key={todo.id} data-testid={`todo-${todo.id}`}>
                  {todo.text} - {todo.completed ? 'Done' : 'Pending'}
                </div>
              ))}
            </div>
          </div>
        )
      }

      render(
        <StoreProvider store={store}>
          <TodoApp />
        </StoreProvider>
      )

      expect(screen.getByTestId('count')).toHaveTextContent('Count: 0')
      expect(screen.getByTestId('todo-count')).toHaveTextContent('Todos: 0')

      // Test increment
      await act(async () => {
        fireEvent.click(screen.getByTestId('increment-btn'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('Count: 1')
      })

      // Test add todo
      await act(async () => {
        fireEvent.click(screen.getByTestId('add-todo-btn'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('todo-count')).toHaveTextContent('Todos: 1')
        expect(screen.getByTestId('todo-1')).toHaveTextContent('Test Todo - Pending')
      })
    })

    it('should handle multiple components using the same store', async () => {
      interface State {
        count: number
      }

      const initialState: State = { count: 0 }
      const store = createStore({ initialState })

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      function Counter() {
        const state = useStoreState<State>()
        return <div data-testid="counter">{state.count}</div>
      }

      function IncrementButton() {
        const dispatch = useDispatch()
        return (
          <button
            data-testid="increment-btn"
            onClick={() => dispatch('increment', null)}
          >
            Increment
          </button>
        )
      }

      function Display() {
        const state = useStoreState<State>()
        return <div data-testid="display">Count is {state.count}</div>
      }

      render(
        <StoreProvider store={store}>
          <Counter />
          <IncrementButton />
          <Display />
        </StoreProvider>
      )

      expect(screen.getByTestId('counter')).toHaveTextContent('0')
      expect(screen.getByTestId('display')).toHaveTextContent('Count is 0')

      await act(async () => {
        fireEvent.click(screen.getByTestId('increment-btn'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('counter')).toHaveTextContent('1')
        expect(screen.getByTestId('display')).toHaveTextContent('Count is 1')
      })
    })

    it('should handle component unmount cleanup', async () => {
      interface State {
        count: number
      }

      const initialState: State = { count: 0 }
      const store = createStore({ initialState })

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      function Counter() {
        const state = useStoreState<State>()
        return <div data-testid="counter">{state.count}</div>
      }

      function App({ showCounter }: { showCounter: boolean }) {
        return (
          <StoreProvider store={store}>
            {showCounter && <Counter />}
          </StoreProvider>
        )
      }

      const { rerender } = render(<App showCounter={true} />)

      expect(screen.getByTestId('counter')).toHaveTextContent('0')

      // Unmount counter
      rerender(<App showCounter={false} />)

      expect(screen.queryByTestId('counter')).not.toBeInTheDocument()

      // Dispatch after unmount - should not cause errors
      await act(async () => {
        await store.dispatch('increment', null)
      })

      // Re-mount counter
      rerender(<App showCounter={true} />)

      // Should show updated state
      await waitFor(() => {
        expect(screen.getByTestId('counter')).toHaveTextContent('1')
      })
    })
  })

  describe('Subscription Integration', () => {
    it('should integrate subscriptions with components', async () => {
      interface State {
        users: { id: number; name: string; role: string }[]
      }

      const initialState: State = {
        users: [
          { id: 1, name: 'Alice', role: 'admin' },
          { id: 2, name: 'Bob', role: 'user' },
        ],
      }

      const store = createStore({ initialState })

      store.registerSubscription('admin-count', {
        compute: (state: State) => {
          return state.users.filter(u => u.role === 'admin').length
        },
      })

      store.registerEventDb('add-user', (context, payload: { id: number; name: string; role: string }) => {
        return {
          ...context.db,
          users: [...context.db.users, payload],
        }
      })

      function AdminCount() {
        const count = useSubscription<number>('admin-count')
        return <div data-testid="admin-count">{count} admins</div>
      }

      function AddUserButton() {
        const dispatch = useDispatch()
        return (
          <button
            data-testid="add-admin-btn"
            onClick={() => dispatch('add-user', { id: 3, name: 'Charlie', role: 'admin' })}
          >
            Add Admin
          </button>
        )
      }

      render(
        <StoreProvider store={store}>
          <AdminCount />
          <AddUserButton />
        </StoreProvider>
      )

      expect(screen.getByTestId('admin-count')).toHaveTextContent('1 admins')

      await act(async () => {
        fireEvent.click(screen.getByTestId('add-admin-btn'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('admin-count')).toHaveTextContent('2 admins')
      })
    })

    it('should handle subscription dependencies in components', async () => {
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

      store.registerSubscription('completed-todos', {
        deps: ['all-todos'],
        combine: ([allTodos]: [State['todos']]) => {
          return allTodos.filter(t => t.completed)
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

      function CompletedTodos() {
        const todos = useSubscription<State['todos']>('completed-todos')
        return (
          <div data-testid="completed">
            {todos.length} completed: {todos.map(t => t.text).join(', ')}
          </div>
        )
      }

      function ToggleButton() {
        const dispatch = useDispatch()
        return (
          <button
            data-testid="toggle-btn"
            onClick={() => dispatch('toggle-todo', 1)}
          >
            Toggle Task 1
          </button>
        )
      }

      render(
        <StoreProvider store={store}>
          <CompletedTodos />
          <ToggleButton />
        </StoreProvider>
      )

      expect(screen.getByTestId('completed')).toHaveTextContent('1 completed: Task 2')

      await act(async () => {
        fireEvent.click(screen.getByTestId('toggle-btn'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('completed')).toHaveTextContent('2 completed: Task 1, Task 2')
      })
    })
  })

  describe('Complex Scenarios', () => {
    it('should handle rapid state changes', async () => {
      interface State {
        count: number
      }

      const initialState: State = { count: 0 }
      const store = createStore({ initialState })

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      function Counter() {
        const state = useStoreState<State>()
        return <div data-testid="count">{state.count}</div>
      }

      function RapidIncrement() {
        const dispatch = useDispatch()
        return (
          <button
            data-testid="rapid-btn"
            onClick={async () => {
              for (let i = 0; i < 5; i++) {
                await dispatch('increment', null)
              }
            }}
          >
            Rapid Increment
          </button>
        )
      }

      render(
        <StoreProvider store={store}>
          <Counter />
          <RapidIncrement />
        </StoreProvider>
      )

      expect(screen.getByTestId('count')).toHaveTextContent('0')

      await act(async () => {
        fireEvent.click(screen.getByTestId('rapid-btn'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('5')
      })
    })

    it('should handle nested component hierarchies', async () => {
      interface State {
        user: { id: number; name: string } | null
        settings: { theme: string }
      }

      const initialState: State = {
        user: null,
        settings: { theme: 'light' },
      }

      const store = createStore({ initialState })

      store.registerEventDb('set-user', (context, payload: { id: number; name: string }) => {
        return { ...context.db, user: payload }
      })

      store.registerSubscription('user-name', {
        compute: (state: State) => state.user?.name ?? 'Guest',
      })

      function UserDisplay() {
        const userName = useSubscription<string>('user-name')
        return <div data-testid="user-name">{userName}</div>
      }

      function SettingsDisplay() {
        const state = useStoreState<State>()
        return <div data-testid="theme">{state.settings.theme}</div>
      }

      function UserButton() {
        const dispatch = useDispatch()
        return (
          <button
            data-testid="set-user-btn"
            onClick={() => dispatch('set-user', { id: 1, name: 'Alice' })}
          >
            Set User
          </button>
        )
      }

      function App() {
        return (
          <div>
            <UserDisplay />
            <SettingsDisplay />
            <UserButton />
          </div>
        )
      }

      render(
        <StoreProvider store={store}>
          <App />
        </StoreProvider>
      )

      expect(screen.getByTestId('user-name')).toHaveTextContent('Guest')
      expect(screen.getByTestId('theme')).toHaveTextContent('light')

      await act(async () => {
        fireEvent.click(screen.getByTestId('set-user-btn'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('user-name')).toHaveTextContent('Alice')
        expect(screen.getByTestId('theme')).toHaveTextContent('light')
      })
    })

    it('should handle concurrent updates from multiple components', async () => {
      interface State {
        count: number
      }

      const initialState: State = { count: 0 }
      const store = createStore({ initialState })

      store.registerEventDb('increment', (context) => {
        return { ...context.db, count: context.db.count + 1 }
      })

      function Counter1() {
        const state = useStoreState<State>()
        const dispatch = useDispatch()
        return (
          <div>
            <div data-testid="counter1">{state.count}</div>
            <button
              data-testid="btn1"
              onClick={() => dispatch('increment', null)}
            >
              Increment 1
            </button>
          </div>
        )
      }

      function Counter2() {
        const state = useStoreState<State>()
        const dispatch = useDispatch()
        return (
          <div>
            <div data-testid="counter2">{state.count}</div>
            <button
              data-testid="btn2"
              onClick={() => dispatch('increment', null)}
            >
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

      // Click both buttons concurrently
      await act(async () => {
        fireEvent.click(screen.getByTestId('btn1'))
        fireEvent.click(screen.getByTestId('btn2'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('counter1')).toHaveTextContent('2')
        expect(screen.getByTestId('counter2')).toHaveTextContent('2')
      })
    })
  })
})

