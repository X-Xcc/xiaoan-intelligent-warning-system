export function sceneFeedUrl(feed: string, apiBase: string, pageUrl: string): string | undefined {
  try {
    const base = new URL(apiBase.replace(/\/+$/, ''), pageUrl);
    const apiPath = base.pathname.replace(/\/+$/, '');
    const value = feed.startsWith('/api/') ? `${apiPath}${feed.slice(4)}` : feed;
    const url = new URL(value, `${base.href}/`);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin
      || url.username || url.password || url.pathname !== `${apiPath}/security-video/feed`) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}
