export interface WikiSummary {
  title: string;
  extract: string;
  thumbnail?: string;
  pageUrl: string;
}

const cache = new Map<string, Promise<WikiSummary | null>>();
const wikiEnabled = import.meta.env.VITE_ENABLE_WIKI !== 'false';

export function fetchWikiSummary(title: string): Promise<WikiSummary | null> {
  if (!wikiEnabled) {
    return Promise.resolve(null);
  }

  if (!title.trim()) {
    return Promise.resolve(null);
  }

  const key = title.trim();
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const endpoint = new URL('https://zh.wikipedia.org/w/api.php');
  endpoint.searchParams.set('action', 'query');
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('prop', 'extracts|pageimages');
  endpoint.searchParams.set('exintro', '1');
  endpoint.searchParams.set('explaintext', '1');
  endpoint.searchParams.set('pithumbsize', '900');
  endpoint.searchParams.set('titles', key);
  endpoint.searchParams.set('origin', '*');

  const request = fetch(endpoint)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Wikipedia request failed: ${response.status}`);
      }
      return response.json();
    })
    .then((payload) => {
      const page = Object.values(payload?.query?.pages ?? {})[0] as
        | {
            title?: string;
            extract?: string;
            thumbnail?: { source?: string };
            missing?: string;
          }
        | undefined;

      if (!page || page.missing !== undefined) {
        return null;
      }

      const wikiTitle = page.title || key;
      return {
        title: wikiTitle,
        extract: page.extract || '',
        thumbnail: page.thumbnail?.source,
        pageUrl: `https://zh.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, '_'))}`,
      };
    })
    .catch(() => null);

  cache.set(key, request);
  return request;
}
