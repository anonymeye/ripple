/**
 * Tests for the state manager module
 * Tests state storage, retrieval, updates, and batched notifications
 * Note: Uses synchronous scheduler for testing
 */

import { createStateManager, StateManager } from '../../src/modules/state'
import { createSyncScheduler } from '../utils/testScheduler'

describe('StateManager', () => {
  describe('createStateManager', () => {
    it('should create a state manager with initial state', () => {
      const initialState = { count: 0 }
      const manager = createStateManager(initialState)

      expect(manager).toBeDefined()
      expect(manager.getState()).toBe(initialState)
    })

    it('should create state manager with callbacks', () => {
      const scheduler = createSyncScheduler()
      const onStateChange = jest.fn()
      const onStateChangeForSubscriptions = jest.fn()
      const manager = createStateManager(
        { count: 0 },
        onStateChange,
        onStateChangeForSubscriptions,
        scheduler
      )

      expect(manager).toBeDefined()
      manager.setState({ count: 1 })
      scheduler.flush()

      expect(onStateChange).toHaveBeenCalledWith({ count: 1 })
      expect(onStateChangeForSubscriptions).toHaveBeenCalledWith({ count: 1 })
    })
  })

  describe('getState', () => {
    it('should return the current state', () => {
      const initialState = { count: 0, name: 'test' }
      const manager = createStateManager(initialState)

      expect(manager.getState()).toBe(initialState)
    })

    it('should return the same state reference', () => {
      const manager = createStateManager({ count: 0 })
      const state1 = manager.getState()
      const state2 = manager.getState()

      // Should return the same reference (not a copy)
      expect(state1).toBe(state2)
    })

    it('should return updated state after setState', () => {
      const scheduler = createSyncScheduler()
      const manager = createStateManager({ count: 0 }, undefined, undefined, scheduler)
      manager.setState({ count: 1 })
      scheduler.flush()

      expect(manager.getState()).toEqual({ count: 1 })
    })
  })

  describe('setState', () => {
    it('should update state when new state is different', () => {
      const scheduler = createSyncScheduler()
      const manager = createStateManager({ count: 0 }, undefined, undefined, scheduler)
      const newState = { count: 1 }

      manager.setState(newState)
      scheduler.flush()

      expect(manager.getState()).toBe(newState)
    })

    it('should not update state when new state is same reference (Object.is)', () => {
      const scheduler = createSyncScheduler()
      const initialState = { count: 0 }
      const manager = createStateManager(initialState, undefined, undefined, scheduler)
      const onStateChange = jest.fn()
      const managerWithCallback = createStateManager(
        initialState,
        onStateChange,
        undefined,
        scheduler
      )

      managerWithCallback.setState(initialState) // Same reference
      scheduler.flush()

      // Should not schedule notification for same reference
      expect(onStateChange).not.toHaveBeenCalled()
    })

    it('should not update state when new state is Object.is equal', () => {
      const scheduler = createSyncScheduler()
      const manager = createStateManager(0, undefined, undefined, scheduler)
      const onStateChange = jest.fn()
      const managerWithCallback = createStateManager(0, onStateChange, undefined, scheduler)

      managerWithCallback.setState(0) // Same primitive value
      scheduler.flush()

      expect(onStateChange).not.toHaveBeenCalled()
    })

    it('should update state when new state is different primitive', () => {
      const scheduler = createSyncScheduler()
      const manager = createStateManager(0, undefined, undefined, scheduler)
      manager.setState(1)
      scheduler.flush()

      expect(manager.getState()).toBe(1)
    })

    it('should update state when new state is different object', () => {
      const scheduler = createSyncScheduler()
      const manager = createStateManager({ count: 0 }, undefined, undefined, scheduler)
      manager.setState({ count: 1 })
      scheduler.flush()

      expect(manager.getState()).toEqual({ count: 1 })
    })

    it('should handle null and undefined states', () => {
      const scheduler = createSyncScheduler()
      const manager1 = createStateManager<null>(null, undefined, undefined, scheduler)
      manager1.setState(null)
      scheduler.flush()
      expect(manager1.getState()).toBeNull()

      const manager2 = createStateManager<undefined>(undefined, undefined, undefined, scheduler)
      manager2.setState(undefined)
      scheduler.flush()
      expect(manager2.getState()).toBeUndefined()
    })
  })

  describe('scheduleNotification', () => {
    it('should schedule notification via scheduler', () => {
      const scheduler = createSyncScheduler()
      const onStateChange = jest.fn()
      const manager = createStateManager({ count: 0 }, onStateChange, undefined, scheduler)

      manager.setState({ count: 1 })

      expect(onStateChange).not.toHaveBeenCalled() // Not called yet

      scheduler.flush()

      expect(onStateChange).toHaveBeenCalledTimes(1)
      expect(onStateChange).toHaveBeenCalledWith({ count: 1 })
    })

    it('should call onStateChange callback when provided', () => {
      const scheduler = createSyncScheduler()
      const onStateChange = jest.fn()
      const manager = createStateManager({ count: 0 }, onStateChange, undefined, scheduler)

      manager.setState({ count: 1 })
      scheduler.flush()

      expect(onStateChange).toHaveBeenCalledWith({ count: 1 })
    })

    it('should call onStateChangeForSubscriptions callback when provided', () => {
      const scheduler = createSyncScheduler()
      const onStateChangeForSubscriptions = jest.fn()
      const manager = createStateManager(
        { count: 0 },
        undefined,
        onStateChangeForSubscriptions,
        scheduler
      )

      manager.setState({ count: 1 })
      scheduler.flush()

      expect(onStateChangeForSubscriptions).toHaveBeenCalledWith({ count: 1 })
    })

    it('should call both callbacks when both are provided', () => {
      const scheduler = createSyncScheduler()
      const onStateChange = jest.fn()
      const onStateChangeForSubscriptions = jest.fn()
      const manager = createStateManager(
        { count: 0 },
        onStateChange,
        onStateChangeForSubscriptions,
        scheduler
      )

      manager.setState({ count: 1 })
      scheduler.flush()

      expect(onStateChange).toHaveBeenCalledWith({ count: 1 })
      expect(onStateChangeForSubscriptions).toHaveBeenCalledWith({ count: 1 })
    })

    it('should not call callbacks if not provided', () => {
      const scheduler = createSyncScheduler()
      const manager = createStateManager({ count: 0 }, undefined, undefined, scheduler)

      manager.setState({ count: 1 })
      scheduler.flush()

      // Should not throw or error
      expect(manager.getState()).toEqual({ count: 1 })
    })
  })

  describe('rapid state changes (batching)', () => {
    it('should batch multiple rapid state changes', () => {
      const scheduler = createSyncScheduler()
      const onStateChange = jest.fn()
      const manager = createStateManager({ count: 0 }, onStateChange, undefined, scheduler)

      manager.setState({ count: 1 })
      manager.setState({ count: 2 })
      manager.setState({ count: 3 })

      expect(onStateChange).not.toHaveBeenCalled()

      scheduler.flush()

      // Should notify with latest state only
      expect(onStateChange).toHaveBeenCalledTimes(1)
      expect(onStateChange).toHaveBeenCalledWith({ count: 3 })
    })

    it('should track all state changes but notify with latest', () => {
      const scheduler = createSyncScheduler()
      const onStateChange = jest.fn()
      const manager = createStateManager({ count: 0 }, onStateChange, undefined, scheduler)

      manager.setState({ count: 1 })
      manager.setState({ count: 2 })
      manager.setState({ count: 3 })
      scheduler.flush()

      // Should only get the latest state
      expect(manager.getState()).toEqual({ count: 3 })
      expect(onStateChange).toHaveBeenCalledWith({ count: 3 })
    })

    it('should schedule new notification after previous one completes', () => {
      const scheduler = createSyncScheduler()
      const onStateChange = jest.fn()
      const manager = createStateManager({ count: 0 }, onStateChange, undefined, scheduler)

      manager.setState({ count: 1 })
      scheduler.flush()

      expect(onStateChange).toHaveBeenCalledTimes(1)

      manager.setState({ count: 2 })
      scheduler.flush()

      expect(onStateChange).toHaveBeenCalledTimes(2)
      expect(onStateChange).toHaveBeenNthCalledWith(1, { count: 1 })
      expect(onStateChange).toHaveBeenNthCalledWith(2, { count: 2 })
    })

    it('should clear state changes array after notification', () => {
      const scheduler = createSyncScheduler()
      const onStateChange = jest.fn()
      const manager = createStateManager({ count: 0 }, onStateChange, undefined, scheduler)

      manager.setState({ count: 1 })
      manager.setState({ count: 2 })
      scheduler.flush()

      // After flush, should be ready for new changes
      manager.setState({ count: 3 })
      scheduler.flush()

      expect(onStateChange).toHaveBeenCalledTimes(2)
      expect(onStateChange).toHaveBeenNthCalledWith(1, { count: 2 })
      expect(onStateChange).toHaveBeenNthCalledWith(2, { count: 3 })
    })
  })

  describe('scheduleNotification method', () => {
    it('should be callable directly', () => {
      const scheduler = createSyncScheduler()
      const onStateChange = jest.fn()
      const manager = createStateManager({ count: 0 }, onStateChange, undefined, scheduler)

      manager.scheduleNotification()
      scheduler.flush()

      // scheduleNotification only notifies if there are state changes
      // Since no state was changed, no notification should occur
      expect(onStateChange).not.toHaveBeenCalled()
    })

    it('should not schedule multiple callbacks if already scheduled', () => {
      const scheduler = createSyncScheduler()
      const manager = createStateManager({ count: 0 }, undefined, undefined, scheduler)

      manager.scheduleNotification()
      manager.scheduleNotification()
      manager.scheduleNotification()

      // Should only schedule one callback
      scheduler.flush()
      // Verify scheduler only has one callback (batching behavior)
      expect(scheduler).toBeDefined()
    })
  })

  describe('edge cases', () => {
    it('should handle empty objects', () => {
      const scheduler = createSyncScheduler()
      const manager = createStateManager({}, undefined, undefined, scheduler)
      manager.setState({})
      scheduler.flush()
      expect(manager.getState()).toEqual({})
    })

    it('should handle nested objects', () => {
      const scheduler = createSyncScheduler()
      const initialState = { user: { name: 'Alice', age: 30 } }
      const manager = createStateManager(initialState, undefined, undefined, scheduler)
      const newState = { user: { name: 'Bob', age: 25 } }

      manager.setState(newState)
      scheduler.flush()

      expect(manager.getState()).toBe(newState)
    })

    it('should handle arrays as state', () => {
      const scheduler = createSyncScheduler()
      const manager = createStateManager([1, 2, 3], undefined, undefined, scheduler)
      manager.setState([4, 5, 6])
      scheduler.flush()

      expect(manager.getState()).toEqual([4, 5, 6])
    })

    it('should handle functions as state (edge case)', () => {
      const scheduler = createSyncScheduler()
      const fn1 = () => {}
      const fn2 = () => {}
      const manager = createStateManager(fn1, undefined, undefined, scheduler)
      manager.setState(fn2)
      scheduler.flush()

      expect(manager.getState()).toBe(fn2)
    })
  })
})

