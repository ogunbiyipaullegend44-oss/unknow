import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestHandler, createServer } from '../server/index.js';
import {
  analyzeQuestion,
  normalizeSources,
  validateResearchRequest,
} from '../server/research.js';
import { buildResearchSearchQuery } from '../src/utils/researchQuery.js';

test('Vercel-compatible handler accepts a parsed JSON request body', async () => {
  const response = {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
  const handler = createRequestHandler();

  await handler({
    url: '/api/research',
    method: 'POST',
    body: { question: 'short', purposes: ['general'] },
    socket: { remoteAddress: '127.0.0.1' },
  }, response);

  assert.equal(response.status, 400);
  assert.match(JSON.parse(response.body).error, /8 characters/);
});

test('research provider queries keep recurring topic words and drop question filler', () => {
  const question = 'Please research renewable energy policy and explain how renewable energy policy affects grid storage and offshore wind deployment across recent national programs and funding initiatives.';
  const query = buildResearchSearchQuery(question);

  assert.ok(query.includes('renewable'));
  assert.ok(query.includes('energy'));
  assert.ok(query.includes('policy'));
  assert.ok(query.includes('offshore'));
  assert.ok(!query.includes('please'));
  assert.ok(!query.includes('explain'));
  assert.ok(!query.includes('research'));
  assert.ok(query.split(' ').length <= 10);
});

test('provider searches use compact topic terms for long questions', async (t) => {
  const providerUrls = [];
  const server = createServer({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      providerUrls.push(parsed);
      if (parsed.hostname === 'api.openalex.org') {
        return Response.json({ results: [], meta: { next_cursor: null } });
      }
      if (parsed.hostname === 'api.crossref.org') {
        return Response.json({ message: { items: [], 'next-cursor': null } });
      }
      if (parsed.hostname === 'api.semanticscholar.org') return Response.json({ data: [] });
      if (parsed.hostname === 'peertube.tv') return Response.json({ data: [], total: 0 });
      return Response.json({});
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'Please research renewable energy policy and explain how renewable energy policy affects grid storage and offshore wind deployment across recent national programs and funding initiatives.',
      purposes: ['general'],
    }),
  });
  const body = await response.json();
  const providerQueries = [
    providerUrls.find((url) => url.hostname === 'api.openalex.org')?.searchParams.get('search'),
    providerUrls.find((url) => url.hostname === 'api.crossref.org')?.searchParams.get('query.bibliographic'),
    providerUrls.find((url) => url.hostname === 'api.semanticscholar.org')?.searchParams.get('query'),
    providerUrls.find((url) => url.hostname === 'peertube.tv')?.searchParams.get('search'),
  ];

  assert.equal(response.status, 200);
  assert.ok(body.question.startsWith('Please research renewable energy policy'));
  for (const query of providerQueries) {
    assert.ok(query);
    assert.ok(query.includes('renewable'));
    assert.ok(query.includes('offshore'));
    assert.ok(!query.includes('please'));
    assert.ok(!query.includes('explain'));
  }
});

test('research provider retries once when a request times out', async (t) => {
  let openAlexRequests = 0;
  const server = createServer({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'api.openalex.org') {
        openAlexRequests += 1;
        if (openAlexRequests === 1) {
          throw new DOMException('The operation timed out.', 'TimeoutError');
        }
        return Response.json({ results: [], meta: { next_cursor: null } });
      }
      if (parsed.hostname === 'api.crossref.org') {
        return Response.json({ message: { items: [], 'next-cursor': null } });
      }
      if (parsed.hostname === 'api.semanticscholar.org') return Response.json({ data: [] });
      if (parsed.hostname === 'peertube.tv') return Response.json({ data: [], total: 0 });
      return Response.json({});
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'How does education access change?',
      purposes: ['general'],
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(openAlexRequests, 2);
  assert.ok(body.providers.includes('OpenAlex'));
});

test('request validation rejects missing or unsupported research input', () => {
  assert.match(validateResearchRequest({ question: 'short', purposes: ['academic'] }), /8 characters/);
  assert.equal(validateResearchRequest({
    question: `A useful question ${'with many details '.repeat(100)}`,
    purposes: ['academic'],
  }), null);
  assert.match(validateResearchRequest({ question: 'A useful question', purposes: ['unknown'] }), /not supported/);
  assert.match(validateResearchRequest({ question: 'A useful question', purposes: [] }), /one or more/);
  assert.equal(validateResearchRequest({ question: 'A useful question', purposes: ['academic'] }), null);
  assert.match(validateResearchRequest({
    question: 'A useful question',
    purposes: ['academic'],
    sourceLimit: 101,
  }), /20, 50, or 100/);
  assert.equal(validateResearchRequest({
    question: 'A useful question',
    purposes: ['academic'],
    sourceLimit: 'all',
  }), null);
  assert.match(validateResearchRequest({
    question: 'A useful question',
    purposes: ['academic'],
    month: 'February',
  }), /year before selecting a month/);
  assert.match(validateResearchRequest({
    question: 'A useful question',
    purposes: ['academic'],
    year: 1899,
  }), /valid year/);
  assert.equal(validateResearchRequest({
    question: 'A useful question',
    purposes: ['academic'],
    fromYear: 2014,
    toYear: 2026,
  }), null);
  assert.match(validateResearchRequest({
    question: 'A useful question',
    purposes: ['academic'],
    fromYear: 2026,
    toYear: 2014,
  }), /start year must be before/);
  assert.match(validateResearchRequest({
    question: 'A useful question',
    purposes: ['academic'],
    fromYear: 2014,
  }), /both a start year and an end year/);
});

test('question planning preserves explicit scope and labels its method', () => {
  const plan = analyzeQuestion(
    'How does education funding affect students in Nigeria from 2019 to 2024?',
    ['academic'],
  );

  assert.equal(plan.method, 'Rule-based planning (no AI model used)');
  assert.equal(plan.geographicScope, 'Nigeria');
  assert.equal(plan.timePeriod, '2019 to 2024');
  assert.ok(!plan.keywords.includes('does'));
  assert.equal(plan.purposes[0], 'academic');
  assert.ok(plan.researchAreas.length >= 3);
});

test('research map areas adapt their prompts to the question domain', () => {
  const health = analyzeQuestion('How does air pollution affect asthma rates in Nairobi?', ['academic']);
  const technology = analyzeQuestion('How does artificial intelligence affect hiring decisions?', ['academic']);

  assert.ok(health.researchAreas.length > 4);
  assert.ok(technology.researchAreas.length > 4);
  assert.ok(health.researchAreas.some((area) => /risk factors and exposure/i.test(area.title)));
  assert.ok(health.researchAreas.some((area) => /prevention, diagnosis, and care/i.test(area.title)));
  assert.ok(health.researchAreas.every((area) => area.questions.every((question) => /asthma|air pollution/i.test(question))));
  assert.ok(technology.researchAreas.some((area) => /adoption and use/i.test(area.title)));
  assert.ok(technology.researchAreas.some((area) => /governance, privacy, and accountability/i.test(area.title)));
  assert.ok(health.researchAreas.some((area) => /stakeholder experiences/i.test(area.title)));
  assert.ok(technology.researchAreas.some((area) => /unintended effects/i.test(area.title)));
  assert.notDeepEqual(
    health.researchAreas.map((area) => area.title),
    technology.researchAreas.map((area) => area.title),
  );
});

test('general research questions receive additional avenues beyond the core research map areas', () => {
  const plan = analyzeQuestion('How do public libraries support adult literacy?', ['general']);
  const titles = plan.researchAreas.map(({ title }) => title);

  assert.ok(plan.researchAreas.length > 4);
  assert.equal(new Set(titles).size, titles.length);
  assert.ok(plan.researchAreas.every(({ description, questions }) => description && questions.length >= 2));
  assert.ok(plan.researchAreas.some(({ title }) => /historical development/i.test(title)));
  assert.ok(plan.researchAreas.some(({ title }) => /costs and resource requirements/i.test(title)));
});

test('geographic scope avoids reporting a region and its parent as separate places', () => {
  const plan = analyzeQuestion('Education access in West Africa', ['general']);
  assert.equal(plan.geographicScope, 'West Africa');
});

test('explicit region and month/year override automatic scope in research planning', () => {
  const plan = analyzeQuestion('Education access outcomes', ['general'], {
    region: 'Nairobi, Kenya',
    year: 2024,
    month: 'March',
  });
  assert.equal(plan.geographicScope, 'Nairobi, Kenya');
  assert.equal(plan.timePeriod, 'March 2024');
});

test('source normalization deduplicates matching DOI records and keeps metadata provenance', () => {
  const sources = normalizeSources(
    [{
      id: 'https://openalex.org/W1',
      doi: 'https://doi.org/10.1234/example',
      title: 'A real indexed record',
      publication_year: 2022,
      authorships: [],
      primary_location: { landing_page_url: 'https://example.org/paper' },
      open_access: { is_oa: false },
      abstract_inverted_index: { Abstract: [0], available: [1] },
    }],
    [{
      DOI: '10.1234/example',
      title: ['A real indexed record'],
      author: [{ given: 'Alex', family: 'Author' }],
      published: { 'date-parts': [[2022]] },
      URL: 'https://doi.org/10.1234/example',
      publisher: 'Example Publisher',
      abstract: '<jats:p>Crossref abstract.</jats:p>',
      'is-referenced-by-count': 12,
    }],
  );

  assert.equal(sources.length, 1);
  assert.equal(sources[0].id, 'doi:10.1234/example');
  assert.match(sources[0].metadataSource, /OpenAlex and Crossref/);
  assert.match(sources[0].abstract, /Abstract available/);
  assert.equal(sources[0].citationCount, 12);
});

test('source normalization rejects non-HTTP publisher URLs', () => {
  const sources = normalizeSources([{
    id: 'javascript:alert(1)',
    doi: null,
    title: 'Untrusted URL record',
    primary_location: { landing_page_url: 'javascript:alert(1)' },
    authorships: [],
  }]);

  assert.deepEqual(sources, []);
});

test('research API returns real-provider-shaped results and explains the search scope', async (t) => {
  let openAlexSearch = '';
  const server = createServer({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'api.openalex.org') {
        openAlexSearch = parsed.searchParams.get('search');
        return Response.json({
          results: [{
            id: 'https://openalex.org/W123',
            doi: 'https://doi.org/10.5555/test',
            title: 'Education outcomes in Ghana',
            publication_year: 2023,
            authorships: [],
            primary_location: { landing_page_url: 'https://example.org/ghana' },
            open_access: { is_oa: false },
            abstract_inverted_index: null,
          }],
          meta: { next_cursor: null },
        });
      }
      if (parsed.hostname === 'api.crossref.org') {
        return Response.json({ message: { items: [], 'next-cursor': null } });
      }
      return Response.json({
        data: [{
          paperId: 'semantic-paper-1',
          title: 'Education outcomes in Ghana',
          abstract: 'Semantic Scholar abstract.',
          year: 2023,
          authors: [{ name: 'Alex Author' }],
          venue: 'Education Journal',
          publicationDate: '2023-04-10',
          citationCount: 8,
          externalIds: { DOI: '10.5555/test' },
          openAccessPdf: { url: 'https://example.org/open-paper.pdf' },
        }],
      });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'Education outcomes in Ghana',
      purposes: ['assignment'],
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.providers, ['OpenAlex', 'Crossref', 'Semantic Scholar']);
  assert.equal(body.sources[0].title, 'Education outcomes in Ghana');
  assert.equal(body.sources[0].url, 'https://doi.org/10.5555/test');
  assert.equal(body.sources.length, 1);
  assert.equal(body.sources[0].metadataSource, 'OpenAlex and Semantic Scholar');
  assert.equal(body.sources[0].citationCount, 8);
  assert.equal(body.sources[0].abstract, 'Semantic Scholar abstract.');
  assert.equal(body.sources[0].openAccessUrl, 'https://example.org/open-paper.pdf');
  assert.deepEqual(body.scope, { region: '', year: null, month: '', sourceLimit: 'all' });
  assert.equal(body.analysis.geographicScope, 'Ghana');
  assert.equal(openAlexSearch, 'Education outcomes in Ghana');
  assert.equal(body.sources.length, 1);
});

test('research API applies the selected region, year, and month to all catalogs', async (t) => {
  const providerUrls = [];
  const server = createServer({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      providerUrls.push(parsed);
      if (parsed.hostname === 'api.openalex.org') {
        return Response.json({ results: [], meta: { next_cursor: null } });
      }
      if (parsed.hostname === 'api.crossref.org') {
        return Response.json({ message: { items: [], 'next-cursor': null } });
      }
      return Response.json({ data: [] });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'Education access outcomes',
      purposes: ['general'],
      region: 'Nairobi, Kenya',
      year: 2024,
      month: 'March',
      sourceLimit: 100,
    }),
  });
  const body = await response.json();
  const openAlex = providerUrls.find((url) => url.hostname === 'api.openalex.org');
  const crossref = providerUrls.find((url) => url.hostname === 'api.crossref.org');
  const semanticScholar = providerUrls.find((url) => url.hostname === 'api.semanticscholar.org');

  assert.equal(response.status, 200);
  assert.deepEqual(body.scope, {
    region: 'Nairobi, Kenya',
    year: 2024,
    month: 'March',
    sourceLimit: 100,
  });
  assert.equal(body.analysis.geographicScope, 'Nairobi, Kenya');
  assert.equal(body.analysis.timePeriod, 'March 2024');
  assert.match(openAlex.searchParams.get('search'), /Nairobi, Kenya/);
  assert.equal(
    openAlex.searchParams.get('filter'),
    'from_publication_date:2024-03-01,to_publication_date:2024-03-31',
  );
  assert.equal(crossref.searchParams.get('query.bibliographic'), 'Education access outcomes Nairobi, Kenya');
  assert.equal(openAlex.searchParams.get('per-page'), '100');
  assert.equal(crossref.searchParams.get('rows'), '100');
  assert.equal(crossref.searchParams.get('from-pub-date'), '2024-03-01');
  assert.equal(crossref.searchParams.get('until-pub-date'), '2024-03-31');
  assert.equal(semanticScholar.searchParams.get('query'), 'Education access outcomes Nairobi, Kenya');
  assert.equal(semanticScholar.searchParams.get('year'), '2024');
  assert.equal(semanticScholar.searchParams.get('limit'), '100');
});

test('research API applies a selected year range to every provider', async (t) => {
  const providerUrls = [];
  const server = createServer({
    tavilyApiKey: 'test-tavily',
    braveApiKey: 'test-brave',
    youtubeApiKey: 'test-youtube',
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      providerUrls.push(parsed);
      if (parsed.hostname === 'api.openalex.org') {
        return Response.json({ results: [], meta: { next_cursor: null } });
      }
      if (parsed.hostname === 'api.crossref.org') {
        return Response.json({ message: { items: [], 'next-cursor': null } });
      }
      if (parsed.hostname === 'api.semanticscholar.org') {
        return Response.json({ data: [], total: 0 });
      }
      if (parsed.hostname === 'www.googleapis.com') return Response.json({ items: [] });
      if (parsed.hostname === 'api.search.brave.com') {
        return Response.json({ web: { results: [] } });
      }
      if (parsed.hostname === 'api.tavily.com') return Response.json({ results: [] });
      return Response.json({ data: [] });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'Clean energy investment trends',
      purposes: ['general'],
      sourceLimit: 50,
      fromYear: 2014,
      toYear: 2026,
    }),
  });
  const body = await response.json();
  const byHost = (host) => providerUrls.find((url) => url.hostname === host);

  assert.equal(response.status, 200);
  assert.deepEqual(body.scope, {
    region: '',
    year: null,
    month: '',
    fromYear: 2014,
    toYear: 2026,
    sourceLimit: 50,
  });
  assert.equal(body.analysis.timePeriod, '2014-2026');
  assert.equal(
    byHost('api.openalex.org').searchParams.get('filter'),
    'from_publication_date:2014-01-01,to_publication_date:2026-12-31',
  );
  assert.equal(byHost('api.crossref.org').searchParams.get('from-pub-date'), '2014-01-01');
  assert.equal(byHost('api.crossref.org').searchParams.get('until-pub-date'), '2026-12-31');
  assert.equal(byHost('api.semanticscholar.org').searchParams.get('year'), '2014-2026');
  assert.equal(byHost('peertube.tv').searchParams.get('startDate'), '2014-01-01T00:00:00.000Z');
  assert.equal(byHost('peertube.tv').searchParams.get('endDate'), '2026-12-31T23:59:59.999Z');
  assert.equal(byHost('www.googleapis.com').searchParams.get('publishedAfter'), '2014-01-01T00:00:00Z');
  assert.equal(byHost('www.googleapis.com').searchParams.get('publishedBefore'), '2026-12-31T23:59:59Z');
  assert.equal(byHost('api.search.brave.com').searchParams.get('freshness'), '2014-01-01to2026-12-31');
});

test('research API returns more than 20 results up to the requested source limit', async (t) => {
  const server = createServer({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'api.openalex.org') {
        return Response.json({
          results: Array.from({ length: 60 }, (_, index) => ({
            id: `https://openalex.org/W${index}`,
            doi: `https://doi.org/10.5555/source-${index}`,
            title: `Education outcome source ${index}`,
            publication_year: 2024,
            authorships: [],
            primary_location: { landing_page_url: `https://example.org/source-${index}` },
            open_access: { is_oa: false },
            abstract_inverted_index: null,
            cited_by_count: index,
          })),
        });
      }
      if (parsed.hostname === 'api.crossref.org') {
        return Response.json({ message: { items: [] } });
      }
      return Response.json({ data: [] });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'Education outcome sources',
      purposes: ['general'],
      sourceLimit: 50,
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.sources.length, 50);
  assert.equal(body.sources[0].doi, '10.5555/source-0');
  assert.equal(body.sources[0].citationCount, 0);
  assert.equal(body.scope.sourceLimit, 50);
});

test('unlimited research loads one bounded page per catalog and exposes continuation cursors', async (t) => {
  const requestedUrls = [];
  const openAlexWorks = (start, count) => Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    return {
      id: `https://openalex.org/W${index}`,
      doi: `https://doi.org/10.5555/all-${index}`,
      title: `Uncapped source ${index}`,
      publication_year: 2024,
      authorships: [],
      primary_location: { landing_page_url: `https://example.org/all-${index}` },
      open_access: { is_oa: false },
      abstract_inverted_index: null,
    };
  });
  const semanticScholarWorks = (start, count) => Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    return {
      paperId: `semantic-${index}`,
      title: `Semantic Scholar source ${index}`,
      year: 2024,
      authors: [],
      externalIds: { DOI: `10.5555/semantic-${index}` },
    };
  });
  const crossrefWorks = (start, count) => Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    return {
      DOI: `10.5555/crossref-${index}`,
      title: [`Crossref source ${index}`],
      URL: `https://doi.org/10.5555/crossref-${index}`,
      author: [],
      published: { 'date-parts': [[2024]] },
    };
  });
  const server = createServer({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      requestedUrls.push(parsed);
      if (parsed.hostname === 'api.openalex.org') {
        return parsed.searchParams.get('cursor') === '*'
          ? Response.json({
            results: openAlexWorks(0, 100),
            meta: { next_cursor: 'openalex-page-2' },
          })
          : Response.json({ results: openAlexWorks(100, 21), meta: { next_cursor: null } });
      }
      if (parsed.hostname === 'api.crossref.org') {
        return parsed.searchParams.get('cursor') === '*'
          ? Response.json({
          message: {
            items: crossrefWorks(0, 1),
            'next-cursor': 'crossref-page-2',
          },
          })
          : Response.json({ message: { items: crossrefWorks(1, 1), 'next-cursor': null } });
      }
      return parsed.searchParams.get('offset') === '0'
        ? Response.json({ data: semanticScholarWorks(0, 100), total: 101 })
        : Response.json({ data: semanticScholarWorks(100, 1), total: 101 });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'Uncapped source retrieval',
      purposes: ['general'],
      sourceLimit: 'all',
    }),
  });
  const firstPage = await response.json();
  const continuationResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/research/continue`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'Uncapped source retrieval',
      purposes: ['general'],
      sourceLimit: 'all',
      sourceCursors: firstPage.sourceCursors,
    }),
  });
  const secondPage = await continuationResponse.json();
  const openAlexUrls = requestedUrls.filter((url) => url.hostname === 'api.openalex.org');
  const crossrefUrls = requestedUrls.filter((url) => url.hostname === 'api.crossref.org');
  const semanticScholarUrls = requestedUrls.filter((url) => url.hostname === 'api.semanticscholar.org');

  assert.equal(response.status, 200);
  assert.equal(firstPage.sources.length, 201);
  assert.equal(firstPage.scope.sourceLimit, 'all');
  assert.deepEqual(firstPage.sourceCursors, {
    openAlex: 'openalex-page-2',
    crossref: 'crossref-page-2',
    semanticScholar: 100,
  });
  assert.equal(continuationResponse.status, 200);
  assert.equal(secondPage.sources.length, 23);
  assert.deepEqual(secondPage.sourceCursors, {
    openAlex: null,
    crossref: null,
    semanticScholar: null,
  });
  assert.equal(new Map([...firstPage.sources, ...secondPage.sources].map((source) => [source.id, source])).size, 224);
  assert.equal(requestedUrls.length, 12);
  assert.equal(openAlexUrls[0].searchParams.get('per-page'), '100');
  assert.equal(openAlexUrls[0].searchParams.get('cursor'), '*');
  assert.equal(openAlexUrls[1].searchParams.get('cursor'), 'openalex-page-2');
  assert.equal(crossrefUrls[0].searchParams.get('rows'), '100');
  assert.equal(crossrefUrls[0].searchParams.get('cursor'), '*');
  assert.equal(crossrefUrls[1].searchParams.get('cursor'), 'crossref-page-2');
  assert.equal(firstPage.providers.includes('Semantic Scholar'), true);
  assert.equal(semanticScholarUrls[0].searchParams.get('offset'), '0');
  assert.equal(semanticScholarUrls[1].searchParams.get('offset'), '100');
});

test('source continuation preserves current results and its cursor when a provider page fails', async (t) => {
  const server = createServer({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'api.openalex.org') {
        if (parsed.searchParams.get('cursor') === '*') {
          return Response.json({
            results: [{
              id: 'https://openalex.org/W-survives-page-error',
              doi: 'https://doi.org/10.5555/survives-page-error',
              title: 'OpenAlex result from the first page',
              publication_year: 2024,
              authorships: [],
              primary_location: { landing_page_url: 'https://example.org/openalex-first' },
            }],
            meta: { next_cursor: 'openalex-next' },
          });
        }
        throw new Error('later page unavailable');
      }
      if (parsed.hostname === 'api.crossref.org') {
        return Response.json({ message: { items: [], 'next-cursor': null } });
      }
      if (parsed.hostname === 'api.semanticscholar.org') {
        return Response.json({ data: [], total: 0 });
      }
      return Response.json({ data: [] });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const requestBody = {
    question: 'Unlimited retrieval page recovery',
    purposes: ['general'],
    sourceLimit: 'all',
  };
  const initialResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  const initialPage = await initialResponse.json();
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research/continue`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...requestBody, sourceCursors: initialPage.sourceCursors }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.providers, ['Crossref', 'Semantic Scholar']);
  assert.equal(initialPage.sources.length, 1);
  assert.equal(initialPage.sources[0].title, 'OpenAlex result from the first page');
  assert.equal(body.sources.length, 0);
  assert.equal(body.sourceCursors.openAlex, 'openalex-next');
  assert.match(body.warnings.join(' '), /OpenAlex could not be reached/);
});

test('Semantic Scholar continuation keeps its cursor when the next page fails', async (t) => {
  const server = createServer({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'api.semanticscholar.org') {
        if (parsed.searchParams.get('offset') === '0') {
          return Response.json({
            total: 101,
            data: Array.from({ length: 100 }, (_, index) => ({
              paperId: `partial-semantic-${index}`,
              title: `Retrieved paper ${index}`,
              year: 2024,
            })),
          });
        }
        throw new Error('later page unavailable');
      }
      if (parsed.hostname === 'api.openalex.org') {
        return Response.json({ results: [], meta: { next_cursor: null } });
      }
      if (parsed.hostname === 'api.crossref.org') {
        return Response.json({ message: { items: [], 'next-cursor': null } });
      }
      return Response.json({ data: [] });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const requestBody = {
    question: 'Unlimited Semantic Scholar page recovery',
    purposes: ['general'],
    sourceLimit: 'all',
  };
  const initialResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  const initialPage = await initialResponse.json();
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research/continue`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...requestBody, sourceCursors: initialPage.sourceCursors }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(initialPage.sources.length, 100);
  assert.equal(initialPage.sources[0].title, 'Retrieved paper 0');
  assert.equal(initialPage.sourceCursors.semanticScholar, 100);
  assert.equal(body.sourceCursors.semanticScholar, 100);
  assert.match(body.warnings.join(' '), /Semantic Scholar could not be reached/);
});

test('research API reports input errors with a clear failed step', async (t) => {
  const server = createServer({ fetchImpl: async () => assert.fail('search should not run') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'tiny', purposes: ['academic'] }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.step, 'validation');
  assert.match(body.error, /8 characters/);
});

test('research continuation rejects exhausted or malformed cursors', async (t) => {
  const server = createServer({ fetchImpl: async () => assert.fail('no source page should be fetched') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research/continue`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'A useful research question',
      purposes: ['general'],
      sourceLimit: 'all',
      sourceCursors: { openAlex: null, crossref: null, semanticScholar: null },
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.step, 'validation');
  assert.match(body.error, /cursor is invalid or there are no more/);
});

test('research API keeps partial results and identifies a failed catalog', async (t) => {
  const server = createServer({
    fetchImpl: async (url) => {
      const hostname = new URL(url).hostname;
      if (hostname === 'api.openalex.org') throw new Error('provider unavailable');
      if (hostname === 'api.semanticscholar.org') return Response.json({ data: [] });
      return Response.json({ message: { items: [], 'next-cursor': null } });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'How does education access change?',
      purposes: ['general'],
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.providers, ['Crossref', 'Semantic Scholar']);
  assert.match(body.warnings[0], /OpenAlex: OpenAlex could not be reached/);
});

test('research API explains when all discovery catalogs fail', async (t) => {
  const server = createServer({ fetchImpl: async () => { throw new Error('offline'); } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'How does education access change?',
      purposes: ['general'],
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.step, 'discovery');
  assert.match(body.error, /scholarly catalogs, web search, and video discovery were unavailable/);
  assert.match(body.error, /configure provider API keys/);
});

test('research API searches Tavily and Brave without returning their server keys', async (t) => {
  let tavilyRequest;
  let braveRequest;
  let googleRequest;
  const server = createServer({
    tavilyApiKey: 'tavily-test-secret',
    braveApiKey: 'brave-test-secret',
    googleSearchApiKey: 'google-test-secret',
    googleSearchEngineId: 'test-engine-id',
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'www.googleapis.com' && parsed.pathname === '/customsearch/v1') {
        googleRequest = parsed;
        return Response.json({
          items: [{
            title: 'Google water report',
            link: 'https://example.edu/google-water-report',
            snippet: 'Google returned a public water report.',
            pagemap: { metatags: [{ 'article:published_time': '2024-03-12T00:00:00Z' }] },
          }],
        });
      }
      if (parsed.hostname === 'api.tavily.com') {
        tavilyRequest = { url: parsed, options };
        return Response.json({
          results: [
            {
              title: 'Water access evidence',
              url: 'https://example.org/water-report',
              content: '<p>Evidence from a public report.</p>',
              published_date: '2024-03-14',
            },
            {
              title: 'Unsafe destination',
              url: 'javascript:alert(1)',
              content: 'Must be rejected.',
            },
            {
              title: 'Community water study from Tavily',
              url: 'https://example.net/community-study',
              content: 'Tavily has additional context.',
            },
          ],
        });
      }
      if (parsed.hostname === 'api.search.brave.com') {
        braveRequest = { url: parsed, options };
        return Response.json({
          web: {
            results: [{
              title: 'Community water study',
              url: 'https://example.net/community-study',
              description: 'A web search description.',
              page_age: '2024-03-10T00:00:00Z',
            }],
          },
        });
      }
      if (parsed.hostname === 'peertube.tv') return Response.json({ data: [] });
      if (parsed.hostname === 'api.openalex.org') {
        return Response.json({ results: [], meta: { next_cursor: null } });
      }
      if (parsed.hostname === 'api.crossref.org') {
        return Response.json({ message: { items: [], 'next-cursor': null } });
      }
      return Response.json({ data: [] });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'Community water access in Kenya',
      purposes: ['general'],
      year: 2024,
      month: 'March',
    }),
  });
  const body = await response.json();
  const tavilyPayload = JSON.parse(tavilyRequest.options.body);

  assert.equal(response.status, 200);
  assert.deepEqual(body.webProviders, ['Google Search', 'Tavily', 'Brave Search']);
  assert.equal(body.webSources.length, 3);
  const googleResult = body.webSources.find((source) => source.provider === 'Google Search');
  assert.equal(googleResult.title, 'Google water report');
  assert.equal(googleResult.description, 'Google returned a public water report.');
  assert.equal(googleResult.publishedAt, '2024-03-12T00:00:00.000Z');
  assert.equal(body.webSources.some((source) => source.provider === 'Tavily'), true);
  const mergedResult = body.webSources.find((source) => source.url === 'https://example.net/community-study');
  assert.match(mergedResult.provider, /Tavily and Brave Search/);
  assert.equal(mergedResult.description, 'Tavily has additional context.');
  assert.equal(mergedResult.publishedAt, null, 'Brave page age is not treated as publication date');
  assert.equal(body.webSources.find((source) => source.provider === 'Tavily').description, 'Evidence from a public report.');
  assert.equal(body.webSources.some((source) => source.title === 'Unsafe destination'), false);
  assert.equal(tavilyRequest.url.pathname, '/search');
  assert.equal(tavilyRequest.options.method, 'POST');
  assert.equal(tavilyPayload.api_key, 'tavily-test-secret');
  assert.equal(tavilyPayload.query, 'Community water access in Kenya');
  assert.equal(tavilyPayload.max_results, 20);
  assert.equal(tavilyPayload.start_date, '2024-03-01');
  assert.equal(tavilyPayload.end_date, '2024-03-31');
  assert.equal(braveRequest.url.searchParams.get('q'), 'Community water access in Kenya');
  assert.equal(braveRequest.url.searchParams.get('count'), '20');
  assert.equal(braveRequest.options.headers['x-subscription-token'], 'brave-test-secret');
  assert.equal(googleRequest.pathname, '/customsearch/v1');
  assert.equal(googleRequest.searchParams.get('key'), 'google-test-secret');
  assert.equal(googleRequest.searchParams.get('cx'), 'test-engine-id');
  assert.equal(googleRequest.searchParams.get('q'), 'Community water access in Kenya');
  assert.equal(googleRequest.searchParams.get('num'), '10');
  assert.equal(googleRequest.searchParams.get('sort'), 'date:r:20240301:20240331');
  assert.equal(JSON.stringify(body).includes('test-secret'), false);
  assert.deepEqual(body.webWarnings, []);
});

test('Google Search configuration is reported and Google errors reach the user as provider warnings', async (t) => {
  const server = createServer({
    googleSearchApiKey: 'google-test-secret',
    googleSearchEngineId: 'test-engine-id',
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'www.googleapis.com' && parsed.pathname === '/customsearch/v1') {
        return new Response('Forbidden', { status: 403 });
      }
      if (parsed.hostname === 'peertube.tv') return Response.json({ data: [] });
      if (parsed.hostname === 'api.openalex.org') {
        return Response.json({ results: [], meta: { next_cursor: null } });
      }
      if (parsed.hostname === 'api.crossref.org') {
        return Response.json({ message: { items: [], 'next-cursor': null } });
      }
      return Response.json({ data: [] });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const healthResponse = await fetch(`${origin}/api/health`);
  const health = await healthResponse.json();
  const response = await fetch(`${origin}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'Community water access in Kenya',
      purposes: ['general'],
    }),
  });
  const body = await response.json();

  assert.equal(health.webProviders.google, true);
  assert.equal(response.status, 200);
  assert.equal(body.webSources.length, 0);
  assert.match(body.webWarnings.join(' '), /Google Custom Search request was denied \(HTTP 403\)/);
  assert.match(body.webWarnings.join(' '), /verify Custom Search JSON API access/);
  assert.equal(JSON.stringify(body).includes('google-test-secret'), false);
});

test('Google Search warns when API key and search engine ID are not both configured', async (t) => {
  const server = createServer({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'peertube.tv') return Response.json({ data: [] });
      if (parsed.hostname === 'api.openalex.org') {
        return Response.json({ results: [], meta: { next_cursor: null } });
      }
      if (parsed.hostname === 'api.crossref.org') {
        return Response.json({ message: { items: [], 'next-cursor': null } });
      }
      return Response.json({ data: [] });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'Community water access in Kenya',
      purposes: ['general'],
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(body.webWarnings.join(' '), /both GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID/);
});

test('trending discovery returns Google Trends context and YouTube videos with images', async (t) => {
  const requests = [];
  const trendsXml = `<?xml version="1.0"?>
    <rss xmlns:atom="http://www.w3.org/2005/Atom" xmlns:ht="https://trends.google.com/trending/rss">
      <channel>
        <atom:link href="https://trends.google.com/trending/rss?geo=NG" />
        <item>
          <title>Public health update</title>
          <ht:approx_traffic>20K+</ht:approx_traffic>
          <description></description>
          <pubDate>Thu, 15 Oct 2026 10:00:00 GMT</pubDate>
          <ht:picture>https://images.example/trend.jpg</ht:picture>
          <ht:picture_source>Example News</ht:picture_source>
          <ht:news_item>
            <ht:news_item_title>New public health report &amp; analysis</ht:news_item_title>
            <ht:news_item_snippet>Officials published a new report today.</ht:news_item_snippet>
            <ht:news_item_url>https://news.example/report</ht:news_item_url>
            <ht:news_item_source>Example News</ht:news_item_source>
          </ht:news_item>
        </item>
      </channel>
    </rss>`;
  const server = createServer({
    youtubeApiKey: 'test-trending-youtube-key',
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      requests.push(parsed);
      if (parsed.hostname === 'trends.google.com') return new Response(trendsXml);
      if (parsed.hostname === 'www.googleapis.com' && parsed.pathname === '/youtube/v3/videos') {
        return Response.json({
          items: [{
            id: 'abcdefghijk',
            snippet: {
              title: 'Popular public health video',
              description: 'A provider-supplied video description.',
              channelTitle: 'Public Channel',
              thumbnails: { high: { url: 'https://images.example/youtube.jpg' } },
            },
            statistics: { viewCount: '12345' },
          }],
        });
      }
      throw new Error(`Unexpected provider: ${parsed.hostname}`);
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${origin}/api/discover/trending`);
  const body = await response.json();
  const cachedResponse = await fetch(`${origin}/api/discover/trending`);

  assert.equal(response.status, 200);
  assert.deepEqual(body.providers, ['Google Trends', 'YouTube']);
  assert.equal(body.googleTrendsRegion, 'NG');
  assert.equal(body.googleTrends[0].title, 'Public health update');
  assert.equal(body.googleTrends[0].traffic, '20K+');
  assert.equal(body.googleTrends[0].image, 'https://images.example/trend.jpg');
  assert.equal(body.googleTrends[0].news[0].title, 'New public health report & analysis');
  assert.equal(body.googleTrends[0].news[0].description, 'Officials published a new report today.');
  assert.equal(body.googleTrends[0].news[0].url, 'https://news.example/report');
  assert.match(body.googleTrends[0].url, /trends\/explore\?q=Public\+health\+update&geo=NG/);
  assert.equal(body.youtubeVideos[0].title, 'Popular public health video');
  assert.equal(body.youtubeVideos[0].image, 'https://images.example/youtube.jpg');
  assert.equal(body.youtubeVideos[0].viewCount, 12345);
  assert.match(body.youtubeVideos[0].whyTrending, /most-popular chart/);
  assert.equal(requests.length, 2, 'the response is cached after the first provider fetch');
  assert.equal(cachedResponse.status, 200);
  assert.equal(JSON.stringify(body).includes('test-trending-youtube-key'), false);
});

test('trending discovery reports unavailable providers and returns available Google results', async (t) => {
  const server = createServer({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'trends.google.com') {
        return new Response('<rss><channel><item><title>Global science topic</title></item></channel></rss>');
      }
      throw new Error(`Unexpected provider: ${parsed.hostname}`);
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/discover/trending`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.providers, ['Google Trends']);
  assert.equal(body.googleTrends.length, 1);
  assert.match(body.warnings.join(' '), /YOUTUBE_API_KEY/);
});

test('trending discovery returns an error when all providers are unavailable', async (t) => {
  const server = createServer({
    fetchImpl: async () => {
      throw new Error('Provider unavailable');
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/discover/trending`);
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.match(body.error, /Google Trends/);
  assert.match(body.error, /YOUTUBE_API_KEY/);
});

test('research API falls back to a working public PeerTube instance without an API key', async (t) => {
  let peerTubeUrl;
  const server = createServer({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'peertube.tv') {
        return new Response('Not Found', { status: 404 });
      }
      if (parsed.hostname === 'framatube.org') {
        peerTubeUrl = parsed;
        return Response.json({
          data: [
            {
              uuid: 'video-uuid-1',
              name: 'Community report on clean water',
              description: '<p>Local water access and public health.</p>',
              url: 'https://video.example/w/video-uuid-1',
              publishedAt: '2024-03-12T10:00:00Z',
              channel: { displayName: 'Public Health Channel' },
            },
            {
              uuid: 'unsafe-video',
              name: 'Unsafe link',
              url: 'javascript:alert(1)',
            },
          ],
        });
      }
      if (parsed.hostname === 'api.openalex.org') {
        return Response.json({ results: [], meta: { next_cursor: null } });
      }
      if (parsed.hostname === 'api.crossref.org') {
        return Response.json({ message: { items: [], 'next-cursor': null } });
      }
      return Response.json({ data: [] });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'Community water access in Kenya',
      purposes: ['general'],
      year: 2024,
      month: 'March',
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.videoProviders, ['PeerTube (framatube.org)', 'PeerTube (tilvids.com)']);
  assert.equal(body.videos.length, 1);
  assert.equal(body.videos[0].id, 'peertube:video.example:video-uuid-1');
  assert.equal(body.videos[0].platform, 'PeerTube');
  assert.equal(body.videos[0].channel, 'Public Health Channel');
  assert.equal(body.videos[0].description, 'Local water access and public health.');
  assert.equal(peerTubeUrl.searchParams.get('search'), 'Community water access in Kenya');
  assert.equal(peerTubeUrl.searchParams.get('count'), '50');
  assert.equal(peerTubeUrl.searchParams.get('startDate'), '2024-03-01T00:00:00.000Z');
  assert.equal(peerTubeUrl.searchParams.get('endDate'), '2024-03-31T23:59:59.999Z');
  assert.match(body.videoWarnings.join(' '), /YOUTUBE_API_KEY/);
  assert.match(body.videoWarnings.join(' '), /PeerTube \(peertube.tv\).*HTTP 404/);
});

test('PeerTube retries searches without question filler when exact wording has no matches', async (t) => {
  const peerTubeQueries = [];
  const server = createServer({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (['peertube.tv', 'framatube.org', 'tilvids.com'].includes(parsed.hostname)) {
        const query = parsed.searchParams.get('search');
        peerTubeQueries.push({ host: parsed.hostname, query });
        return Response.json({
          data: parsed.hostname === 'peertube.tv' && query === 'urban green space mental health'
            ? [{
              uuid: 'urban-video',
              name: 'Urban green space and mental health',
              url: `https://${parsed.hostname}/w/urban-video`,
            }]
            : [],
          total: parsed.hostname === 'peertube.tv' && query === 'urban green space mental health' ? 1 : 0,
        });
      }
      if (parsed.hostname === 'api.openalex.org') {
        return Response.json({ results: [], meta: { next_cursor: null } });
      }
      if (parsed.hostname === 'api.crossref.org') {
        return Response.json({ message: { items: [], 'next-cursor': null } });
      }
      return Response.json({ data: [] });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'How does urban green space affect mental health in adults?',
      purposes: ['general'],
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(peerTubeQueries.some(({ query }) => query === 'urban green space mental health'), true);
  assert.equal(body.videos.length, 1);
  assert.match(body.videoWarnings.join(' '), /no matches for the initial topic terms/);
});

test('research API searches YouTube with a server-side key and requests up to fifty results per page', async (t) => {
  let youtubeUrl;
  const server = createServer({
    youtubeApiKey: 'test-server-key',
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'www.googleapis.com') {
        youtubeUrl = parsed;
        return Response.json({
          items: [{
            id: { videoId: 'abcdefghijk' },
            snippet: {
              title: 'Education access overview',
              description: 'A public video description.',
              channelTitle: 'Education Channel',
              publishedAt: '2024-03-18T09:30:00Z',
            },
          }],
        });
      }
      if (parsed.hostname === 'peertube.tv') return Response.json({ data: [] });
      if (parsed.hostname === 'api.openalex.org') {
        return Response.json({ results: [], meta: { next_cursor: null } });
      }
      if (parsed.hostname === 'api.crossref.org') {
        return Response.json({ message: { items: [], 'next-cursor': null } });
      }
      return Response.json({ data: [] });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'Education access in Kenya',
      purposes: ['general'],
      year: 2024,
      month: 'March',
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.videoProviders, [
    'PeerTube (peertube.tv)',
    'PeerTube (framatube.org)',
    'PeerTube (tilvids.com)',
    'YouTube',
  ]);
  assert.equal(body.videos.length, 1);
  assert.equal(body.videos[0].id, 'youtube:abcdefghijk');
  assert.equal(body.videos[0].url, 'https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(body.videos[0].channel, 'Education Channel');
  assert.equal(youtubeUrl.searchParams.get('key'), 'test-server-key');
  assert.equal(youtubeUrl.searchParams.get('maxResults'), '50');
  assert.equal(youtubeUrl.searchParams.get('q'), 'Education access in Kenya');
  assert.equal(youtubeUrl.searchParams.get('publishedAfter'), '2024-03-01T00:00:00Z');
  assert.equal(youtubeUrl.searchParams.get('publishedBefore'), '2024-03-31T23:59:59Z');
  assert.equal(JSON.stringify(body).includes('test-server-key'), false);
});

test('research API paginates video providers and returns more than twenty results', async (t) => {
  const youtubeUrls = [];
  const peerTubeUrls = [];
  const server = createServer({
    youtubeApiKey: 'test-server-key',
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'www.googleapis.com') {
        youtubeUrls.push(parsed);
        const page = parsed.searchParams.has('pageToken') ? 1 : 0;
        const start = page * 50;
        return Response.json({
          items: Array.from({ length: page === 0 ? 50 : 1 }, (_, index) => {
            const videoNumber = start + index;
            const id = `video${String(videoNumber).padStart(6, '0')}`;
            return {
              id: { videoId: id },
              snippet: {
                title: `YouTube result ${videoNumber}`,
                publishedAt: '2024-03-18T09:30:00Z',
              },
            };
          }),
          ...(page === 0 ? { nextPageToken: 'next-youtube-page' } : {}),
        });
      }
      if (parsed.hostname === 'peertube.tv') {
        peerTubeUrls.push(parsed);
        const start = Number(parsed.searchParams.get('start'));
        return Response.json({
          total: 51,
          data: Array.from({ length: start === 0 ? 50 : 1 }, (_, index) => {
            const videoNumber = start + index;
            return {
              uuid: `peertube-${videoNumber}`,
              name: `PeerTube result ${videoNumber}`,
              url: `https://video.example/w/peertube-${videoNumber}`,
            };
          }),
        });
      }
      if (parsed.hostname === 'api.openalex.org') {
        return Response.json({ results: [], meta: { next_cursor: null } });
      }
      if (parsed.hostname === 'api.crossref.org') {
        return Response.json({ message: { items: [], 'next-cursor': null } });
      }
      return Response.json({ data: [] });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'Education access in Kenya',
      purposes: ['general'],
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.videos.length, 102);
  assert.equal(body.videos.filter((video) => video.platform === 'YouTube').length, 51);
  assert.equal(body.videos.filter((video) => video.platform === 'PeerTube').length, 51);
  assert.equal(youtubeUrls.length, 2);
  assert.equal(youtubeUrls[0].searchParams.get('maxResults'), '50');
  assert.equal(youtubeUrls[1].searchParams.get('pageToken'), 'next-youtube-page');
  assert.equal(peerTubeUrls.length, 2);
  assert.equal(peerTubeUrls[0].searchParams.get('count'), '50');
  assert.equal(peerTubeUrls[1].searchParams.get('start'), '50');
});
