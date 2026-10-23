import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  categoryFor,
  sourceDateLabel,
  sourceHost,
  SOURCE_CATEGORIES,
} from './sourceCategories.js';
import {
  assessQuestionContext,
  compileSourceFilters,
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
const MAX_AI_ASSESSMENT_SOURCES = 50;
const AI_REQUEST_BATCH_SIZE = 25;
const MIN_AI_RELEVANCE_SCORE = 55;
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
      rawContent: source.abstract || '',
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
      rawContent: source.rawContent || '',
      abstract: '',
      evidence: source.rawContent || source.description || '',
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
      rawContent: video.description || '',
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
    const contextReview = assessQuestionContext(
      [item.rawContent, item.description, item.abstract, item.evidence]
        .filter((text) => typeof text === 'string' && text.trim())
        .join('. '),
      research.question,
    );
    return {
      ...categorized,
      filterSearchText: sourceSearchText(categorized),
      filterGeographyText: sourceGeographyText(categorized),
      organizationTypes: organizationTypesFor(categorized),
      evidenceTypes: evidenceTypesFor(categorized),
      contextReview,
      relevanceOverlap: contextReview.matchedTerms.length,
      relevanceTermCount: queryWords.length,
      possibleResearchArea: possibleArea(categorized, researchAreas),
    };
  });
}

function overviewSourceText(item) {
  return [...new Set([
    item.rawContent,
    item.description,
    item.abstract,
    item.evidence,
  ].filter((text) => typeof text === 'string' && text.trim()))]
    .join('\n')
    .slice(0, 3000);
}

function overviewDate(item) {
  const timestamp = Date.parse(item.date);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function selectOverviewSources(items) {
  return items
    .filter((item) => overviewSourceText(item))
    .sort((left, right) =>
      Number(right.contextReview.relevant) - Number(left.contextReview.relevant) ||
      overviewDate(right) - overviewDate(left) ||
      Number(right.kind === 'web') - Number(left.kind === 'web'),
    )
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      title: item.title,
      date: item.date || '',
      text: overviewSourceText(item),
      url: item.url,
      provider: item.provider,
    }));
}

export default function SourceDiscovery({
  research,
  sourceSearchOpen = false,
  onCloseSourceSearch,
  sourceSearchToggleRef,
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
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [categoryPages, setCategoryPages] = useState({});
  const [filters, setFilters] = useState(() => ({
    ...INITIAL_FILTERS,
    categories: research.relatedSourceCategories ?? [],
  }));
  const [notice, setNotice] = useState('');
  const [aiScores, setAiScores] = useState({});
  const [aiAssessmentQuestion, setAiAssessmentQuestion] = useState('');
  const [aiFilterActive, setAiFilterActive] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [topicOverviewResult, setTopicOverviewResult] = useState(null);
  const [topicOverviewLoading, setTopicOverviewLoading] = useState(false);
  const [topicOverviewError, setTopicOverviewError] = useState('');
  const [topicOverviewRetry, setTopicOverviewRetry] = useState(0);
  const [reviewStorageWarning, setReviewStorageWarning] = useState('');
  const [projectDialogItem, setProjectDialogItem] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(savedProjects[0]?.id ?? '');
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(savedProjects.length === 0);
  const deferredFilters = useDeferredValue(filters);
  const filterDrawerRef = useRef(null);
  const sourceSearchInputRef = useRef(null);
  const sourceSearchPanelRef = useRef(null);
  const previousResearch = useRef(research);

  useEffect(() => {
    if (sourceSearchOpen) sourceSearchInputRef.current?.focus();
  }, [sourceSearchOpen]);

  useEffect(() => {
    if (!sourceSearchOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (
        !sourceSearchToggleRef.current?.contains(event.target) &&
        !sourceSearchPanelRef.current?.contains(event.target)
      ) {
        onCloseSourceSearch?.(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onCloseSourceSearch?.(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [sourceSearchOpen, onCloseSourceSearch, sourceSearchToggleRef]);

  useEffect(() => {
    if (!filterDrawerOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!filterDrawerRef.current?.contains(event.target)) {
        filterDrawerRef.current.open = false;
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') filterDrawerRef.current.open = false;
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [filterDrawerOpen]);

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
  const overviewSources = useMemo(() => selectOverviewSources(items), [items]);
  const overviewSourceSignature = overviewSources.map(({ id }) => id).join('|');
  useEffect(() => {
    if (!overviewSources.length) {
      setTopicOverviewResult(null);
      setTopicOverviewError('');
      setTopicOverviewLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setTopicOverviewResult(null);
    setTopicOverviewError('');
    setTopicOverviewLoading(true);

    const sourcesById = new Map(overviewSources.map((source) => [source.id, source]));
    fetch('/api/research/topic-overview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question: research.question,
        sources: overviewSources.map(({ id, title, date, text }) => ({ id, title, date, text })),
      }),
      signal: controller.signal,
    }).then(async (response) => {
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error('The AI topic overview returned an unreadable response.');
      }
      if (!response.ok) {
        throw new Error(result.error || `The AI topic overview failed (${response.status}).`);
      }
      if (typeof result.definition !== 'string' ||
        typeof result.currentSummary !== 'string' ||
        !Array.isArray(result.sourceIds)) {
        throw new Error('The AI returned an incomplete topic overview.');
      }
      return {
        definition: result.definition,
        currentSummary: result.currentSummary,
        sources: result.sourceIds.map((id) => sourcesById.get(id)).filter(Boolean),
      };
    }).then((result) => {
      setTopicOverviewResult(result);
    }).catch((error) => {
      if (error.name === 'AbortError') return;
      setTopicOverviewError(error.message || 'The AI topic overview could not be generated.');
    }).finally(() => {
      if (!controller.signal.aborted) setTopicOverviewLoading(false);
    });

    return () => controller.abort();
  }, [
    overviewSourceSignature,
    research.id,
    research.question,
    research.retrievedAt,
    topicOverviewRetry,
  ]);
  const filterContext = useMemo(
    () => ({ researchAreas: research.analysis.researchAreas }),
    [research.analysis.researchAreas],
  );
  const compiledFilters = useMemo(
    () => compileSourceFilters(deferredFilters, filterContext),
    [deferredFilters, filterContext],
  );
  const availableItems = useMemo(() => {
    const relevanceQuestion = deferredFilters.relevanceQuestion.trim() || research.question;
    const useAiQuestion = aiFilterActive &&
      aiAssessmentQuestion === relevanceQuestion;
    const assessmentMatchesQuestion = aiAssessmentQuestion === relevanceQuestion &&
      Object.keys(aiScores).length > 0;
    const noStrongAiMatches = assessmentMatchesQuestion &&
      !Object.values(aiScores).some(({ score }) => score >= MIN_AI_RELEVANCE_SCORE);
    const filtersToApply = useAiQuestion || noStrongAiMatches || !deferredFilters.relevanceQuestion.trim()
      ? { ...deferredFilters, relevanceQuestion: '' }
      : deferredFilters;
    const compiled = useAiQuestion || noStrongAiMatches
      ? compileSourceFilters(filtersToApply, filterContext)
      : compiledFilters;
    const matches = classifiedItems
      .filter((item) => !excludedIds.has(item.id))
      .filter((item) => matchesSourceFilters(item, filtersToApply, filterContext, compiled));
    const sorted = sortSources(matches, deferredFilters.sort);
    if (!useAiQuestion) return sorted;
    const originalOrder = new Map(sorted.map((item, index) => [item.id, index]));
    return sorted
      .filter((item) => (aiScores[item.id]?.score ?? -1) >= MIN_AI_RELEVANCE_SCORE)
      .sort((left, right) =>
        aiScores[right.id].score - aiScores[left.id].score ||
        originalOrder.get(left.id) - originalOrder.get(right.id),
      );
  }, [
    aiAssessmentQuestion,
    aiFilterActive,
    aiScores,
    classifiedItems,
    deferredFilters,
    excludedIds,
    filterContext,
    compiledFilters,
    research.question,
  ]);
  const aiCandidates = useMemo(() => {
    const filtersWithoutKeywordRelevance = { ...deferredFilters, relevanceQuestion: '' };
    const compiledWithoutKeywordRelevance = compileSourceFilters(
      filtersWithoutKeywordRelevance,
      filterContext,
    );
    return sortSources(classifiedItems
      .filter((item) => !excludedIds.has(item.id))
      .filter((item) => matchesSourceFilters(
        item,
        filtersWithoutKeywordRelevance,
        filterContext,
        compiledWithoutKeywordRelevance,
      )), deferredFilters.sort)
      .slice(0, MAX_AI_ASSESSMENT_SOURCES);
  }, [classifiedItems, deferredFilters, excludedIds, filterContext]);
  const aiCandidateSignature = aiCandidates.map((item) => item.id).join('|');
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
    setAiScores({});
    setAiAssessmentQuestion('');
    setAiFilterActive(false);
    setAiError('');
  }, [research.retrievedAt]);

  useEffect(() => {
    setFilters({
      ...INITIAL_FILTERS,
      categories: research.relatedSourceCategories ?? [],
    });
    setAiScores({});
    setAiAssessmentQuestion('');
    setAiFilterActive(false);
    setAiError('');
  }, [research.id]);

  useEffect(() => {
    setCategoryPages({});
  }, [filters]);

  const clearAllFilters = () => {
    setFilters({
      ...INITIAL_FILTERS,
    });
    setExcludedIds(new Set());
    setAiScores({});
    setAiAssessmentQuestion('');
    setAiFilterActive(false);
    setAiError('');
  };

  const toggleFilterValue = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((entry) => entry !== value)
        : [...current[key], value],
    }));
  };

  const assessRelevanceWithAi = async () => {
    const question = filters.relevanceQuestion.trim() || research.question;
    if (question.length < 8) {
      setAiError('Enter a topic or question with at least 8 characters before assessing relevance.');
      return;
    }
    if (!aiCandidates.length) {
      setAiError('No sources match the other filters to assess. Clear or adjust filters and try again.');
      return;
    }

    setAiBusy(true);
    setAiError('');
    setAiFilterActive(false);
    setAiScores({});
    setAiAssessmentQuestion(question);
    try {
      const assessments = {};
      for (let offset = 0; offset < aiCandidates.length; offset += AI_REQUEST_BATCH_SIZE) {
        const batch = aiCandidates.slice(offset, offset + AI_REQUEST_BATCH_SIZE);
        const response = await fetch('/api/research/ai-relevance', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            question,
            sources: batch.map((item) => ({
              id: item.id,
              title: item.title.slice(0, 500),
              text: [...new Set([
                item.rawContent,
                item.description,
                item.abstract,
                item.evidence,
              ].filter((text) => typeof text === 'string' && text.trim()))]
                .join('\n')
                .slice(0, 2500),
            })),
          }),
        });
        let result;
        try {
          result = await response.json();
        } catch {
          throw new Error('The AI relevance service returned an unreadable response.');
        }
        if (!response.ok) {
          throw new Error(result.error || 'AI relevance assessment could not be completed.');
        }
        if (!Array.isArray(result.evaluations) || result.evaluations.length !== batch.length) {
          throw new Error('The AI returned an incomplete assessment. No scores were applied.');
        }
        const expectedIds = new Set(batch.map((item) => item.id));
        for (const evaluation of result.evaluations) {
          if (!expectedIds.has(evaluation.id) ||
            !Number.isInteger(evaluation.score) ||
            evaluation.score < 0 ||
            evaluation.score > 100 ||
            typeof evaluation.reason !== 'string' ||
            typeof evaluation.context !== 'string') {
            throw new Error('The AI returned an invalid assessment. No scores were applied.');
          }
          assessments[evaluation.id] = {
            score: evaluation.score,
            reason: evaluation.reason,
            context: evaluation.context,
          };
        }
      }
      setAiScores(assessments);
      const strongMatches = Object.values(assessments)
        .filter(({ score }) => score >= MIN_AI_RELEVANCE_SCORE).length;
      setAiFilterActive(strongMatches > 0);
      setNotice(strongMatches
        ? `AI assessed ${aiCandidates.length} source${aiCandidates.length === 1 ? '' : 's'} against “${question}”; ${strongMatches} met the strong contextual-match threshold. Scores indicate topical relevance, not factual accuracy or source quality.`
        : `AI assessed ${aiCandidates.length} source${aiCandidates.length === 1 ? '' : 's'} against “${question}” but found no strong contextual matches. All retrieved sources remain available for manual review.`);
    } catch (error) {
      setAiScores({});
      setAiError(error.message || 'AI relevance assessment could not be completed.');
    } finally {
      setAiBusy(false);
    }
  };

  const autoAiResearchKey = useRef('');
  useEffect(() => {
    if (!aiCandidates.length ||
      (filters.relevanceQuestion.trim() && filters.relevanceQuestion !== research.question)) return;
    const researchKey = `${research.id}:${research.retrievedAt}`;
    if (autoAiResearchKey.current === researchKey) return;
    autoAiResearchKey.current = researchKey;
    assessRelevanceWithAi();
  }, [aiCandidateSignature, filters.relevanceQuestion, research.id, research.question, research.retrievedAt]);

  const aiStrongMatchCount = Object.values(aiScores)
    .filter(({ score }) => score >= MIN_AI_RELEVANCE_SCORE).length;
  const availableCategories = [...new Set(classifiedItems.map((item) => item.category))];
  const availableOrganizations = [...new Set(classifiedItems.flatMap((item) => item.organizationTypes))];
  const availableEvidence = [...new Set(classifiedItems.flatMap((item) => item.evidenceTypes))];
  const organizationMetadataMissingCount = items.filter((item) =>
    !item.organization && !item.publisher && !item.author,
  ).length;
  const evidenceMetadataMissingCount = items.filter((item) =>
    !item.type && !item.description && !item.abstract,
  ).length;
  return (
    <div className="discovery-workspace">
      <section className="source-result-overview" aria-labelledby="source-result-overview-title" aria-live="polite">
        <h3 id="source-result-overview-title">Topic overview</h3>
        <p className="topic-overview-disclosure">
          AI explains the topic, then summarizes information from up to eight retrieved source descriptions or abstracts.
          The cited source records are shown below; this overview is not independently verified. The research question and selected source text are sent to the configured AI provider; usage may incur charges.
        </p>
        <p className="topic-overview-disclosure" role={aiBusy ? 'status' : undefined}>
          {aiBusy
            ? `AI is checking up to ${aiCandidates.length} retrieved sources against your research question.`
            : aiAssessmentQuestion === (filters.relevanceQuestion.trim() || research.question) && Object.keys(aiScores).length
              ? `AI assessed ${Object.keys(aiScores).length} sources; ${aiStrongMatchCount} met the strong contextual-match threshold. Scores indicate topic relevance, not factual accuracy or source credibility.${aiStrongMatchCount === 0 ? ' All retrieved sources remain available for manual review.' : ''}`
              : aiError
                ? `AI source matching did not complete: ${aiError} Retrieved sources remain available for review.`
                : 'AI will assess retrieved source text against your research question; scores indicate relevance, not factual accuracy.'}
        </p>
        {topicOverviewLoading && <p role="status">Generating a topic definition and checking the retrieved sources for current developments…</p>}
        {topicOverviewError && (
          <div className="topic-overview-error" role="alert">
            <p>Topic overview could not be generated: {topicOverviewError}</p>
            <p className="filter-limitation">
              Local development requires <code>ANTHROPIC_API_KEY</code> in the project-root <code>.env.local</code>; restart <code>npm run dev</code> after adding it. Hosted use requires the API routes and key in the Vercel deployment.
            </p>
            <button className="btn btn-secondary" type="button" onClick={() => setTopicOverviewRetry((retry) => retry + 1)}>
              Retry topic overview
            </button>
          </div>
        )}
        {topicOverviewResult && (
          <div className="topic-overview-content">
            <div>
              <h4>What the topic means</h4>
              <p>{topicOverviewResult.definition}</p>
            </div>
            <div>
              <h4>Current developments in retrieved sources</h4>
              <p>{topicOverviewResult.currentSummary}</p>
              {topicOverviewResult.sources.length > 0 && (
                <ul className="topic-overview-citations" aria-label="Sources for current developments">
                  {topicOverviewResult.sources.map((source) => (
                    <li key={source.id}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
                      <span>{[source.provider, source.date].filter(Boolean).join(' · ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      <div
        id="source-search-panel"
        ref={sourceSearchPanelRef}
        className={`discovery-search-panel${sourceSearchOpen ? ' is-open' : ''}`}
        aria-hidden={!sourceSearchOpen}
      >
        <div className="discovery-search-panel-content">
          <label className="filter-search-field discovery-search-field">
            <span>Search source titles and descriptions</span>
            <input
              ref={sourceSearchInputRef}
              tabIndex={sourceSearchOpen ? 0 : -1}
              value={filters.search}
              onChange={(event) => {
                const value = event.target.value;
                setFilters((current) => ({ ...current, search: value }));
                if (value.trim() && filterDrawerRef.current) filterDrawerRef.current.open = true;
              }}
              placeholder="Search within retrieved sources"
            />
          </label>
        </div>
      </div>

      {comparedItems.length > 0 && (
        <p className="comparison-instructions">{comparedItems.length} source{comparedItems.length === 1 ? '' : 's'} selected for comparison.</p>
      )}
      {reviewStorageWarning && <p className="discovery-warning" role="status">{reviewStorageWarning}</p>}
      {notice && <p className="discovery-notice" role="status">{notice}</p>}

      {filterDrawerOpen && (
        <button
          className="source-filter-backdrop"
          type="button"
          aria-label="Close source filters"
          onClick={() => {
            if (filterDrawerRef.current) filterDrawerRef.current.open = false;
          }}
        />
      )}
      <details
        className="source-filter-drawer"
        ref={filterDrawerRef}
        onToggle={(event) => setFilterDrawerOpen(event.currentTarget.open)}
      >
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
              <legend>Sort sources</legend>
              <label className="filter-inline-label">
                <span>Sort by</span>
                <select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </label>
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
            </fieldset>

            <fieldset className="filter-section">
              <legend>Research relevance</legend>
              <label className="filter-inline-label">
                <span>Explore area</span>
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
                <span>Optional question-context filter</span>
                <input value={filters.relevanceQuestion} onChange={(event) => {
                  setFilters((current) => ({ ...current, relevanceQuestion: event.target.value }));
                  setAiScores({});
                  setAiAssessmentQuestion('');
                  setAiFilterActive(false);
                  setAiError('');
                }} placeholder="Optional: match this topic in retrieved source text" />
              </label>
            </fieldset>

            <fieldset className="filter-section">
              <legend>AI topical match</legend>
              <p className="ai-relevance-disclosure">
                AI automatically assesses up to {MAX_AI_ASSESSMENT_SOURCES} retrieved sources for every research topic. It compares the question with source text in context; a title or keyword match alone is not enough. The question and source titles/text are sent to Anthropic; API usage may incur charges. Scores estimate topical relevance, not factual accuracy or source credibility. The optional question-context filter above is an additional filter; leave it blank to keep results visible if AI is unavailable.
              </p>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={aiBusy || aiCandidates.length === 0}
                onClick={assessRelevanceWithAi}
              >
                {aiBusy ? 'Assessing sources with AI…' : aiAssessmentQuestion === (filters.relevanceQuestion.trim() || research.question) && Object.keys(aiScores).length
                  ? `Reassess ${aiCandidates.length} sources with AI`
                  : `Assess up to ${aiCandidates.length} sources with AI`}
              </button>
              {aiScores && Object.keys(aiScores).length > 0 && (
                <label className="filter-inline-label ai-relevance-toggle">
                  <input
                    type="checkbox"
                    checked={aiFilterActive && aiAssessmentQuestion === (filters.relevanceQuestion.trim() || research.question)}
                    onChange={(event) => setAiFilterActive(event.target.checked)}
                  />
                  <span>Show strong AI matches only ({MIN_AI_RELEVANCE_SCORE}+ / 100)</span>
                </label>
              )}
              {aiBusy && <p className="filter-limitation" role="status">Assessing up to {aiCandidates.length} sources. Each source uses only retrieved titles and text.</p>}
              {aiError && <p className="discovery-warning" role="alert">{aiError}</p>}
              {aiError && (
                <p className="filter-limitation">
                  Vercel environment variables are not available to local development. For local AI, add <code>ANTHROPIC_API_KEY</code> to the project-root <code>.env.local</code> and restart <code>npm run dev</code>.
                </p>
              )}
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
                {aiScores[item.id] && aiAssessmentQuestion === (filters.relevanceQuestion.trim() || research.question) && (
                  <p className="ai-relevance-badge">AI topical match: {aiScores[item.id].score}/100</p>
                )}
                <h3>{item.title}</h3>
                <details className="discovery-details" name="source-details">
                  <summary>Details</summary>
                  {aiScores[item.id] && aiAssessmentQuestion === (filters.relevanceQuestion.trim() || research.question) && (
                    <section className="ai-relevance-result" aria-label="AI topical relevance assessment">
                      <h4>AI topical relevance</h4>
                      <p><strong>Score:</strong> {aiScores[item.id].score}/100</p>
                      <p><strong>Why it matches:</strong> {aiScores[item.id].reason || 'No explanation returned.'}</p>
                      <p><strong>Supporting source text:</strong> {aiScores[item.id].context
                        ? `“${aiScores[item.id].context}”`
                        : 'No exact supporting excerpt was identified in the retrieved text.'}</p>
                      <p className="filter-limitation">AI relevance is an estimate based on retrieved text, not a fact-check, quality rating, or review of the original source.</p>
                    </section>
                  )}
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
                    <div><dt>Retrieval status</dt><dd>{item.kind === 'web' ? item.rawContent ? `Provider-extracted page text retrieved from ${item.provider}; the original page was not independently reviewed` : `Search snippet retrieved from ${item.provider}; original page not fetched` : item.kind === 'video' ? `Public video metadata retrieved from ${item.provider}; video not reviewed` : `Catalog metadata retrieved from ${item.provider}`}</dd></div>
                    <div><dt>Full-text availability</dt><dd>{item.openAccessUrl ? 'A catalog-provided full-text link is available; full text was not fetched' : item.openAccess ? 'Catalog marks this record open access; full text was not fetched' : 'Not determined from retrieved metadata'}</dd></div>
                    <div><dt>Original URL</dt><dd className="discovery-url"><a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a></dd></div>
                  </dl>
                  {item.description && (
                    <p className="discovery-description">{item.description}</p>
                  )}
                  {item.evidence ? (
                    <details className="source-abstract">
                      <summary>Abstract</summary>
                      <p>{item.evidence}</p>
                    </details>
                  ) : (
                    <p className="source-availability">Description or evidence text: Not available.</p>
                  )}
                  <section className="source-review-checklist" aria-label={`Independent review of ${item.title}`}>
                    <div>
                      <h4>Independent source check</h4>
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
