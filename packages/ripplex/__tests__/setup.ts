/**
 * Jest setup file
 * Provides polyfills for browser APIs not available in Node.js
 */

// Polyfill for requestAnimationFrame (used by state manager for batching)
global.requestAnimationFrame = (callback: FrameRequestCallback): number => {
  return setTimeout(callback, 0) as unknown as number
}

global.cancelAnimationFrame = (id: number): void => {
  clearTimeout(id)
}

