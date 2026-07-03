/**
 * 获取 URL 的 Open Graph 预览信息
 */

export interface OGData {
  title?: string
  description?: string
  image?: string
  siteName?: string
}

export async function fetchOGData(url: string): Promise<OGData> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsMonitor/1.0)',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) return {}

    const html = await res.text()

    return {
      title: extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title'),
      description: extractMeta(html, 'og:description') || extractMeta(html, 'twitter:description'),
      image: extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image'),
      siteName: extractMeta(html, 'og:site_name'),
    }
  } catch {
    return {}
  }
}

function extractMeta(html: string, property: string): string | undefined {
  // 匹配 og:title 或 twitter:image 等
  const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')
  const match = html.match(regex)
  if (match) return match[1]

  // 反向匹配：content 在前
  const regex2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i')
  const match2 = html.match(regex2)
  return match2?.[1]
}
