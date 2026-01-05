/**
 * Unit Tests: Effect Merging
 * Tests the mergeEffects function
 */

import { describe, it, expect } from '@jest/globals'
import { mergeEffects } from '../../src/modules/effects'
import { EffectMap } from '../../src/modules/types'

describe('mergeEffects()', () => {
    describe('Basic Merging', () => {
        it('should merge empty effect maps', () => {
            const result = mergeEffects({}, {}, {})
            expect(result).toEqual({})
        })

        it('should merge single effect map', () => {
            const effect: EffectMap = {
                db: { count: 1 }
            }
            const result = mergeEffects(effect)
            expect(result).toEqual({ db: { count: 1 } })
        })

        it('should merge multiple effect maps', () => {
            const effect1: EffectMap = {
                db: { count: 1 }
            }
            const effect2: EffectMap = {
                dispatch: { event: 'save', payload: {} }
            }
            const result = mergeEffects(effect1, effect2)
            expect(result).toEqual({
                db: { count: 1 },
                dispatch: { event: 'save', payload: {} }
            })
        })
    })

    describe(':db Effect Merging (Last Wins)', () => {
        it('should use last :db value', () => {
            const effect1: EffectMap = {
                db: { count: 1 }
            }
            const effect2: EffectMap = {
                db: { count: 2 }
            }
            const effect3: EffectMap = {
                db: { count: 3 }
            }
            const result = mergeEffects(effect1, effect2, effect3)
            expect(result).toEqual({ db: { count: 3 } })
        })

        it('should completely replace :db state', () => {
            const effect1: EffectMap = {
                db: { count: 1, name: 'old' }
            }
            const effect2: EffectMap = {
                db: { count: 2 }
            }
            const result = mergeEffects(effect1, effect2)
            expect(result).toEqual({ db: { count: 2 } })
            expect(result.db).not.toHaveProperty('name')
        })
    })

    describe(':dispatch Effect Merging (Last Wins)', () => {
        it('should use last :dispatch value', () => {
            const effect1: EffectMap = {
                dispatch: { event: 'event1', payload: { id: 1 } }
            }
            const effect2: EffectMap = {
                dispatch: { event: 'event2', payload: { id: 2 } }
            }
            const result = mergeEffects(effect1, effect2)
            expect(result).toEqual({
                dispatch: { event: 'event2', payload: { id: 2 } }
            })
        })
    })

    describe(':dispatch-n Effect Merging (Concatenate)', () => {
        it('should concatenate :dispatch-n arrays', () => {
            const effect1: EffectMap = {
                'dispatch-n': [
                    { event: 'event1', payload: { id: 1 } }
                ]
            }
            const effect2: EffectMap = {
                'dispatch-n': [
                    { event: 'event2', payload: { id: 2 } }
                ]
            }
            const result = mergeEffects(effect1, effect2)
            expect(result).toEqual({
                'dispatch-n': [
                    { event: 'event1', payload: { id: 1 } },
                    { event: 'event2', payload: { id: 2 } }
                ]
            })
        })

        it('should concatenate multiple :dispatch-n arrays', () => {
            const effect1: EffectMap = {
                'dispatch-n': [{ event: 'e1' }]
            }
            const effect2: EffectMap = {
                'dispatch-n': [{ event: 'e2' }]
            }
            const effect3: EffectMap = {
                'dispatch-n': [{ event: 'e3' }]
            }
            const result = mergeEffects(effect1, effect2, effect3)
            expect(result['dispatch-n']).toHaveLength(3)
            expect(result['dispatch-n']).toEqual([
                { event: 'e1' },
                { event: 'e2' },
                { event: 'e3' }
            ])
        })

        it('should handle empty :dispatch-n arrays', () => {
            const effect1: EffectMap = {
                'dispatch-n': []
            }
            const effect2: EffectMap = {
                'dispatch-n': [{ event: 'e1' }]
            }
            const result = mergeEffects(effect1, effect2)
            expect(result['dispatch-n']).toEqual([{ event: 'e1' }])
        })

        it('should preserve order when concatenating', () => {
            const effect1: EffectMap = {
                'dispatch-n': [{ event: 'first' }, { event: 'second' }]
            }
            const effect2: EffectMap = {
                'dispatch-n': [{ event: 'third' }, { event: 'fourth' }]
            }
            const result = mergeEffects(effect1, effect2)
            expect(result['dispatch-n']?.map(e => e.event)).toEqual([
                'first', 'second', 'third', 'fourth'
            ])
        })
    })

    describe(':dispatch-later Effect Merging (Concatenate)', () => {
        it('should concatenate :dispatch-later arrays', () => {
            const effect1: EffectMap = {
                'dispatch-later': [
                    { ms: 100, event: 'delayed1' }
                ]
            }
            const effect2: EffectMap = {
                'dispatch-later': [
                    { ms: 200, event: 'delayed2' }
                ]
            }
            const result = mergeEffects(effect1, effect2)
            expect(result['dispatch-later']).toEqual([
                { ms: 100, event: 'delayed1' },
                { ms: 200, event: 'delayed2' }
            ])
        })

        it('should concatenate multiple :dispatch-later arrays', () => {
            const effect1: EffectMap = {
                'dispatch-later': [{ ms: 100, event: 'e1' }]
            }
            const effect2: EffectMap = {
                'dispatch-later': [{ ms: 200, event: 'e2' }]
            }
            const effect3: EffectMap = {
                'dispatch-later': [{ ms: 300, event: 'e3' }]
            }
            const result = mergeEffects(effect1, effect2, effect3)
            expect(result['dispatch-later']).toHaveLength(3)
        })

        it('should handle empty :dispatch-later arrays', () => {
            const effect1: EffectMap = {
                'dispatch-later': []
            }
            const effect2: EffectMap = {
                'dispatch-later': [{ ms: 100, event: 'e1' }]
            }
            const result = mergeEffects(effect1, effect2)
            expect(result['dispatch-later']).toEqual([{ ms: 100, event: 'e1' }])
        })
    })

    describe(':fx Effect Merging (Concatenate)', () => {
        it('should concatenate :fx arrays', () => {
            const effect1: EffectMap = {
                fx: [['effect1', { id: 1 }]]
            }
            const effect2: EffectMap = {
                fx: [['effect2', { id: 2 }]]
            }
            const result = mergeEffects(effect1, effect2)
            expect(result.fx).toEqual([
                ['effect1', { id: 1 }],
                ['effect2', { id: 2 }]
            ])
        })

        it('should concatenate multiple :fx arrays', () => {
            const effect1: EffectMap = {
                fx: [['e1', {}]]
            }
            const effect2: EffectMap = {
                fx: [['e2', {}]]
            }
            const effect3: EffectMap = {
                fx: [['e3', {}]]
            }
            const result = mergeEffects(effect1, effect2, effect3)
            expect(result.fx).toHaveLength(3)
        })

        it('should handle empty :fx arrays', () => {
            const effect1: EffectMap = {
                fx: []
            }
            const effect2: EffectMap = {
                fx: [['effect1', {}]]
            }
            const result = mergeEffects(effect1, effect2)
            expect(result.fx).toEqual([['effect1', {}]])
        })

        it('should preserve order when concatenating', () => {
            const effect1: EffectMap = {
                fx: [['first', {}], ['second', {}]]
            }
            const effect2: EffectMap = {
                fx: [['third', {}], ['fourth', {}]]
            }
            const result = mergeEffects(effect1, effect2)
            expect(result.fx?.map(([key]) => key)).toEqual([
                'first', 'second', 'third', 'fourth'
            ])
        })
    })

    describe(':deregister-event-handler Effect Merging', () => {
        it('should merge string values into array', () => {
            const effect1: EffectMap = {
                'deregister-event-handler': 'event1'
            }
            const effect2: EffectMap = {
                'deregister-event-handler': 'event2'
            }
            const result = mergeEffects(effect1, effect2)
            expect(result['deregister-event-handler']).toEqual(['event1', 'event2'])
        })

        it('should merge array values', () => {
            const effect1: EffectMap = {
                'deregister-event-handler': ['event1', 'event2']
            }
            const effect2: EffectMap = {
                'deregister-event-handler': ['event3', 'event4']
            }
            const result = mergeEffects(effect1, effect2)
            expect(result['deregister-event-handler']).toEqual([
                'event1', 'event2', 'event3', 'event4'
            ])
        })

        it('should merge string with array', () => {
            const effect1: EffectMap = {
                'deregister-event-handler': 'event1'
            }
            const effect2: EffectMap = {
                'deregister-event-handler': ['event2', 'event3']
            }
            const result = mergeEffects(effect1, effect2)
            expect(result['deregister-event-handler']).toEqual(['event1', 'event2', 'event3'])
        })

        it('should merge array with string', () => {
            const effect1: EffectMap = {
                'deregister-event-handler': ['event1', 'event2']
            }
            const effect2: EffectMap = {
                'deregister-event-handler': 'event3'
            }
            const result = mergeEffects(effect1, effect2)
            expect(result['deregister-event-handler']).toEqual(['event1', 'event2', 'event3'])
        })

        it('should handle multiple merges', () => {
            const effect1: EffectMap = {
                'deregister-event-handler': 'e1'
            }
            const effect2: EffectMap = {
                'deregister-event-handler': ['e2', 'e3']
            }
            const effect3: EffectMap = {
                'deregister-event-handler': 'e4'
            }
            const result = mergeEffects(effect1, effect2, effect3)
            expect(result['deregister-event-handler']).toEqual(['e1', 'e2', 'e3', 'e4'])
        })
    })

    describe('Mixed Effect Merging', () => {
        it('should merge different effect types correctly', () => {
            const effect1: EffectMap = {
                db: { count: 1 },
                'dispatch-n': [{ event: 'e1' }]
            }
            const effect2: EffectMap = {
                dispatch: { event: 'save' },
                'dispatch-n': [{ event: 'e2' }]
            }
            const result = mergeEffects(effect1, effect2)
            expect(result).toEqual({
                db: { count: 1 },
                dispatch: { event: 'save' },
                'dispatch-n': [{ event: 'e1' }, { event: 'e2' }]
            })
        })

        it('should handle complex merging scenario', () => {
            const effect1: EffectMap = {
                db: { count: 1 },
                'dispatch-n': [{ event: 'e1' }],
                'dispatch-later': [{ ms: 100, event: 'd1' }],
                fx: [['fx1', {}]],
                'deregister-event-handler': 'handler1'
            }
            const effect2: EffectMap = {
                db: { count: 2 },
                dispatch: { event: 'save' },
                'dispatch-n': [{ event: 'e2' }],
                'dispatch-later': [{ ms: 200, event: 'd2' }],
                fx: [['fx2', {}]],
                'deregister-event-handler': ['handler2']
            }
            const result = mergeEffects(effect1, effect2)

            expect(result.db).toEqual({ count: 2 }) // Last wins
            expect(result.dispatch).toEqual({ event: 'save' })
            expect(result['dispatch-n']).toEqual([{ event: 'e1' }, { event: 'e2' }]) // Concatenated
            expect(result['dispatch-later']).toEqual([
                { ms: 100, event: 'd1' },
                { ms: 200, event: 'd2' }
            ]) // Concatenated
            expect(result.fx).toEqual([['fx1', {}], ['fx2', {}]]) // Concatenated
            expect(result['deregister-event-handler']).toEqual(['handler1', 'handler2']) // Merged
        })

        it('should override :db multiple times', () => {
            const effect1: EffectMap = {
                db: { count: 1, name: 'first' }
            }
            const effect2: EffectMap = {
                db: { count: 2, age: 20 }
            }
            const effect3: EffectMap = {
                db: { count: 3 }
            }
            const result = mergeEffects(effect1, effect2, effect3)
            expect(result.db).toEqual({ count: 3 })
        })

        it('should accumulate dispatch-n across multiple merges', () => {
            const effect1: EffectMap = {
                'dispatch-n': [{ event: 'e1' }]
            }
            const effect2: EffectMap = {
                'dispatch-n': [{ event: 'e2' }]
            }
            const effect3: EffectMap = {
                'dispatch-n': [{ event: 'e3' }]
            }
            const effect4: EffectMap = {
                'dispatch-n': [{ event: 'e4' }]
            }
            const result = mergeEffects(effect1, effect2, effect3, effect4)
            expect(result['dispatch-n']).toHaveLength(4)
        })
    })

    describe('Custom Effect Merging (Last Wins)', () => {
        it('should use last value for custom effects', () => {
            const effect1: EffectMap = {
                'custom-effect': { value: 1 }
            }
            const effect2: EffectMap = {
                'custom-effect': { value: 2 }
            }
            const result = mergeEffects(effect1, effect2)
            expect(result['custom-effect']).toEqual({ value: 2 })
        })

        it('should handle multiple custom effects', () => {
            const effect1: EffectMap = {
                'custom1': { a: 1 },
                'custom2': { b: 2 }
            }
            const effect2: EffectMap = {
                'custom1': { a: 10 },
                'custom3': { c: 3 }
            }
            const result = mergeEffects(effect1, effect2)
            expect(result).toEqual({
                'custom1': { a: 10 }, // Last wins
                'custom2': { b: 2 },
                'custom3': { c: 3 }
            })
        })
    })

    describe('Edge Cases', () => {
        it('should handle undefined values', () => {
            const effect1: EffectMap = {
                db: { count: 1 }
            }
            const effect2: EffectMap = {
                db: undefined as any
            }
            const result = mergeEffects(effect1, effect2)
            expect(result.db).toBeUndefined()
        })

        it('should handle null values', () => {
            const effect1: EffectMap = {
                db: { count: 1 }
            }
            const effect2: EffectMap = {
                db: null as any
            }
            const result = mergeEffects(effect1, effect2)
            expect(result.db).toBeNull()
        })

        it('should handle effects with only one map', () => {
            const effect: EffectMap = {
                db: { count: 1 },
                'dispatch-n': [{ event: 'e1' }]
            }
            const result = mergeEffects(effect)
            expect(result).toEqual(effect)
        })

        it('should handle no arguments', () => {
            const result = mergeEffects()
            expect(result).toEqual({})
        })

        it('should not mutate original effect maps', () => {
            const effect1: EffectMap = {
                'dispatch-n': [{ event: 'e1' }]
            }
            const effect2: EffectMap = {
                'dispatch-n': [{ event: 'e2' }]
            }

            const effect1Copy = JSON.parse(JSON.stringify(effect1))
            const effect2Copy = JSON.parse(JSON.stringify(effect2))

            mergeEffects(effect1, effect2)

            expect(effect1).toEqual(effect1Copy)
            expect(effect2).toEqual(effect2Copy)
        })

        it('should handle effects with empty values', () => {
            const effect1: EffectMap = {
                'dispatch-n': []
            }
            const effect2: EffectMap = {
                'dispatch-later': []
            }
            const effect3: EffectMap = {
                fx: []
            }
            const result = mergeEffects(effect1, effect2, effect3)
            expect(result).toEqual({
                'dispatch-n': [],
                'dispatch-later': [],
                fx: []
            })
        })
    })

    describe('Real-World Scenarios', () => {
        it('should merge effects from interceptor chain', () => {
            // Simulating effects from multiple interceptors
            const interceptor1Effects: EffectMap = {
                db: { count: 1 }
            }
            const interceptor2Effects: EffectMap = {
                'dispatch-n': [{ event: 'log', payload: { message: 'updated' } }]
            }
            const handlerEffects: EffectMap = {
                dispatch: { event: 'save' }
            }

            const result = mergeEffects(interceptor1Effects, interceptor2Effects, handlerEffects)

            expect(result).toEqual({
                db: { count: 1 },
                'dispatch-n': [{ event: 'log', payload: { message: 'updated' } }],
                dispatch: { event: 'save' }
            })
        })

        it('should handle effect override in interceptor chain', () => {
            // Earlier interceptor sets db
            const early: EffectMap = {
                db: { count: 1, loading: true }
            }
            // Later interceptor overrides db
            const late: EffectMap = {
                db: { count: 1, loading: false, error: null }
            }

            const result = mergeEffects(early, late)

            expect(result.db).toEqual({ count: 1, loading: false, error: null })
        })

        it('should accumulate side effects from multiple sources', () => {
            const validation: EffectMap = {
                'dispatch-n': [{ event: 'validate-success' }]
            }
            const logging: EffectMap = {
                'dispatch-n': [{ event: 'log-action' }]
            }
            const analytics: EffectMap = {
                'dispatch-n': [{ event: 'track-event' }]
            }

            const result = mergeEffects(validation, logging, analytics)

            expect(result['dispatch-n']).toHaveLength(3)
            expect(result['dispatch-n']?.map(e => e.event)).toEqual([
                'validate-success',
                'log-action',
                'track-event'
            ])
        })
    })
})

