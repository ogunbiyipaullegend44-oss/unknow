import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  categoryFor,
  sourceDateLabel,
  sourceHost,
  SOURCE_CATEGORIES,
} from './sourceCategories.js';
import {
  ACCESSIBILITY_TYPES,
  compileSourceFilters,
  DATE_FILTERS,
  EVIDENCE_TYPES,
  matchesSourceFilters,
  ORGANIZATION_TYPES,
  organizationTypesFor,
  evidenceTypesFor,
  questionTerms,
  removableFilterChips,
  sortSources,
  sourceGeographyText,
  sourceSearchText,
} from './sourceFilterUtils.js';
import {
  COMPARISON_FIELDS,
  comparabilityDifferences,
  NOT_REPORTED,
  valueForComparison,
} from './sourceComparison.js';
import {
  parseSourceReviews,
  SOURCE_REVIEW_NOTES_LIMIT,
  SOURCE_REVIEWS_KEY,
  updateSourceReview,
} from './sourceReview.js';
import './SourceDiscovery.css';

const MAX_COMPARE_SOURCES = 5;
const RESULTS_PER_CATEGORY = 12;
const INITIAL_FILTERS = {
  categories: [],
  datePreset: 'any',
  startDate: '',
  endDate: '',
  sort: 'newest',
  geographyType: '',
  geographyValue: '',
  organizationTypes: [],
  evidenceTypes: [],
  accessibility: [],
  search: '',
  includeKeywords: '',
  excludeKeywords: '',
  researchArea: '',
  relevanceQuestion: '',
  claim: '',
};

function termsFor(text) {
  return [...new Set(
    (text.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [])
      .filter((word) => word.length > 3),
  )];
}

function overlapCount(item, words) {
  const text = new Set(
    `${item.title} ${item.description} ${item.publisher}`
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [],
  );
  return words.filter((word) => text.has(word)).length;
}

function possibleArea(item, areas) {
  const text = new Set(
    `${item.title} ${item.description} ${item.publisher}`
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [],
  );
  return areas.find(({ title, words }) => {
    const matches = words.filter((word) => text.has(word)).length;
    return matches >= Math.min(2, words.length);
  })?.title ?? '';
}

function makeItems(research) {
  return [
    ...(research.sources ?? []).map((source) => ({
      id: `academic:${source.id}`,
      kind: 'academic',
      title: source.title,
      url: source.url,
      author: source.authors?.join(', ') || '',
      publisher: source.publisher || source.journal || '',
      organization: source.publisher || '',
      host: sourceHost(source.url),
      date: source.publicationYear
        ? source.publicationMonth
          ? `${source.publicationYear}-${String(source.publicationMonth).padStart(2, '0')}`
          : String(source.publicationYear)
        : '',
      type: source.sourceType || '',
      description: source.abstract || '',
      abstract: source.abstract || '',
      evidence: source.abstract || '',
      doi: source.doi || '',
      citationCount: source.citationCount,
      provider: source.metadataSource || 'Academic catalog',
      openAccessUrl: source.openAccessUrl || '',
      openAccess: source.openAccess === true,
      query: research.question,
    })),
    ...(research.webSources ?? []).map((source) => ({
      id: `web:${source.id}`,
      kind: 'web',
      title: source.title,
      url: source.url,
      author: '',
      publisher: sourceHost(source.url),
      organization: sourceHost(source.url),
      host: sourceHost(source.url),
      date: source.publishedAt || '',
      type: '',
      description: source.description || '',
      abstract: '',
      evidence: source.description || '',
      provider: source.provider || 'Web search',
      openAccessUrl: '',
      openAccess: false,
      query: research.question,
    })),
    ...(research.videos ?? []).map((video) => ({
      id: `video:${video.id}`,
      kind: 'video',
      title: video.title,
      url: video.url,
      author: video.channel || '',
      publisher: video.platform || '',
      organization: video.channel || video.platform || '',
      host: sourceHost(video.url),
      date: video.publishedAt || '',
      type: 'Video',
      description: video.description || '',
      abstract: '',
      evidence: video.description || '',
      provider: video.platform || 'Video platform',
      openAccessUrl: '',
      openAccess: false,
      query: research.question,
    })),
  ].filter((item) => item.title && item.url);
}

function classifyItems(research) {
  const queryWords = questionTerms(research.question);
  const researchAreas = research.analysis.researchAreas.map((area) => ({
    title: area.title,
    words: termsFor(`${area.title} ${area.description} ${(area.questions ?? []).join(' ')}`),
  }));
  return makeItems(research).map((item) => {
    const categorized = { ...item, category: categoryFor(item) };
    return {
      ...categorized,
      filterSearchText: sourceSearchText(categorized),
      filterGeographyText: sourceGeographyText(categorized),
      organizationTypes: organizationTypesFor(categorized),
      evidenceTypes: evidenceTypesFor(categorized),
      relevanceOverlap: overlapCount(categorized, queryWords),
      relevanceTermCount: queryWords.length,
      possibleResearchArea: possibleArea(categorized, researchAreas),
    };
  });
}

export default function SourceDiscovery({
  research,
  savedProjects = [],
  projectStorageWarning,
  projectActionError,
  onCreateSavedProject,
  onAddSourceToProject,
  onFindSimilar,
}) {
  const [sourceReviews, setSourceReviews] = useState({});
  const [excludedIds, setExcludedIds] = useState(() => new Set());
  const [comparedIds, setComparedIds] = useState(() => new Set());
  const [categoryPages, setCategoryPages] = useState({});
  const [filters, setFilters] = useState(() => ({
    ...INITIAL_FILTERS,
    relevanceQuestion: research.question,
    categories: research.relatedSourceCategories ?? [],
  }));
  const [notice, setNotice] = useState('');
  const [reviewStorageWarning, setReviewStorageWarning] = useState('');
  const [projectDialogItem, setProjectDialogItem] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(savedProjects[0]?.id ?? '');
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(savedProjects.length === 0);
  const deferredFilters = useDeferredValue(filters);
  const filterDrawerRef = useRef(null);
  const previousResearch = useRef(research);

  useEffect(() => {
    try {
      setSourceReviews(parseSourceReviews(window.localStorage.getItem(SOURCE_REVIEWS_KEY)));
    } catch (error) {
      setReviewStorageWarning(`Source review notes could not be loaded: ${error.message}`);
    }
  }, []);

  useEffect(() => {
    if (filterDrawerRef.current) filterDrawerRef.current.open = false;
  }, [research.id, research.retrievedAt]);

  const [classifiedItems, setClassifiedItems] = useState(() => classifyItems(research));
  useEffect(() => {
    const previous = previousResearch.current;
    const isAppend = previous.id === research.id &&
      ['sources', 'webSources', 'videos'].every((key) => {
        const before = previous[key] ?? [];
        const after = research[key] ?? [];
        return before.length <= after.length &&
          before.every((item, index) => item === after[index]);
      });

    previousResearch.current = research;
    if (!isAppend) {
      setClassifiedItems(classifyItems(research));
      return;
    }

    const added = {};
    let hasAddedItems = false;
    for (const key of ['sources', 'webSources', 'videos']) {
      const before = previous[key] ?? [];
      const after = research[key] ?? [];
      added[key] = after.slice(before.length);
      if (added[key].length) hasAddedItems = true;
    }
    if (!hasAddedItems) return;
    setClassifiedItems((current) => [...current, ...classifyItems({ ...research, ...added })]);
  }, [research]);

  const items = classifiedItems;
  const filterContext = useMemo(
    () => ({ researchAreas: research.analysis.researchAreas }),
    [research.analysis.researchAreas],
  );
  const compiledFilters = useMemo(
    () => compileSourceFilters(deferredFilters, filterContext),
    [deferredFilters, filterContext],
  );
  const availableItems = useMemo(() => sortSources(classifiedItems
    .filter((item) => !excludedIds.has(item.id))
    .filter((item) => matchesSourceFilters(item, deferredFilters, filterContext, compiledFilters)), deferredFilters.sort)
    .sort((left, right) => right.relevanceOverlap - left.relevanceOverlap),
  [classifiedItems, deferredFilters.sort, excludedIds, filterContext, compiledFilters]);
  const filterChips = useMemo(
    () => removableFilterChips(filters, (key, value) => {
      setFilters((current) => {
        if (value && Array.isArray(current[key])) {
          return { ...current, [key]: current[key].filter((entry) => entry !== value) };
        }
        if (key === 'geographyType') {
          return { ...current, geographyType: '', geographyValue: '' };
        }
        if (key === 'datePreset') {
          return { ...current, datePreset: 'any', startDate: '', endDate: '' };
        }
        const defaults = { ...INITIAL_FILTERS };
        return { ...current, [key]: defaults[key] };
      });
    }),
    [filters, research.question],
  );
  const categories = useMemo(() => {
    const groups = new Map();
    for (const item of availableItems) {
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups.get(item.category).push(item);
    }
    return SOURCE_CATEGORIES
      .filter((category) => groups.has(category))
      .map((category) => [category, groups.get(category)]);
  }, [availableItems]);
  const comparedItems = items.filter((item) => comparedIds.has(item.id));
  const comparisonDifferences = comparabilityDifferences(comparedItems);

  const saveSourceReview = (item, changes) => {
    try {
      const nextReviews = updateSourceReview(sourceReviews, item.id, changes);
      window.localStorage.setItem(SOURCE_REVIEWS_KEY, JSON.stringify(nextReviews));
      setSourceReviews(nextReviews);
      setReviewStorageWarning('');
    } catch (error) {
      setReviewStorageWarning(`Source review could not be saved: ${error.message}`);
    }
  };

  const toggleCompared = (item) => {
    setComparedIds((current) => {
      const next = new Set(current);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else if (next.size < MAX_COMPARE_SOURCES) {
        next.add(item.id);
      } else {
        setNotice(`Compare up to ${MAX_COMPARE_SOURCES} sources at a time. Unselect one before choosing another.`);
      }
      return next;
    });
  };

  useEffect(() => {
    setExcludedIds(new Set());
    setComparedIds(new Set());
    setCategoryPages({});
  }, [research.retrievedAt]);

  useEffect(() => {
    setFilters({
      ...INITIAL_FILTERS,
      relevanceQuestion: research.question,
      categories: research.relatedSourceCategories ?? [],
    });
  }, [research.id]);

  useEffect(() => {
    setCategoryPages({});
  }, [filters]);

  const clearAllFilters = () => {
    setFilters({
      ...INITIAL_FILTERS,
      relevanceQuestion: research.question,
    });
    setExcludedIds(new Set());
  };

  const toggleFilterValue = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((entry) => entry !== value)
        : [...current[key], value],
    }));
  };

  const availableCategories = [...new Set(classifiedItems.map((item) => item.category))];
  const availableOrganizations = [...new Set(classifiedItems.flatMap((item) => item.organizationTypes))];
  const availableEvidence = [...new Set(classifiedItems.flatMap((item) => item.evidenceTypes))];
  const dateLimitedCount = items.filter((item) => !item.date).length;
  const geographyTextMissingCount = items.filter((item) =>
    ![item.title, item.description, item.abstract].filter(Boolean).join(' '),
  ).length;
  const organizationMetadataMissingCount = items.filter((item) =>
    !item.organization && !item.publisher && !item.author,
  ).length;
  const evidenceMetadataMissingCount = items.filter((item) =>
    !item.type && !item.description && !item.abstract,
  ).length;
  const yearOnlyDateCount = items.filter((item) => /^\d{4}$/.test(String(item.date ?? ''))).length;
  const invalidDateRange = filters.datePreset === 'custom' &&
    filters.startDate && filters.endDate && filters.startDate > filters.endDate;

  return (
    <div className="discovery-workspace">
      <div className="discovery-heading">
        <div>
          <h3>Source discovery</h3>
          <p>Search terms are extracted from your question, and results must match at least two topic words (or the only available topic word). This is a text-overlap check, not an AI relevance review.</p>
        </div>
        <div className="discovery-heading-actions">
          <span>{availableItems.length.toLocaleString()} of {items.length.toLocaleString()} retrieved sources match your filters. Use the page controls below to browse each category.</span>
        </div>
      </div>

      <p className="discovery-integrity-note">
        Question relevance is applied by default using words in the original question. Relevance and research-area matches are text-overlap hints, not verified conclusions. Search snippets and catalog abstracts are not full-text review; this tool does not extract or assert claims.
      </p>
      <p className="comparison-instructions">
        Select at least 2 sources to compare their retrieved metadata and text. Up to {MAX_COMPARE_SOURCES} sources can be compared at once; unavailable details are marked rather than inferred.
        {research.scope?.sourceLimit === 'all' && ' Unlimited searches start with one page per catalog; each category shows 12 records at a time so large collections stay responsive.'}
        {comparedItems.length > 0 ? ` ${comparedItems.length} selected.` : ''}
      </p>
      {reviewStorageWarning && <p className="discovery-warning" role="status">{reviewStorageWarning}</p>}
      {notice && <p className="discovery-notice" role="status">{notice}</p>}

      <label className="filter-search-field discovery-search-field">
        <span>Search source titles and descriptions</span>
        <input
          value={filters.search}
          onChange={(event) => {
            const value = event.target.value;
            setFilters((current) => ({ ...current, search: value }));
            if (value.trim() && filterDrawerRef.current) filterDrawerRef.current.open = true;
          }}
          placeholder="Search within retrieved sources"
        />
      </label>

      <details className="source-filter-drawer" ref={filterDrawerRef}>
        <summary>
          <span>Source filters</span>
          <span>{filterChips.length ? `${filterChips.length} active` : 'No filters applied'}</span>
        </summary>
        <div className="source-filter-body">
          <div className="filter-drawer-heading">
            <div>
              <h4>Refine retrieved sources</h4>
              <p>Filters run locally on retrieved metadata and descriptions; changing them does not repeat the research search.</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={clearAllFilters}>Clear All</button>
          </div>

          <div className="filter-sections-grid">
            <fieldset className="filter-section">
              <legend>Source type <small>(select any)</small></legend>
              <div className="filter-checkbox-list">
                {SOURCE_CATEGORIES.map((category) => (
                  <label key={category} className={availableCategories.includes(category) ? '' : 'filter-unavailable'}>
                    <input
                      type="checkbox"
                      checked={filters.categories.includes(category)}
                      disabled={!availableCategories.includes(category)}
                      onChange={() => toggleFilterValue('categories', category)}
                    />
                    <span>{category}</span>
                    {!availableCategories.includes(category) && <small>no matching records retrieved</small>}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="filter-section">
              <legend>Publication date</legend>
              <label className="filter-inline-label">
                <span>Date range</span>
                <select value={filters.datePreset} onChange={(event) => setFilters((current) => ({ ...current, datePreset: event.target.value }))}>
                  <option value="any">Any date</option>
                  {DATE_FILTERS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
                  <option value="custom">Custom date range</option>
                </select>
              </label>
              {filters.datePreset === 'custom' && (
                <div className="filter-date-range">
                  <label><span>From</span><input type="date" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} /></label>
                  <label><span>To</span><input type="date" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} /></label>
                </div>
              )}
              <label className="filter-inline-label">
                <span>Sort by</span>
                <select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </label>
              {filters.datePreset !== 'any' && dateLimitedCount > 0 && (
                <p className="filter-limitation">{dateLimitedCount} source{dateLimitedCount === 1 ? ' has' : 's have'} no publication date and cannot be matched to the selected date range. Retrieval time is not used as publication date.</p>
              )}
              {filters.datePreset !== 'any' && yearOnlyDateCount > 0 && (
                <p className="filter-limitation">{yearOnlyDateCount} source{yearOnlyDateCount === 1 ? ' has' : 's have'} a year-only publication date. These records are matched by year; month/day precision is unavailable.</p>
              )}
              {invalidDateRange && <p className="filter-error" role="alert">The start date must be on or before the end date.</p>}
            </fieldset>

            <fieldset className="filter-section">
              <legend>Geography</legend>
              <label className="filter-inline-label">
                <span>Location coverage</span>
                <select value={filters.geographyType} onChange={(event) => setFilters((current) => ({
                  ...current,
                  geographyType: event.target.value,
                  geographyValue: event.target.value === 'any' || event.target.value === 'worldwide' ? '' : current.geographyValue,
                }))}>
                  <option value="">Any geography</option>
                  <option value="country">Country text mention</option>
                  <option value="region">Region text mention</option>
                  <option value="continent">Continent text mention</option>
                  <option value="user-defined">User-defined area text mention</option>
                  <option value="worldwide">Worldwide/global text mention</option>
                </select>
              </label>
              {filters.geographyType && filters.geographyType !== 'worldwide' && (
                <label className="filter-inline-label">
                  <span>{filters.geographyType === 'user-defined' ? 'Geographical area' : `${filters.geographyType[0].toLocaleUpperCase()}${filters.geographyType.slice(1)} name`}</span>
                  <input value={filters.geographyValue} onChange={(event) => setFilters((current) => ({ ...current, geographyValue: event.target.value }))} placeholder={filters.geographyType === 'country' ? 'e.g. Kenya' : filters.geographyType === 'continent' ? 'e.g. Africa' : 'e.g. West Africa or Nairobi'} />
                </label>
              )}
              <p className="filter-limitation">Geography checks for the entered text only in titles, abstracts, and descriptions, not publisher location. It signals a text mention, not verified geographic relevance. {geographyTextMissingCount > 0 ? `${geographyTextMissingCount} source${geographyTextMissingCount === 1 ? ' has' : 's have'} no searchable descriptive text.` : ''}</p>
            </fieldset>

            <fieldset className="filter-section">
              <legend>Source organization <small>(available metadata only)</small></legend>
              <div className="filter-checkbox-list">
                {ORGANIZATION_TYPES.map((type) => (
                  <label key={type} className={availableOrganizations.includes(type) ? '' : 'filter-unavailable'}>
                    <input
                      type="checkbox"
                      checked={filters.organizationTypes.includes(type)}
                      disabled={!availableOrganizations.includes(type)}
                      onChange={() => toggleFilterValue('organizationTypes', type)}
                    />
                    <span>{type}</span>
                    {!availableOrganizations.includes(type) && <small>not identified in retrieved metadata</small>}
                  </label>
                ))}
              </div>
              {organizationMetadataMissingCount > 0 && <p className="filter-limitation">{organizationMetadataMissingCount} record{organizationMetadataMissingCount === 1 ? ' has' : 's have'} no author or publisher metadata. Organization categories are labeled only when publisher/author text or source category provides a signal.</p>}
            </fieldset>

            <fieldset className="filter-section">
              <legend>Evidence characteristics <small>(explicit signals only)</small></legend>
              <div className="filter-checkbox-list">
                {EVIDENCE_TYPES.map((type) => (
                  <label key={type} className={availableEvidence.includes(type) ? '' : 'filter-unavailable'}>
                    <input
                      type="checkbox"
                      checked={filters.evidenceTypes.includes(type)}
                      disabled={!availableEvidence.includes(type)}
                      onChange={() => toggleFilterValue('evidenceTypes', type)}
                    />
                    <span>{type}</span>
                    {!availableEvidence.includes(type) && <small>not established by available metadata</small>}
                  </label>
                ))}
              </div>
              {evidenceMetadataMissingCount > 0 && <p className="filter-limitation">{evidenceMetadataMissingCount} record{evidenceMetadataMissingCount === 1 ? ' has' : 's have'} too little description or type metadata to classify.</p>}
              <p className="filter-limitation">Primary/secondary labels are conservative indicators from record text (for example, a dataset or explicit review); source role cannot be established without reading the work.</p>
            </fieldset>

            <fieldset className="filter-section">
              <legend>Accessibility <small>(known indicators only)</small></legend>
              <div className="filter-checkbox-list">
                {ACCESSIBILITY_TYPES.map((type) => {
                  const available = items.some((item) => {
                    if (type === 'Open-access full-text link') return Boolean(item.openAccessUrl);
                    if (type === 'Abstract available') return Boolean(item.abstract);
                    if (type === 'Metadata only') return !item.abstract && !item.description;
                    if (type === 'Video available') return item.kind === 'video';
                    return /\.pdf(?:$|[?#])/i.test(item.openAccessUrl ?? '');
                  });
                  return (
                    <label key={type} className={available ? '' : 'filter-unavailable'}>
                      <input type="checkbox" checked={filters.accessibility.includes(type)} disabled={!available} onChange={() => toggleFilterValue('accessibility', type)} />
                      <span>{type}</span>
                      {!available && <small>not found in retrieved records</small>}
                    </label>
                  );
                })}
              </div>
              <p className="filter-limitation">A visible title or abstract does not mean the full text is open. “Open access” is applied only when a provider returned a full-text link.</p>
            </fieldset>

            <fieldset className="filter-section">
              <legend>Research relevance</legend>
              <label className="filter-inline-label">
                <span>Research Map area</span>
                <select value={filters.researchArea} onChange={(event) => setFilters((current) => ({ ...current, researchArea: event.target.value }))}>
                  <option value="">Any area</option>
                  {research.analysis.researchAreas.map((area) => <option key={area.title} value={area.title}>{area.title}</option>)}
                </select>
              </label>
              <label className="filter-inline-label">
                <span>Specific claim text</span>
                <input value={filters.claim} onChange={(event) => setFilters((current) => ({ ...current, claim: event.target.value }))} placeholder="Match this exact wording in retrieved text" />
              </label>
              <label className="filter-inline-label">
                <span>Question or topic relevance</span>
                <input value={filters.relevanceQuestion} onChange={(event) => setFilters((current) => ({ ...current, relevanceQuestion: event.target.value }))} placeholder="Require words from this question or topic" />
              </label>
              <p className="filter-limitation">Area and question matching use words in actual source titles, abstracts, or descriptions, not hidden ranking scores. Claim matching requires the exact phrase in retrieved text and does not verify the claim.</p>
            </fieldset>

            <fieldset className="filter-section">
              <legend>Keywords and exclusions</legend>
              <label className="filter-inline-label">
                <span>Include phrases <small>(all required; separate with commas)</small></span>
                <input value={filters.includeKeywords} onChange={(event) => setFilters((current) => ({ ...current, includeKeywords: event.target.value }))} placeholder="e.g. public health, urban planning" />
              </label>
              <label className="filter-inline-label">
                <span>Exclude phrases <small>(any match removes source)</small></span>
                <input value={filters.excludeKeywords} onChange={(event) => setFilters((current) => ({ ...current, excludeKeywords: event.target.value }))} placeholder="e.g. opinion, correction" />
              </label>
              <p className="filter-limitation">Keyword filters search only retrieved title, description, abstract, author, and publisher metadata.</p>
            </fieldset>
          </div>

          {filterChips.length > 0 && (
            <div className="active-filter-chips" aria-label="Active filters">
              <strong>Active filters</strong>
              {filterChips.map((chip) => (
                <button type="button" key={chip.key} onClick={chip.remove} aria-label={`Remove filter ${chip.label}`}>
                  {chip.label}<span aria-hidden="true"> ×</span>
                </button>
              ))}
            </div>
          )}
          <p className="filter-result-count" aria-live="polite">
            {availableItems.length} of {items.length} sources match your filters
            {excludedIds.size > 0 ? ` · ${excludedIds.size} excluded from this view` : ''}
          </p>
        </div>
      </details>

      {comparedItems.length >= 2 && (
        <section className="source-comparison" aria-label="Source comparison">
          <div className="source-comparison-heading">
            <div>
              <h4>Source comparison</h4>
              <p>Evidence below is quoted from retrieved records. Abstracts and search snippets are not full-text review.</p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setComparedIds(new Set())}>Clear comparison</button>
          </div>
          <p className="comparison-caution">
            Topic overlap does not establish that sources are directly comparable. The tool does not infer agreement or disagreement: it only surfaces explicit agreement/contrast wording found in each record, which may refer to other work.
          </p>
          {comparedItems.some((item) => item.kind !== comparedItems[0].kind) && (
            <p className="comparison-caution">
              These records include different source types. For example, a catalog abstract, a web search snippet, and video metadata are not equivalent evidence.
            </p>
          )}
          <div className="source-comparison-table-wrap">
            <table className="source-comparison-table">
              <thead>
                <tr>
                  <th scope="col">Information</th>
                  {comparedItems.map((item) => (
                    <th scope="col" key={item.id}>
                      <span>{item.title}</span>
                      <small>{categoryFor(item)}</small>
                      <a href={item.url} target="_blank" rel="noopener noreferrer">Open original</a>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { key: 'author', label: 'Author / organization' },
                  { key: 'publisher', label: 'Publisher / website' },
                  { key: 'publicationDate', label: 'Publication date' },
                  { key: 'provider', label: 'Retrieved via' },
                  ...COMPARISON_FIELDS,
                ].map((field) => (
                  <tr key={field.key}>
                    <th scope="row">{field.label}</th>
                    {comparedItems.map((item) => {
                      const value = valueForComparison(item, field);
                      return (
                        <td key={item.id} className={value === NOT_REPORTED ? 'comparison-not-reported' : ''}>
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="comparison-interpretation">
            <h5>Why differences may matter</h5>
            {comparisonDifferences.length ? (
              <p>
                Retrieved text differs or uses different wording for {comparisonDifferences.join(', ')}. Differences in scope or design can affect which populations, settings, periods, or outcomes findings apply to. This is a prompt to inspect the original sources, not proof that their methods or conclusions conflict; summaries may be incomplete.
              </p>
            ) : (
              <p>
                The retrieved records do not provide enough clearly matched population, location, study-period, method, or sample-size details to assess direct comparability. Missing details are not evidence that the sources are alike.
              </p>
            )}
          </div>
        </section>
      )}

      {invalidDateRange && <p className="filter-error" role="alert">The custom date range is invalid because its start date is after its end date.</p>}

      {categories.length === 0 ? (
        <div className="source-empty">
          <h3>{items.length ? 'No sources match this filter' : 'No source records were discovered'}</h3>
          <p>{items.length
            ? 'Remove an active filter or select Clear All to see more retrieved results.'
            : 'No connected provider returned source records for this search. Review the provider notices above, configure optional search keys, or try broader terms. No empty categories are being presented as results.'}</p>
        </div>
      ) : categories.map(([category, categoryItems]) => {
        const page = categoryPages[category] ?? 0;
        const pageStart = page * RESULTS_PER_CATEGORY;
        const pageEnd = Math.min(pageStart + RESULTS_PER_CATEGORY, categoryItems.length);
        return (
        <section className="discovery-category" key={category} aria-labelledby={`category-${category.replaceAll(/[^a-z0-9]+/gi, '-')}`}>
          <div className="discovery-category-heading">
            <h4 id={`category-${category.replaceAll(/[^a-z0-9]+/gi, '-')}`}>{category}</h4>
            <span>{categoryItems.length}</span>
          </div>
          <div className="source-list">
            {categoryItems.slice(pageStart, pageEnd).map((item) => (
              <article className="source-card discovery-card" key={item.id}>
                <div className="source-card-topline">
                  <span className="source-type">{category}</span>
                  <span>{sourceDateLabel(item.date)}</span>
                </div>
                <h3>{item.title}</h3>
                <details className="discovery-details">
                  <summary>Details</summary>
                  <dl className="discovery-metadata">
                    <div><dt>Author / organization</dt><dd>{item.author || 'Not available'}</dd></div>
                    <div><dt>Publisher / website</dt><dd>{item.publisher || 'Not available'}</dd></div>
                    <div><dt>Source format</dt><dd>{item.type || (item.kind === 'web' ? 'Not available' : item.kind === 'video' ? 'Video' : 'Scholarly record')}</dd></div>
                    <div><dt>Evidence characteristics</dt><dd>{item.evidenceTypes.length ? item.evidenceTypes.join(', ') : 'Not established by retrieved metadata'}</dd></div>
                    <div><dt>Organization type</dt><dd>{item.organizationTypes.length ? item.organizationTypes.join(', ') : 'Not established by retrieved metadata'}</dd></div>
                    <div><dt>Geographic relevance</dt><dd>
                      {research.scope?.region
                        ? `Not available in source metadata; the search included ${research.scope.region}.`
                        : 'Not identified in source metadata'}
                    </dd></div>
                    <div><dt>Retrieval status</dt><dd>{item.kind === 'web' ? `Search snippet retrieved from ${item.provider}; original page not fetched` : item.kind === 'video' ? `Public video metadata retrieved from ${item.provider}; video not reviewed` : `Catalog metadata retrieved from ${item.provider}`}</dd></div>
                    <div><dt>Full-text availability</dt><dd>{item.openAccessUrl ? 'A catalog-provided full-text link is available; full text was not fetched' : item.openAccess ? 'Catalog marks this record open access; full text was not fetched' : 'Not determined from retrieved metadata'}</dd></div>
                    <div><dt>Original URL</dt><dd className="discovery-url"><a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a></dd></div>
                  </dl>
                  <div className="discovery-relevance">
                    <strong>Why it may be relevant</strong>
                    <p>
                      {item.relevanceOverlap} of {item.relevanceTermCount} topic words matched the title, retrieved text, or publisher. Returned by {item.provider} for “{item.query}”. This word overlap is not an AI relevance review; check the original source.
                    </p>
                    <strong>Possible research area</strong>
                    <p>{item.possibleResearchArea || 'Not automatically identified'}</p>
                  </div>
                  {item.description && (
                    <p className="discovery-description">{item.description}</p>
                  )}
                  {item.evidence ? (
                    <details className="source-abstract">
                      <summary>View retrieved text (metadata or snippet, not full text)</summary>
                      <p>{item.evidence}</p>
                    </details>
                  ) : (
                    <p className="source-availability">Description or evidence text: Not available.</p>
                  )}
                  <section className="source-review-checklist" aria-label={`Independent review of ${item.title}`}>
                    <div>
                      <h4>Independent source check</h4>
                      <p>The app has not verified this source. Review the original before assessing its content.</p>
                    </div>
                    <label className="source-review-checkbox">
                      <input
                        type="checkbox"
                        checked={sourceReviews[item.id]?.reviewed ?? false}
                        onChange={(event) => saveSourceReview(item, { reviewed: event.target.checked })}
                      />
                      <span>I reviewed the original source</span>
                    </label>
                    <label className="source-review-notes">
                      <span>Review notes <small>(saved in this browser)</small></span>
                      <textarea
                        value={sourceReviews[item.id]?.notes ?? ''}
                        onChange={(event) => saveSourceReview(item, { notes: event.target.value })}
                        maxLength={SOURCE_REVIEW_NOTES_LIMIT}
                        rows={3}
                        placeholder="Record context, authorship, date, evidence, or limitations you checked."
                      />
                    </label>
                    <p className="source-review-status" role="status">
                      {sourceReviews[item.id]?.reviewed
                        ? 'Marked reviewed by you; this is not an automated verification.'
                        : 'Not marked reviewed.'}
                    </p>
                  </section>
                </details>
                <div className="discovery-actions">
                  <a className="btn btn-primary" href={item.url} target="_blank" rel="noopener noreferrer">Open Original Source</a>
                  {item.openAccessUrl && <a className="btn btn-secondary" href={item.openAccessUrl} target="_blank" rel="noopener noreferrer">Open full-text link</a>}
                  <button type="button" className="btn btn-secondary" onClick={() => {
                    setProjectDialogItem(item);
                    setSelectedProjectId(savedProjects[0]?.id ?? '');
                    setNewProjectName('');
                    setCreatingProject(savedProjects.length === 0);
                  }}>
                    Save to project
                  </button>
                  <label className="discovery-compare">
                    <input
                      type="checkbox"
                      checked={comparedIds.has(item.id)}
                      disabled={!comparedIds.has(item.id) && comparedIds.size >= MAX_COMPARE_SOURCES}
                      onChange={() => toggleCompared(item)}
                    />
                    Compare source
                  </label>
                  <button type="button" className="btn btn-ghost" onClick={() => onFindSimilar(item.title)}>
                    Find similar sources
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setExcludedIds((current) => new Set(current).add(item.id));
                      setComparedIds((current) => {
                        const next = new Set(current);
                        next.delete(item.id);
                        return next;
                      });
                      setNotice('Source excluded from this discovery view. It remains in the saved research record.');
                    }}
                  >
                    Exclude from results
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="discovery-page-actions">
            <span>
              Showing {pageStart + 1}–{pageEnd} of {categoryItems.length.toLocaleString()}
            </span>
            {page > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCategoryPages((current) => ({
                  ...current,
                  [category]: page - 1,
                }))}
              >
                Previous {RESULTS_PER_CATEGORY} sources
              </button>
            )}
            {pageEnd < categoryItems.length && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCategoryPages((current) => ({
                  ...current,
                  [category]: page + 1,
                }))}
              >
                Next {Math.min(RESULTS_PER_CATEGORY, categoryItems.length - pageEnd)} sources
              </button>
            )}
          </div>
        </section>
      );})}

      {projectDialogItem && (
        <div className="source-project-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setProjectDialogItem(null);
        }}>
          <section className="source-project-dialog" role="dialog" aria-modal="true" aria-labelledby="source-project-dialog-title">
            <button type="button" className="source-project-dialog-close" onClick={() => setProjectDialogItem(null)} aria-label="Close project picker">×</button>
            <p className="research-eyebrow">Add source</p>
            <h3 id="source-project-dialog-title">{projectDialogItem.title}</h3>
            {projectStorageWarning && <p className="discovery-warning" role="status">{projectStorageWarning}</p>}
            {projectActionError && <p className="discovery-warning" role="alert">{projectActionError}</p>}
            <div className="source-project-dialog-mode">
              {savedProjects.length > 0 && (
                <label>
                  <input name="project-save-mode" type="radio" checked={!creatingProject} onChange={() => setCreatingProject(false)} />
                  Add to an existing project
                </label>
              )}
              <label>
                <input name="project-save-mode" type="radio" checked={creatingProject} onChange={() => setCreatingProject(true)} />
                Create a new project
              </label>
            </div>
            {creatingProject ? (
              <label className="source-project-name-field">
                <span>Project name</span>
                <input
                  autoFocus
                  maxLength={100}
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder="e.g. Climate policy sources"
                />
              </label>
            ) : (
              <label className="source-project-name-field">
                <span>Choose project</span>
                <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                  {savedProjects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="discovery-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  let projectId = selectedProjectId;
                  if (creatingProject) {
                    projectId = onCreateSavedProject(newProjectName, {
                      ...projectDialogItem,
                      savedFor: research.question,
                    });
                    if (!projectId) return;
                    setNotice('Project created and source saved to it.');
                    setProjectDialogItem(null);
                    return;
                  }
                  if (!projectId) return;
                  const saved = onAddSourceToProject(projectId, {
                    ...projectDialogItem,
                    savedFor: research.question,
                  });
                  if (saved) {
                    setNotice('Source saved to the selected project.');
                    setProjectDialogItem(null);
                  }
                }}
              >
                {creatingProject ? 'Create project and add source' : 'Add source to project'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setProjectDialogItem(null)}>Cancel</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
