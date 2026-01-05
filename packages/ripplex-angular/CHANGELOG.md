# @rplx/angular

## 0.2.1

### Patch Changes

- Fix deadlock issues in dispatch effects and add comprehensive test suite

  - Fix deadlock issues in dispatch effects by removing await from dispatch calls
  - Fix state handling in interceptors to use final state (effects.db) instead of initial state
  - Add scheduler injection for testability (requestAnimationFrame can be overridden)
  - Improve router promise handling and error management
  - Add edge case handling in registrar
  - Add comprehensive test suite covering unit, integration, and type tests
  - Update examples to avoid deadlocks in effect handlers

- Updated dependencies
  - @rplx/core@0.2.1

## 0.2.0

### Minor Changes

- Initial release of @rplx/angular - Angular bindings for Ripple state management

  - provideRippleStore for dependency injection setup
  - injectStoreState for reactive state subscriptions
  - injectDispatch for dispatching events
  - injectSubscription for computed state subscriptions
  - injectStore for direct store access
