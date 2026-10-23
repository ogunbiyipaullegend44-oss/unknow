import { createServer as createHttpServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildResearchSearchQuery,
  compactResearchTopicQuery,
} from '../src/utils/researchQuery.js';
import {
  buildCurrentAffairsSearchQuery,
  currentAffairsTimeRange,
  isCurrentAffairsSearch,
} from '../src/utils/researchSearchIntent.js';
import {
  analyzeQuestion,
  normalizeSources,
  SOURCE_LIMIT_ALL,
  validateResearchRequest,
} from './research.js';
import {
  assessSourceRelevance,
  validateAiRelevanceRequest,
} from './aiRelevance.js';
import {
  generateAiTopicOverview,
  validateAiTopicOverviewRequest,
} from './aiTopicOverview.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const MAX_BODY_BYTES = 1024 * 1024;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 30;
const PROVIDER_TIMEOUT_MS = 20000;
const VIDEO_RESULT_LIMIT = 100;
const VIDEO_PAGE_SIZE = 50;
const PEERTUBE_INSTANCES = ['peertube.tv', 'framatube.org', 'tilvids.com'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function sendJson(response, status, data) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  if (request.body !== undefined) {
    const body = request.body;
    const serialized = typeof body === 'string'
      ? body
      : Buffer.isBuffer(body)
        ? body.toString('utf8')
        : null;
    const size = Buffer.byteLength(serialized ?? JSON.stringify(body));
    if (size > MAX_BODY_BYTES) {
      const error = new Error('The request is too large.');
      error.status = 413;
      throw error;
    }
    if (serialized === null) return body;
    try {
      return JSON.parse(serialized);
    } catch {
      const error = new Error('The request body must be valid JSON.');
      error.status = 400;
      throw error;
    }
  }

  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('The request is too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('The request body must be valid JSON.');
    error.status = 400;
    throw error;
  }
}

async function requestProvider(url, provider, fetchImpl, requestOptions = {}) {
  let lastStatus = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...requestOptions,
        headers: {
          accept: 'application/json',
          'user-agent': 'OSINT-Mapping-Tool/1.0',
          ...requestOptions.headers,
        },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
      if (response.ok) return await response.json();
      lastStatus = response.status;
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
        continue;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt === 0) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
        continue;
      }
      const reason = error.name === 'TimeoutError' || error.name === 'AbortError'
        ? 'timed out'
        : lastStatus
          ? `returned HTTP ${lastStatus}`
          : 'could not be reached';
      throw new Error(`${provider} ${reason}.`);
    }
  }

  throw new Error(`${provider} could not be reached.`);
}

async function fetchOpenAlexPage(url, fetchImpl, cursor) {
  const pageUrl = new URL(url);
  pageUrl.searchParams.set('cursor', cursor);
  const data = await requestProvider(pageUrl, 'OpenAlex', fetchImpl);
  if (!Array.isArray(data.results)) throw new Error('OpenAlex returned an unexpected response.');
  const nextCursor = data.meta?.next_cursor;
  if (nextCursor !== null && typeof nextCursor !== 'string') {
    throw new Error('OpenAlex returned an invalid pagination cursor.');
  }
  const repeatedCursor = nextCursor && nextCursor === cursor;
  return {
    works: data.results,
    nextCursor: repeatedCursor ? null : nextCursor || null,
    warnings: repeatedCursor ? ['OpenAlex repeated its pagination cursor; further results were stopped.'] : [],
  };
}

async function fetchCrossrefPage(url, fetchImpl, cursor) {
  const pageUrl = new URL(url);
  pageUrl.searchParams.set('cursor', cursor);
  const data = await requestProvider(pageUrl, 'Crossref', fetchImpl);
  if (!Array.isArray(data.message?.items)) throw new Error('Crossref returned an unexpected response.');
  const nextCursor = data.message['next-cursor'];
  if (nextCursor !== null && typeof nextCursor !== 'string') {
    throw new Error('Crossref returned an invalid pagination cursor.');
  }
  const repeatedCursor = nextCursor && nextCursor === cursor;
  return {
    works: data.message.items,
    nextCursor: repeatedCursor ? null : nextCursor || null,
    warnings: repeatedCursor ? ['Crossref repeated its pagination cursor; further results were stopped.'] : [],
  };
}

async function fetchSemanticScholarPage(url, fetchImpl, offset) {
  const pageUrl = new URL(url);
  pageUrl.searchParams.set('limit', '100');
  pageUrl.searchParams.set('offset', String(offset));
  const data = await requestProvider(pageUrl, 'Semantic Scholar', fetchImpl);
  if (!Array.isArray(data.data)) throw new Error('Semantic Scholar returned an unexpected response.');
  const total = Number.isInteger(data.total) && data.total >= 0 ? data.total : null;
  const nextOffset = data.data.length === 100 &&
    (total === null || offset + data.data.length < total) &&
    offset < 10000
    ? offset + data.data.length
    : null;
  const warnings = offset >= 10000 && data.data.length === 100
    ? ['Semantic Scholar reached its 10,000-result offset limit; additional results may exist.']
    : [];
  return { works: data.data, nextCursor: nextOffset, warnings };
}

function cleanVideoText(value, limit = 1000) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function decodeXmlText(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'");
}

function xmlTag(block, tag) {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`, 'i'));
  return match ? decodeXmlText(match[1].trim()) : '';
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

async function requestTextProvider(url, provider, fetchImpl) {
  let lastStatus = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          accept: 'application/rss+xml, application/xml, text/xml, application/json',
          'user-agent': 'OSINT-Mapping-Tool/1.0',
        },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
      if (response.ok) return await response.text();
      lastStatus = response.status;
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
        continue;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt === 0 && error.name !== 'TimeoutError' && error.name !== 'AbortError') {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
        continue;
      }
      const reason = error.name === 'TimeoutError' || error.name === 'AbortError'
        ? 'timed out'
        : lastStatus
          ? `returned HTTP ${lastStatus}`
          : 'could not be reached';
      throw new Error(`${provider} ${reason}.`);
    }
  }
  throw new Error(`${provider} could not be reached.`);
}

async function fetchGoogleTrending(fetchImpl) {
  const url = new URL('https://trends.google.com/trending/rss');
  const xml = await requestTextProvider(url, 'Google Trends', fetchImpl);
  const channelGeo = xml.match(/trending\/rss\?geo=([A-Z]{2})/i)?.[1]?.toUpperCase() ?? '';
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
    .map(([, block]) => {
      const title = cleanVideoText(xmlTag(block, 'title'), 300);
      const traffic = cleanVideoText(xmlTag(block, 'ht:approx_traffic'), 100);
      const publishedAt = xmlTag(block, 'pubDate');
      const news = [...block.matchAll(/<ht:news_item(?:\s[^>]*)?>([\s\S]*?)<\/ht:news_item>/gi)]
        .map(([, newsBlock]) => ({
          title: cleanVideoText(xmlTag(newsBlock, 'ht:news_item_title'), 300),
          description: cleanVideoText(xmlTag(newsBlock, 'ht:news_item_snippet'), 500),
          url: safeHttpsUrl(xmlTag(newsBlock, 'ht:news_item_url')),
          source: cleanVideoText(xmlTag(newsBlock, 'ht:news_item_source'), 120),
          image: safeHttpsUrl(xmlTag(newsBlock, 'ht:news_item_picture')),
        }))
        .filter((story) => story.title);
      const trendUrl = new URL('https://trends.google.com/trends/explore');
      trendUrl.searchParams.set('q', title);
      if (channelGeo) trendUrl.searchParams.set('geo', channelGeo);
      if (!title) return null;
      return {
        id: `google-trends:${channelGeo}:${title.toLocaleLowerCase()}`,
        title,
        url: trendUrl.href,
        traffic,
        publishedAt: Number.isFinite(Date.parse(publishedAt)) ? new Date(publishedAt).toISOString() : null,
        image: safeHttpsUrl(xmlTag(block, 'ht:picture')) || news.find((story) => story.image)?.image || '',
        imageSource: cleanVideoText(xmlTag(block, 'ht:picture_source'), 120),
        news,
        provider: 'Google Trends',
        region: channelGeo || 'Provider-selected region',
        description: news.find((story) => story.description)?.description ||
          (traffic ? `Google reports approximate search traffic of ${traffic}; no related news explanation was included in the feed.` : 'Google lists this as a current search trend; no additional explanation was included in the feed.'),
      };
    })
    .filter(Boolean)
    .slice(0, 30);
  if (xml.includes('<item') && !items.length) {
    throw new Error('Google Trends returned no usable trend items.');
  }
  return { region: channelGeo || 'Provider-selected region', items };
}

async function fetchYouTubeTrending(fetchImpl, youtubeApiKey) {
  if (!youtubeApiKey) throw new Error('Add YOUTUBE_API_KEY to the server environment to enable YouTube trending videos.');
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,statistics');
  url.searchParams.set('chart', 'mostPopular');
  url.searchParams.set('maxResults', '50');
  url.searchParams.set('key', youtubeApiKey);
  const data = await requestProvider(url, 'YouTube trending', fetchImpl);
  if (!Array.isArray(data.items)) throw new Error('YouTube trending returned an unexpected response.');
  const videos = data.items.map((item) => {
    const id = typeof item.id === 'string' ? item.id : '';
    const snippet = item.snippet ?? {};
    const title = cleanVideoText(snippet.title, 300);
    if (!/^[\w-]{11}$/.test(id) || !title) return null;
    const thumbnails = snippet.thumbnails ?? {};
    const image = ['maxres', 'standard', 'high', 'medium', 'default']
      .map((key) => safeHttpsUrl(thumbnails[key]?.url))
      .find(Boolean) ?? '';
    const viewCount = Number(item.statistics?.viewCount);
    return {
      id: `youtube-trending:${id}`,
      title,
      description: cleanVideoText(snippet.description, 700) ||
        'YouTube currently includes this video in its most-popular chart; the API does not provide a separate explanation for its trend position.',
      url: `https://www.youtube.com/watch?v=${id}`,
      image,
      channel: cleanVideoText(snippet.channelTitle, 200),
      publishedAt: typeof snippet.publishedAt === 'string' && Number.isFinite(Date.parse(snippet.publishedAt))
        ? snippet.publishedAt
        : null,
      viewCount: Number.isSafeInteger(viewCount) ? viewCount : null,
      provider: 'YouTube',
      whyTrending: 'Included in YouTube’s current most-popular chart. The chart does not identify why a video is trending.',
    };
  }).filter(Boolean);
  return { items: videos, region: 'Worldwide chart (region unspecified)' };
}

async function discoverTrending(fetchImpl, youtubeApiKey) {
  const results = await Promise.allSettled([
    fetchGoogleTrending(fetchImpl),
    fetchYouTubeTrending(fetchImpl, youtubeApiKey),
  ]);
  const warnings = [];
  const providers = [];
  let googleTrends = [];
  let googleTrendsRegion = '';
  let youtubeVideos = [];

  if (results[0].status === 'fulfilled') {
    providers.push('Google Trends');
    googleTrends = results[0].value.items;
    googleTrendsRegion = results[0].value.region;
  } else {
    warnings.push(`Google Trends: ${results[0].reason.message}`);
  }
  if (results[1].status === 'fulfilled') {
    providers.push('YouTube');
    youtubeVideos = results[1].value.items;
  } else {
    warnings.push(`YouTube: ${results[1].reason.message}`);
  }
  if (!providers.length) {
    const error = new Error(warnings.join(' '));
    error.status = 502;
    throw error;
  }
  return {
    googleTrends,
    googleTrendsRegion,
    youtubeVideos,
    providers,
    warnings,
    retrievedAt: new Date().toISOString(),
  };
}

function safeVideoUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function videoDateRange(year, month, fromYear = null, toYear = null) {
  const startYear = fromYear || year;
  const endYear = toYear || startYear;
  if (!startYear) return null;
  if (startYear !== endYear) {
    return { start: `${startYear}-01-01`, end: `${endYear}-12-31` };
  }
  if (!year && fromYear && month) year = startYear;
  if (!year || !month) return { start: `${startYear}-01-01`, end: `${endYear}-12-31` };
  const monthNumber = month ? MONTHS.indexOf(month) + 1 : null;
  const start = month
    ? `${year}-${String(monthNumber).padStart(2, '0')}-01`
    : `${year}-01-01`;
  const end = month
    ? new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
    : `${year}-12-31`;
  return { start, end };
}

function compactVideoSearch(question, region) {
  const genericVideoTerms = new Set(['adult', 'adults', 'people']);
  return compactResearchTopicQuery(question, region, 8)
    .split(' ')
    .filter((term) => !genericVideoTerms.has(term.toLocaleLowerCase()))
    .join(' ');
}

function normalizeYouTubeVideo(item) {
  const id = item.id?.videoId;
  if (typeof id !== 'string' || !/^[\w-]{11}$/.test(id)) return null;
  const title = cleanVideoText(item.snippet?.title, 500);
  if (!title) return null;
  const publishedAt = typeof item.snippet?.publishedAt === 'string'
    && Number.isFinite(Date.parse(item.snippet.publishedAt))
    ? item.snippet.publishedAt
    : null;
  return {
    id: `youtube:${id}`,
    title,
    description: cleanVideoText(item.snippet?.description),
    url: `https://www.youtube.com/watch?v=${id}`,
    platform: 'YouTube',
    channel: cleanVideoText(item.snippet?.channelTitle, 200),
    publishedAt,
  };
}

function normalizePeerTubeVideo(item) {
  const url = safeVideoUrl(item.url);
  const title = cleanVideoText(item.name, 500);
  if (!url || !title) return null;
  const stableId = typeof item.uuid === 'string' ? item.uuid : String(item.id ?? url);
  const publishedAt = typeof item.publishedAt === 'string'
    && Number.isFinite(Date.parse(item.publishedAt))
    ? item.publishedAt
    : null;
  return {
    id: `peertube:${new URL(url).hostname}:${stableId}`,
    title,
    description: cleanVideoText(item.description),
    url,
    platform: 'PeerTube',
    channel: cleanVideoText(item.channel?.displayName || item.account?.displayName, 200),
    publishedAt,
  };
}

function normalizeWebDate(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function normalizeTavilyResult(result) {
  const url = safeVideoUrl(result.url);
  const title = cleanVideoText(result.title, 500);
  if (!url || !title) return null;
  return {
    id: `tavily:${url}`,
    title,
    description: cleanVideoText(result.content),
    rawContent: cleanVideoText(result.raw_content, 8000),
    url,
    provider: 'Tavily',
    publishedAt: normalizeWebDate(result.published_date),
  };
}

function normalizeBraveResult(result) {
  const url = safeVideoUrl(result.url);
  const title = cleanVideoText(result.title, 500);
  if (!url || !title) return null;
  return {
    id: `brave:${url}`,
    title,
    description: cleanVideoText(result.description),
    url,
    provider: 'Brave Search',
    publishedAt: normalizeWebDate(result.published_time),
  };
}

function normalizeGoogleResult(result) {
  const url = safeVideoUrl(result.link);
  const title = cleanVideoText(result.title, 500);
  if (!url || !title) return null;
  const metadata = result.pagemap?.metatags?.[0] ?? {};
  return {
    id: `google:${url}`,
    title,
    description: cleanVideoText(result.snippet),
    url,
    provider: 'Google Search',
    publishedAt: normalizeWebDate(
      metadata['article:published_time'] || metadata['og:published_time'] || metadata['date'],
    ),
  };
}

function deduplicateWebSources(sources) {
  const unique = new Map();
  for (const source of sources) {
    const existing = unique.get(source.url);
    if (!existing) {
      unique.set(source.url, { ...source, id: `web:${source.url}` });
      continue;
    }
    const providers = new Set(existing.provider.split(' and '));
    providers.add(source.provider);
    unique.set(source.url, {
      ...existing,
      provider: [...providers].join(' and '),
      description: existing.description || source.description,
      rawContent: existing.rawContent || source.rawContent,
      publishedAt: existing.publishedAt || source.publishedAt,
    });
  }
  return [...unique.values()];
}

async function discoverWebSources(question, fetchImpl, {
  region = '',
  year = null,
  month = '',
  fromYear = null,
  toYear = null,
  tavilyApiKey = '',
  braveApiKey = '',
  googleSearchApiKey = '',
  googleSearchEngineId = '',
} = {}) {
  const currentAffairs = isCurrentAffairsSearch(question, { year, month, fromYear, toYear });
  const search = currentAffairs
    ? buildCurrentAffairsSearchQuery(question, region)
    : buildResearchSearchQuery(question, region);
  const currentTimeRange = currentAffairs ? currentAffairsTimeRange(question) : '';
  const requests = [];
  const names = [];
  const dateRange = videoDateRange(year, month, fromYear, toYear);

  if (googleSearchApiKey && googleSearchEngineId) {
    const googleUrl = new URL('https://www.googleapis.com/customsearch/v1');
    googleUrl.searchParams.set('key', googleSearchApiKey);
    googleUrl.searchParams.set('cx', googleSearchEngineId);
    googleUrl.searchParams.set('q', search);
    googleUrl.searchParams.set('num', '10');
    if (dateRange) {
      const compactDate = (value) => value.replaceAll('-', '');
      googleUrl.searchParams.set(
        'sort',
        `date:r:${compactDate(dateRange.start)}:${compactDate(dateRange.end)}`,
      );
    } else if (currentAffairs) {
      googleUrl.searchParams.set('dateRestrict', currentTimeRange === 'year' ? 'y1' : 'd30');
      googleUrl.searchParams.set('sort', 'date');
    }
    const request = requestProvider(googleUrl, 'Google Search', fetchImpl)
      .then((data) => {
        if (data.error) {
          const reason = cleanVideoText(data.error.message, 300) || 'request was rejected';
          throw new Error(`Google Custom Search ${reason}. Check the API key, search engine ID, and API quota.`);
        }
        if (data.items !== undefined && !Array.isArray(data.items)) {
          throw new Error('Google Custom Search returned an unexpected response.');
        }
        return (data.items ?? []).map(normalizeGoogleResult).filter(Boolean);
      })
      .catch((error) => {
        if (error.message.includes('HTTP 403')) {
          throw new Error('Google Custom Search request was denied (HTTP 403); verify Custom Search JSON API access, key restrictions, the Programmable Search Engine ID, and quota.');
        }
        if (error.message.includes('HTTP 400')) {
          throw new Error('Google Custom Search request was rejected (HTTP 400); verify the Programmable Search Engine ID and search settings.');
        }
        throw error;
      });
    requests.push(request);
    names.push('Google Search');
  }

  if (tavilyApiKey) {
    const tavilyUrl = new URL('https://api.tavily.com/search');
    const request = requestProvider(tavilyUrl, 'Tavily', fetchImpl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query: search,
        topic: currentAffairs ? 'news' : 'general',
        search_depth: currentAffairs ? 'advanced' : 'basic',
        max_results: 20,
        include_answer: false,
        include_raw_content: true,
        ...(dateRange ? { start_date: dateRange.start, end_date: dateRange.end } : {}),
        ...(currentAffairs && !dateRange ? { time_range: currentTimeRange } : {}),
      }),
    }).then((data) => {
      if (!Array.isArray(data.results)) throw new Error('Tavily returned an unexpected response.');
      return data.results.map(normalizeTavilyResult).filter(Boolean);
    });
    requests.push(request);
    names.push('Tavily');
  }

  if (braveApiKey) {
    const braveUrl = new URL('https://api.search.brave.com/res/v1/web/search');
    braveUrl.searchParams.set('q', search);
    braveUrl.searchParams.set('count', '20');
    braveUrl.searchParams.set('safesearch', 'moderate');
    braveUrl.searchParams.set('text_decorations', 'false');
    if (dateRange) {
      braveUrl.searchParams.set('freshness', `${dateRange.start}to${dateRange.end}`);
    } else if (currentAffairs) {
      braveUrl.searchParams.set('freshness', currentTimeRange === 'year' ? 'py' : 'pm');
    }
    const request = requestProvider(braveUrl, 'Brave Search', fetchImpl, {
      headers: { 'x-subscription-token': braveApiKey },
    }).then((data) => {
      if (!Array.isArray(data.web?.results)) {
        throw new Error('Brave Search returned an unexpected response.');
      }
      return data.web.results.map(normalizeBraveResult).filter(Boolean);
    });
    requests.push(request);
    names.push('Brave Search');
  }

  const settled = await Promise.allSettled(requests);
  const sources = [];
  const providers = [];
  const warnings = [];
  settled.forEach((result, index) => {
    const provider = names[index];
    if (result.status === 'fulfilled') {
      providers.push(provider);
      sources.push(...result.value);
    } else {
      warnings.push(`${provider}: ${result.reason.message}`);
      console.error(`[research] ${provider} web discovery failed.`);
    }
  });
  if (!tavilyApiKey) warnings.push('Tavily: add TAVILY_API_KEY to the server environment to enable web search.');
  if (!braveApiKey) warnings.push('Brave Search: add BRAVE_SEARCH_API_KEY to the server environment to enable web search.');
  if (!googleSearchApiKey || !googleSearchEngineId) {
    warnings.push(
      'Google Search: set both GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID in the server environment to enable Google web search.',
    );
  }
  return { sources: deduplicateWebSources(sources), providers, warnings };
}

async function discoverVideoSources(question, fetchImpl, {
  region = '',
  year = null,
  month = '',
  fromYear = null,
  toYear = null,
  youtubeApiKey = '',
} = {}) {
  const exactSearch = [question, region].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const search = buildResearchSearchQuery(question, region);
  const broadSearch = compactVideoSearch(question, region);
  const shouldRetryWithCompactTerms = search.toLocaleLowerCase() === exactSearch.toLocaleLowerCase() &&
    broadSearch !== search.toLocaleLowerCase();
  const dateRange = videoDateRange(year, month, fromYear, toYear);

  const fetchPeerTubeQuery = async (instance, query) => {
    const peerTubeUrl = new URL(`https://${instance}/api/v1/search/videos`);
    peerTubeUrl.searchParams.set('search', query);
    peerTubeUrl.searchParams.set('sort', '-match');
    if (dateRange) {
      peerTubeUrl.searchParams.set('startDate', `${dateRange.start}T00:00:00.000Z`);
      peerTubeUrl.searchParams.set('endDate', `${dateRange.end}T23:59:59.999Z`);
    }
    const videos = [];
    const warnings = [];
    let start = 0;
    let total = null;
    let lastPageSize = 0;

    while (videos.length < VIDEO_RESULT_LIMIT) {
      const pageUrl = new URL(peerTubeUrl);
      const pageSize = Math.min(VIDEO_PAGE_SIZE, VIDEO_RESULT_LIMIT - videos.length);
      pageUrl.searchParams.set('count', String(pageSize));
      pageUrl.searchParams.set('start', String(start));

      let data;
      try {
        data = await requestProvider(pageUrl, `PeerTube (${instance})`, fetchImpl);
        if (!Array.isArray(data.data)) throw new Error('PeerTube returned an unexpected response.');
      } catch (error) {
        if (videos.length === 0) throw error;
        warnings.push(`PeerTube (${instance}): a later video results page failed; the ${videos.length} videos already retrieved are shown.`);
        break;
      }

      videos.push(...data.data.map(normalizePeerTubeVideo).filter(Boolean));
      lastPageSize = data.data.length;
      total = Number.isFinite(data.total) ? data.total : total;
      start += data.data.length;

      if (data.data.length < pageSize || (total !== null && start >= total)) break;
    }

    if (videos.length >= VIDEO_RESULT_LIMIT && (total === null ? lastPageSize === VIDEO_PAGE_SIZE : total > start)) {
      warnings.push(`PeerTube (${instance}): results are capped at ${VIDEO_RESULT_LIMIT} videos for this search.`);
    }
    return { provider: `PeerTube (${instance})`, videos: videos.slice(0, VIDEO_RESULT_LIMIT), warnings };
  };
  const fetchPeerTubeVideos = async (instance) => {
    const result = await fetchPeerTubeQuery(instance, search);
    if (result.videos.length || !shouldRetryWithCompactTerms || !broadSearch) return result;

    const broaderResult = await fetchPeerTubeQuery(instance, broadSearch);
    if (broaderResult.videos.length) {
      broaderResult.warnings.unshift(
        `PeerTube (${instance}): no matches for the initial topic terms; results were found with a shorter topic query “${broadSearch}”.`,
      );
      return broaderResult;
    }
    return { ...result, warnings: [...result.warnings, ...broaderResult.warnings] };
  };
  const requests = PEERTUBE_INSTANCES.map((instance) => fetchPeerTubeVideos(instance));
  if (youtubeApiKey) {
    const youtubeUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    youtubeUrl.searchParams.set('part', 'snippet');
    youtubeUrl.searchParams.set('type', 'video');
    youtubeUrl.searchParams.set('maxResults', String(VIDEO_PAGE_SIZE));
    youtubeUrl.searchParams.set('q', search);
    youtubeUrl.searchParams.set('key', youtubeApiKey);
    if (dateRange) {
      youtubeUrl.searchParams.set('publishedAfter', `${dateRange.start}T00:00:00Z`);
      youtubeUrl.searchParams.set('publishedBefore', `${dateRange.end}T23:59:59Z`);
    }
    requests.push((async () => {
      const videos = [];
      const warnings = [];
      let pageToken = '';
      while (videos.length < VIDEO_RESULT_LIMIT) {
        const pageUrl = new URL(youtubeUrl);
        const pageSize = Math.min(VIDEO_PAGE_SIZE, VIDEO_RESULT_LIMIT - videos.length);
        pageUrl.searchParams.set('maxResults', String(pageSize));
        if (pageToken) pageUrl.searchParams.set('pageToken', pageToken);

        let data;
        try {
          data = await requestProvider(pageUrl, 'YouTube', fetchImpl);
          if (!Array.isArray(data.items)) throw new Error('YouTube returned an unexpected response.');
        } catch (error) {
          if (videos.length === 0) throw error;
          warnings.push(`YouTube: a later video results page failed; the ${videos.length} videos already retrieved are shown.`);
          break;
        }

        videos.push(...data.items.map(normalizeYouTubeVideo).filter(Boolean));
        pageToken = typeof data.nextPageToken === 'string' ? data.nextPageToken : '';
        if (!pageToken) break;
      }

      if (videos.length >= VIDEO_RESULT_LIMIT && pageToken) {
        warnings.push(`YouTube: results are capped at ${VIDEO_RESULT_LIMIT} videos for this search.`);
      }
      return { provider: 'YouTube', videos: videos.slice(0, VIDEO_RESULT_LIMIT), warnings };
    })()
      .catch((error) => {
        if (error.message.includes('HTTP 403')) {
          throw new Error('search was denied (HTTP 403); check that YouTube Data API v3 is enabled, the server key is valid, and quota remains.');
        }
        throw error;
      }));
  }

  const settled = await Promise.allSettled(requests);
  const videos = [];
  const providers = [];
  const warnings = [];
  settled.forEach((result, index) => {
    const provider = index < PEERTUBE_INSTANCES.length
      ? `PeerTube (${PEERTUBE_INSTANCES[index]})`
      : 'YouTube';
    if (result.status === 'fulfilled') {
      providers.push(result.value.provider);
      videos.push(...result.value.videos);
      warnings.push(...result.value.warnings);
    } else {
      warnings.push(`${provider}: ${result.reason.message}`);
      console.error(`[research] ${provider} video discovery failed.`);
    }
  });
  if (!youtubeApiKey) {
    warnings.push('YouTube: add YOUTUBE_API_KEY to the server environment to enable YouTube search. Public PeerTube instances are searched without a key.');
  }
  const uniqueVideos = [...new Map(videos.map((video) => [video.url, video])).values()];
  return { videos: uniqueVideos, providers, warnings, failed: settled.every((result) => result.status === 'rejected') };
}

async function discoverSources(question, fetchImpl, {
  region = '',
  year = null,
  month = '',
  fromYear = null,
  toYear = null,
  sourceLimit = SOURCE_LIMIT_ALL,
  tavilyApiKey = '',
  braveApiKey = '',
  googleSearchApiKey = '',
  googleSearchEngineId = '',
  youtubeApiKey = '',
  sourceCursors = null,
  includeAuxiliarySources = true,
} = {}) {
  const allSources = sourceLimit === SOURCE_LIMIT_ALL;
  const resultLimit = allSources ? Infinity : sourceLimit;
  const cursorState = sourceCursors ?? {
    openAlex: '*',
    crossref: '*',
    semanticScholar: 0,
  };
  const openAlexUrl = new URL('https://api.openalex.org/works');
  const openAlexSearch = buildResearchSearchQuery(question, region).replace(/[?*]/g, ' ');
  openAlexUrl.searchParams.set('search', openAlexSearch);
  openAlexUrl.searchParams.set('per-page', String(allSources ? 100 : sourceLimit));
  openAlexUrl.searchParams.set(
    'select',
    'id,doi,title,publication_year,publication_date,authorships,primary_location,open_access,cited_by_count,abstract_inverted_index',
  );
  const rangeStartYear = fromYear || year;
  const rangeEndYear = toYear || rangeStartYear;
  if (rangeStartYear && rangeEndYear) {
    if (rangeStartYear === rangeEndYear && month) {
      const monthNumber = MONTHS.indexOf(month) + 1;
      const monthStart = `${rangeStartYear}-${String(monthNumber).padStart(2, '0')}-01`;
      const monthEnd = new Date(Date.UTC(rangeStartYear, monthNumber, 0)).toISOString().slice(0, 10);
      openAlexUrl.searchParams.set('filter', `from_publication_date:${monthStart},to_publication_date:${monthEnd}`);
    } else {
      openAlexUrl.searchParams.set('filter', `from_publication_date:${rangeStartYear}-01-01,to_publication_date:${rangeEndYear}-12-31`);
    }
  }
  if (process.env.OPENALEX_MAILTO) {
    openAlexUrl.searchParams.set('mailto', process.env.OPENALEX_MAILTO);
  }

  const crossrefUrl = new URL('https://api.crossref.org/works');
  crossrefUrl.searchParams.set('query.bibliographic', buildResearchSearchQuery(question, region));
  crossrefUrl.searchParams.set('rows', String(allSources ? 100 : sourceLimit));
  crossrefUrl.searchParams.set(
    'select',
    'DOI,title,author,published,container-title,URL,type,abstract,publisher,is-referenced-by-count',
  );
  if (rangeStartYear && rangeEndYear) {
    const monthNumber = month ? MONTHS.indexOf(month) + 1 : null;
    const fromDate = rangeStartYear === rangeEndYear && month
      ? `${rangeStartYear}-${String(monthNumber).padStart(2, '0')}-01`
      : `${rangeStartYear}-01-01`;
    const throughDate = rangeStartYear === rangeEndYear && month
      ? new Date(Date.UTC(rangeStartYear, monthNumber, 0)).toISOString().slice(0, 10)
      : `${rangeEndYear}-12-31`;
    crossrefUrl.searchParams.set('from-pub-date', fromDate);
    crossrefUrl.searchParams.set('until-pub-date', throughDate);
  }
  if (process.env.CROSSREF_MAILTO) {
    crossrefUrl.searchParams.set('mailto', process.env.CROSSREF_MAILTO);
  }

  const semanticScholarUrl = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
  semanticScholarUrl.searchParams.set('query', buildResearchSearchQuery(question, region));
  semanticScholarUrl.searchParams.set('limit', String(allSources ? 100 : sourceLimit));
  semanticScholarUrl.searchParams.set(
    'fields',
    'paperId,title,abstract,year,authors,venue,publicationDate,citationCount,externalIds,openAccessPdf',
  );
  if (rangeStartYear && rangeEndYear) {
    semanticScholarUrl.searchParams.set(
      'year',
      rangeStartYear === rangeEndYear ? String(rangeStartYear) : `${rangeStartYear}-${rangeEndYear}`,
    );
  }

  const semanticScholarHeaders = process.env.SEMANTIC_SCHOLAR_API_KEY
    ? { 'x-api-key': process.env.SEMANTIC_SCHOLAR_API_KEY }
    : null;
  const openAlexRequest = (allSources
    ? cursorState.openAlex === null
      ? Promise.resolve({ works: [], nextCursor: null, warnings: [] })
      : fetchOpenAlexPage(openAlexUrl, fetchImpl, cursorState.openAlex)
        .then((page) => ({ ...page, warnings: page.warnings ?? [] }))
    : requestProvider(openAlexUrl, 'OpenAlex', fetchImpl).then((data) => {
      if (!Array.isArray(data.results)) throw new Error('OpenAlex returned an unexpected response.');
      return { works: data.results, nextCursor: null, warnings: [] };
    }));
  const crossrefRequest = (allSources
    ? cursorState.crossref === null
      ? Promise.resolve({ works: [], nextCursor: null, warnings: [] })
      : fetchCrossrefPage(crossrefUrl, fetchImpl, cursorState.crossref)
        .then((page) => ({ ...page, warnings: page.warnings ?? [] }))
    : requestProvider(crossrefUrl, 'Crossref', fetchImpl).then((data) => {
      if (!Array.isArray(data.message?.items)) {
        throw new Error('Crossref returned an unexpected response.');
      }
      return { works: data.message.items, nextCursor: null, warnings: [] };
    }));
  const semanticScholarRequest = allSources
    ? cursorState.semanticScholar === null
      ? Promise.resolve({ works: [], nextCursor: null, warnings: [] })
      : fetchSemanticScholarPage(semanticScholarUrl, (url, options) =>
        fetchImpl(url, { ...options, headers: { ...options.headers, ...semanticScholarHeaders } }),
      cursorState.semanticScholar)
        .then((page) => ({ ...page, warnings: page.warnings ?? [] }))
    : requestProvider(semanticScholarUrl, 'Semantic Scholar', (url, options) =>
      fetchImpl(url, { ...options, headers: { ...options.headers, ...semanticScholarHeaders } }))
      .then((data) => {
        if (!Array.isArray(data.data)) {
          throw new Error('Semantic Scholar returned an unexpected response.');
        }
        return { works: data.data, nextCursor: null, warnings: [] };
      });
  const [providerResults, videoDiscovery, webDiscovery] = await Promise.all([
    Promise.allSettled([
      openAlexRequest,
      crossrefRequest,
      semanticScholarRequest,
    ]),
    includeAuxiliarySources ? discoverVideoSources(question, fetchImpl, {
      region, year, month, fromYear, toYear, youtubeApiKey,
    }) : Promise.resolve({ videos: [], providers: [], warnings: [], failed: false }),
    includeAuxiliarySources ? discoverWebSources(question, fetchImpl, {
      region,
      year,
      month,
      fromYear,
      toYear,
      tavilyApiKey,
      braveApiKey,
      googleSearchApiKey,
      googleSearchEngineId,
    }) : Promise.resolve({ sources: [], providers: [], warnings: [], failed: false }),
  ]);
  const warnings = [];
  const catalogs = { openAlex: [], crossref: [], semanticScholar: [] };
  const nextSourceCursors = { ...cursorState };

  providerResults.forEach((result, index) => {
    const provider = ['OpenAlex', 'Crossref', 'Semantic Scholar'][index];
    if (result.status === 'rejected') {
      warnings.push(`${provider}: ${result.reason.message}`);
      console.error(`[research] ${provider} discovery failed.`);
      if (allSources && cursorState[['openAlex', 'crossref', 'semanticScholar'][index]] === '*') {
        nextSourceCursors[['openAlex', 'crossref', 'semanticScholar'][index]] =
          index === 2 ? 0 : '*';
      }
    } else if (index === 0) {
      catalogs.openAlex = result.value.works;
      nextSourceCursors.openAlex = result.value.nextCursor;
      warnings.push(...result.value.warnings);
    } else if (index === 1) {
      catalogs.crossref = result.value.works;
      nextSourceCursors.crossref = result.value.nextCursor;
      warnings.push(...result.value.warnings);
    } else {
      catalogs.semanticScholar = result.value.works;
      nextSourceCursors.semanticScholar = result.value.nextCursor;
      warnings.push(...result.value.warnings);
    }
  });

  if (
    providerResults.every((result) => result.status === 'rejected') &&
    includeAuxiliarySources &&
    videoDiscovery.failed &&
    webDiscovery.providers.length === 0
  ) {
    const catalogFailures = providerResults
      .filter((result) => result.status === 'rejected')
      .map((result, index) => `${['OpenAlex', 'Crossref', 'Semantic Scholar'][index]}: ${result.reason.message}`);
    const error = new Error(
      `The scholarly catalogs, web search, and video discovery were unavailable. ${[...catalogFailures, ...videoDiscovery.warnings, ...webDiscovery.warnings].join(' ')} Check your connection and retry; configure provider API keys to enable optional searches.`,
    );
    error.step = 'discovery';
    throw error;
  }

  return {
    sources: normalizeSources(
      catalogs.openAlex,
      catalogs.crossref,
      resultLimit,
      catalogs.semanticScholar,
    ),
    videos: videoDiscovery.videos,
    webSources: webDiscovery.sources,
    warnings,
    videoWarnings: videoDiscovery.warnings,
    webWarnings: webDiscovery.warnings,
    providers: providerResults.flatMap((result, index) =>
      result.status === 'fulfilled' ? [['OpenAlex', 'Crossref', 'Semantic Scholar'][index]] : [],
    ),
    videoProviders: videoDiscovery.providers,
    webProviders: webDiscovery.providers,
    sourceCursors: allSources ? nextSourceCursors : null,
  };
}

function contentTypeFor(path) {
  const types = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
  };
  return types[extname(path)] || 'application/octet-stream';
}

function serveFrontend(request, response) {
  if (!existsSync(DIST)) {
    sendJson(response, 404, {
      error: 'The frontend has not been built yet. Run npm run build, then restart the server.',
    });
    return;
  }

  let requestedPath;
  try {
    requestedPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    sendJson(response, 400, { error: 'This page address is not valid.' });
    return;
  }
  const safePath = normalize(requestedPath).replace(/^(\.\.[\\/])+/, '');
  let filePath = resolve(DIST, `.${safePath}`);
  if (!filePath.startsWith(`${DIST}${process.platform === 'win32' ? '\\' : '/'}`) && filePath !== DIST) {
    sendJson(response, 403, { error: 'This path is not available.' });
    return;
  }
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(DIST, 'index.html');
  }
  if (!existsSync(filePath)) {
    sendJson(response, 404, { error: 'The requested page was not found.' });
    return;
  }

  response.writeHead(200, {
    'content-type': contentTypeFor(filePath),
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  createReadStream(filePath).pipe(response);
}

export function createRequestHandler({
  fetchImpl = globalThis.fetch,
  tavilyApiKey = process.env.TAVILY_API_KEY || '',
  braveApiKey = process.env.BRAVE_SEARCH_API_KEY || '',
  googleSearchApiKey = process.env.GOOGLE_SEARCH_API_KEY || '',
  googleSearchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID || '',
  youtubeApiKey = process.env.YOUTUBE_API_KEY || '',
  anthropicApiKey = process.env.ANTHROPIC_API_KEY || '',
  anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
} = {}) {
  const requestsByAddress = new Map();
  const aiRequestsByAddress = new Map();
  const trendingCache = { value: null, expiresAt: 0, pending: null };

  return async (request, response) => {
    const url = new URL(request.url, 'http://localhost');

    if (url.pathname === '/api/health' && request.method === 'GET') {
      sendJson(response, 200, {
        status: 'ok',
        providers: ['OpenAlex', 'Crossref', 'Semantic Scholar'],
        videoProviders: {
          youtube: Boolean(youtubeApiKey),
          peerTube: true,
        },
        webProviders: {
          tavily: Boolean(tavilyApiKey),
          brave: Boolean(braveApiKey),
          google: Boolean(googleSearchApiKey && googleSearchEngineId),
        },
        aiProviders: {
          anthropic: Boolean(anthropicApiKey),
          model: anthropicModel,
        },
      });
      return;
    }

    if (url.pathname === '/api/discover/trending' && request.method === 'GET') {
      if (trendingCache.value && Date.now() < trendingCache.expiresAt) {
        sendJson(response, 200, trendingCache.value);
        return;
      }
      try {
        trendingCache.pending ??= discoverTrending(fetchImpl, youtubeApiKey);
        const result = await trendingCache.pending;
        trendingCache.value = result;
        trendingCache.expiresAt = Date.now() + 10 * 60 * 1000;
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, error.status || 502, {
          error: error.message || 'Trending discovery could not be completed.',
        });
      } finally {
        trendingCache.pending = null;
      }
      return;
    }

    if (url.pathname === '/api/research/topic-overview' && request.method === 'POST') {
      const address = request.socket?.remoteAddress || 'unknown';
      const now = Date.now();
      const current = aiRequestsByAddress.get(address);
      if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
        aiRequestsByAddress.set(address, { startedAt: now, count: 0 });
      }
      const limit = aiRequestsByAddress.get(address);
      limit.count += 1;
      if (limit.count > 10) {
        sendJson(response, 429, {
          error: 'Too many AI requests were sent from this device. Please wait 15 minutes and try again.',
        });
        return;
      }

      try {
        const body = await readJson(request);
        const validationError = validateAiTopicOverviewRequest(body);
        if (validationError) {
          sendJson(response, 400, { error: validationError });
          return;
        }
        const overview = await generateAiTopicOverview({
          question: body.question.trim(),
          sources: body.sources,
          apiKey: anthropicApiKey,
          model: anthropicModel,
          fetchImpl,
        });
        sendJson(response, 200, overview);
      } catch (error) {
        sendJson(response, error.status || 502, {
          error: error.message || 'AI topic overview could not be generated.',
        });
      }
      return;
    }

    if (url.pathname === '/api/research/ai-relevance' && request.method === 'POST') {
      const address = request.socket?.remoteAddress || 'unknown';
      const now = Date.now();
      const current = aiRequestsByAddress.get(address);
      if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
        aiRequestsByAddress.set(address, { startedAt: now, count: 0 });
      }
      const limit = aiRequestsByAddress.get(address);
      limit.count += 1;
      if (limit.count > 10) {
        sendJson(response, 429, {
          error: 'Too many AI relevance requests were sent from this device. Please wait 15 minutes and try again.',
        });
        return;
      }

      try {
        const body = await readJson(request);
        const validationError = validateAiRelevanceRequest(body);
        if (validationError) {
          sendJson(response, 400, { error: validationError });
          return;
        }
        const evaluations = await assessSourceRelevance({
          question: body.question.trim(),
          sources: body.sources,
          apiKey: anthropicApiKey,
          model: anthropicModel,
          fetchImpl,
        });
        sendJson(response, 200, { evaluations, model: anthropicModel });
      } catch (error) {
        sendJson(response, error.status || 502, {
          error: error.message || 'AI relevance assessment could not be completed.',
        });
      }
      return;
    }

    if (
      (url.pathname === '/api/research' || url.pathname === '/api/research/continue') &&
      request.method === 'POST'
    ) {
      const address = request.socket.remoteAddress || 'unknown';
      const now = Date.now();
      const current = requestsByAddress.get(address);
      if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
        requestsByAddress.set(address, { startedAt: now, count: 0 });
      }
      const limit = requestsByAddress.get(address);
      limit.count += 1;
      if (limit.count > RATE_LIMIT) {
        sendJson(response, 429, {
          step: 'request',
          error: 'Too many research requests were sent from this device. Please wait 15 minutes and try again.',
        });
        return;
      }

      try {
        const body = await readJson(request);
        const validationError = validateResearchRequest(body);
        if (validationError) {
          sendJson(response, 400, { step: 'validation', error: validationError });
          return;
        }
        const continuing = url.pathname === '/api/research/continue';
        if (continuing) {
          const cursors = body.sourceCursors;
          const validCursor = (cursor) => cursor === null ||
            (typeof cursor === 'string' && cursor.length > 0 && cursor.length <= 2048);
          if (
            body.sourceLimit !== SOURCE_LIMIT_ALL ||
            !cursors ||
            typeof cursors !== 'object' ||
            Array.isArray(cursors) ||
            !validCursor(cursors.openAlex) ||
            !validCursor(cursors.crossref) ||
            !(cursors.semanticScholar === null ||
              (Number.isInteger(cursors.semanticScholar) &&
                cursors.semanticScholar >= 0 &&
                cursors.semanticScholar <= 10000 &&
                cursors.semanticScholar % 100 === 0)) ||
            (cursors.openAlex === null &&
              cursors.crossref === null &&
              cursors.semanticScholar === null)
          ) {
            sendJson(response, 400, {
              step: 'validation',
              error: 'The source continuation cursor is invalid or there are no more source pages.',
            });
            return;
          }
        }

        const question = body.question.trim();
        const region = typeof body.region === 'string' ? body.region.trim() : '';
        const year = body.year ? Number(body.year) : null;
        const month = body.month || '';
        const sourceLimit = body.sourceLimit ?? SOURCE_LIMIT_ALL;
        const purposes = [...new Set(body.purposes)];
        const fromYear = body.fromYear ? Number(body.fromYear) : null;
        const toYear = body.toYear ? Number(body.toYear) : null;
        const analysis = analyzeQuestion(question, purposes, {
          region, year, month, fromYear, toYear,
        });
        const discovery = await discoverSources(question, fetchImpl, {
          region,
          year,
          month,
          fromYear,
          toYear,
          sourceLimit,
          ...(continuing ? {
            sourceCursors: body.sourceCursors,
            includeAuxiliarySources: false,
          } : {}),
          tavilyApiKey,
          braveApiKey,
          googleSearchApiKey,
          googleSearchEngineId,
          youtubeApiKey,
        });
        const result = {
          question,
          scope: {
            region,
            year,
            month,
            ...(fromYear ? { fromYear, toYear } : {}),
            sourceLimit,
          },
          analysis,
          sources: discovery.sources,
          videos: discovery.videos,
          webSources: discovery.webSources,
          providers: discovery.providers,
          videoProviders: discovery.videoProviders,
          webProviders: discovery.webProviders,
          warnings: discovery.warnings,
          videoWarnings: discovery.videoWarnings,
          webWarnings: discovery.webWarnings,
          retrievedAt: new Date().toISOString(),
          sourceCursors: discovery.sourceCursors,
        };
        sendJson(response, 200, continuing ? {
          sources: result.sources,
          sourceCursors: result.sourceCursors,
          warnings: result.warnings,
          providers: result.providers,
        } : result);
      } catch (error) {
        const status = error.status || (error.step === 'discovery' ? 502 : 400);
        sendJson(response, status, {
          step: error.step || 'request',
          error: error.step === 'discovery'
            ? error.message
            : status === 413
              ? error.message
              : status === 400
                ? error.message
                : 'The research request could not be completed. Please try again.',
        });
      }
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: 'This API route was not found.' });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { error: 'This method is not supported.' });
      return;
    }
    serveFrontend(request, response);
  };
}

export function createServer(options = {}) {
  return createHttpServer(createRequestHandler(options));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3001);
  const server = createServer();
  server.on('error', (error) => {
    console.error(
      error.code === 'EADDRINUSE'
        ? `Research API could not start: port ${port} is already in use.`
        : `Research API could not start: ${error.message}`,
    );
    process.exitCode = 1;
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`Research API listening on http://localhost:${port}`);
  });
}
