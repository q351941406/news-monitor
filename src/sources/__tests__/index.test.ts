import { describe, it, expect } from 'vitest'
import { sources, getSource } from '../index'

describe('sources/index', () => {
  it('注册了 3 个来源', () => {
    expect(sources.map((s) => s.slug)).toEqual(['github', 'producthunt', 'twitter'])
  })

  it('getSource 返回匹配来源', () => {
    expect(getSource('github')?.name).toBeTruthy()
    expect(getSource('producthunt')?.slug).toBe('producthunt')
    expect(getSource('twitter')?.slug).toBe('twitter')
  })

  it('getSource 未知 slug 返回 undefined', () => {
    expect(getSource('nope')).toBeUndefined()
  })
})
