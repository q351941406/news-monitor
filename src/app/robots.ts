import type { MetadataRoute } from 'next'

/**
 * robots.txt —— 允许全部搜索引擎抓取，并声明 sitemap 位置。
 * 注意：若边缘层（Cloudflare）存在同名 robots.txt 会覆盖此文件，部署后需验证。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: '/sitemap.xml',
  }
}
