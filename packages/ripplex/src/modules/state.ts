/**
 * State management module
 * Inspired by re-frame's db.cljc
 * 
 * Handles state storage, retrieval, and batched change notifications
 */

/**
 * Scheduler function type for batching state change notifications
 * Defaults to requestAnimationFrame, but can be injected for testing
 */
export type StateScheduler = (callback: FrameRequestCallback) => number

export interface StateManager<State> {
  /**
   * Get the current state (read-only)
   */
  getState(): Readonly<State>

  /**
   * Update the state
   * @param newState - The new state value
   */
  setState(newState: State): void

  /**
   * Schedule a batched state change notification
   * Uses requestAnimationFrame to batch updates
   */
  scheduleNotification(): void
}

/**
 * Create a new state manager instance
 * @param initialState - The initial state value
 * @param onStateChange - Optional callback when state changes (for framework integration)
 * @param onStateChangeForSubscriptions - Optional callback for subscription notifications
 * @param scheduler - Optional scheduler function (defaults to requestAnimationFrame)
 * @returns A new StateManager instance
 */
export function createStateManager<State>(
  initialState: State,
  onStateChange?: (state: State) => void,
  onStateChangeForSubscriptions?: (state: State) => void,
  scheduler: StateScheduler = requestAnimationFrame
): StateManager<State> {
  // Internal state storage
  let state: State = initialState

  // Batching for framework integration
  const stateChanges: State[] = []
  let rafId: number | null = null

  const scheduleNotification = (): void => {
    if (rafId !== null) return

    rafId = scheduler(() => {
      rafId = null

      if (stateChanges.length > 0) {
        // Notify with latest state
        const latestState = stateChanges[stateChanges.length - 1]
        stateChanges.length = 0 // Clear array

        // Call user's onStateChange callback if provided
        if (onStateChange) {
          onStateChange(latestState)
        }

        // Call subscription notification callback if provided
        if (onStateChangeForSubscriptions) {
          onStateChangeForSubscriptions(latestState)
        }
      }
    })
  }

  return {
    getState(): Readonly<State> {
      return state
    },

    setState(newState: State): void {
      const oldState = state
      if (!Object.is(oldState, newState)) {
        state = newState

        // Track state change for batched notifications
        stateChanges.push(newState)
        scheduleNotification()
      }
    },

    scheduleNotification
  }
}

