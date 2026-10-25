import { describe, expect, it } from 'vitest'
import { LoadProgress } from './progress'

describe('LoadProgress', () => {
  it('reports the weighted share of the loads that have settled', async () => {
    const heard: number[] = []
    const progress = new LoadProgress(4, (f) => heard.push(f))
    await progress.track(Promise.resolve('room'), 1)
    await progress.track(Promise.resolve('garden'), 3)
    expect(heard).toEqual([0.25, 1])
  })

  it('counts a failed load as done and passes its rejection on', async () => {
    const heard: number[] = []
    const progress = new LoadProgress(2, (f) => heard.push(f))
    await expect(progress.track(Promise.reject(new Error('404')), 1)).rejects.toThrow('404')
    expect(heard).toEqual([0.5])
  })

  it('never reports more than everything', async () => {
    const heard: number[] = []
    const progress = new LoadProgress(1, (f) => heard.push(f))
    await progress.track(Promise.resolve(), 1)
    await progress.track(Promise.resolve(), 1)
    expect(heard).toEqual([1, 1])
  })
})
