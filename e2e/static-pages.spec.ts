import { test, expect } from '@playwright/test'

/**
 * 静态页面与归档页冒烟
 *
 * 覆盖不依赖交互的页面级渲染：确保 SSR 页面在真实浏览器中正常渲染、
 * 无未捕获异常。这些页面此前同样没有任何测试覆盖。
 */
test.describe('静态页面与归档页', () => {
  test('/settings 正常渲染', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('/settings')

    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
    expect(pageErrors).toEqual([])
  })

  test('/archive 空库正常渲染空态', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('/archive')

    await expect(page.getByRole('heading', { name: '历史归档' })).toBeVisible()
    await expect(page.getByText('暂无已读归档内容')).toBeVisible()
    expect(pageErrors).toEqual([])
  })
})
