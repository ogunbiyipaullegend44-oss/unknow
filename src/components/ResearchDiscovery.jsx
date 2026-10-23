import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import ThemeToggle from './ThemeToggle.jsx';
import SourceDiscovery from './SourceDiscovery.jsx';
import ClaimEvidence from './ClaimEvidence.jsx';
import ResearchGaps from './ResearchGaps.jsx';
import RelatedTopics from './RelatedTopics.jsx';
import TrendingDiscover from './TrendingDiscover.jsx';
import OrganizationWorkspace from './OrganizationWorkspace.jsx';
import CommunityResearchHub from './CommunityResearchHub.jsx';
import { matchesQuestionRelevance, matchesVideoQuestion } from './sourceFilterUtils.js';
import { addResearchHistoryEntry, compactResearchForHistory } from './researchHistory.js';
import { getTimeGreeting } from './landingGreeting.js';
import AccountCenter from './AccountCenter.jsx';
import { useCommunityAuth } from '../context/CommunityAuthContext.jsx';
import { neon } from '../community/neonClient.js';
import { getAvatarUrl } from '../neon/assetsClient.js';
import {
  addSourceToProject,
  createSavedProject,
  parseSavedProjects,
  removeSavedProject,
  removeSourceFromProject,
  updateSavedProject,
} from './savedResearchProjects.js';
import './ResearchDiscovery.css';

const HISTORY_KEY = 'osint-mapping-tool.research-history.v1';
const SAVED_PROJECTS_KEY = 'osint-mapping-tool.saved-projects.v1';
const LEGACY_SAVED_SOURCES_KEY = 'osint-mapping-tool.saved-sources.v1';
function newSavedProjectId() {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
const RESULTS_PER_PAGE = 50;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const AREA_SEARCH_STOP_WORDS = new Set([
  'about', 'across', 'after', 'also', 'and', 'are', 'background', 'between',
  'causes', 'context', 'does', 'effect', 'effects', 'evidence', 'find', 'for',
  'from', 'have', 'how', 'impact', 'into', 'limitations', 'look', 'methods',
  'outcomes', 'possible', 'related', 'studied', 'affected', 'affect', 'people',
  'systems', 'reported', 'which', 'that', 'the', 'their',
  'these', 'this', 'through', 'what', 'when', 'where', 'while', 'with',
]);

function loadHistory() {
  const stored = window.localStorage.getItem(HISTORY_KEY);
  if (!stored) return [];
  const parsed = JSON.parse(stored);
  if (!Array.isArray(parsed)) throw new Error('Saved research has an unsupported format.');
  const isHttpUrl = (value) => {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  };
  const isValidRecord = (item) =>
    item &&
    typeof item.id === 'string' &&
    typeof item.question === 'string' &&
    typeof item.retrievedAt === 'string' &&
    Number.isFinite(Date.parse(item.retrievedAt)) &&
    Array.isArray(item.sources) &&
    item.sources.every((source) =>
      source &&
      typeof source.id === 'string' &&
      typeof source.title === 'string' &&
      typeof source.metadataSource === 'string' &&
      isHttpUrl(source.url),
    ) &&
    Array.isArray(item.analysis?.purposes) &&
    Array.isArray(item.analysis?.researchAreas);

  if (parsed.some((item) => !isValidRecord(item))) {
    throw new Error('Saved research has an unsupported format.');
  }
  return parsed.map((item) => compactResearchForHistory(item, item.id));
}

function sourceDate(source) {
  if (!source.publicationYear) return 'Date not available';
  if (source.publicationMonth) {
    return `${MONTHS[source.publicationMonth - 1].slice(0, 3)} ${source.publicationYear}`;
  }
  return String(source.publicationYear);
}

function matchesDate(source, range) {
  if (range === 'any') return true;
  if (!source.publicationYear) return false;
  return source.publicationYear >= new Date().getFullYear() - Number(range);
}

function videoDate(video) {
  return video.publishedAt ? new Date(video.publishedAt) : null;
}

function matchesVideoDate(video, range) {
  if (range === 'any') return true;
  const publishedAt = videoDate(video);
  if (!publishedAt || !Number.isFinite(publishedAt.getTime())) return false;
  return publishedAt >= new Date(Date.now() - Number(range) * 365.25 * 24 * 60 * 60 * 1000);
}

function formatVideoDate(video) {
  const date = videoDate(video);
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleDateString()
    : 'Date not available';
}

function webSourceDate(source) {
  if (!source.publishedAt) return 'Date not available';
  const date = new Date(source.publishedAt);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : 'Date not available';
}

function matchesWebDate(source, range) {
  if (range === 'any') return true;
  if (!source.publishedAt) return false;
  const date = new Date(source.publishedAt);
  return Number.isFinite(date.getTime()) &&
    date >= new Date(Date.now() - Number(range) * 365.25 * 24 * 60 * 60 * 1000);
}

function researchAreaTerms(area) {
  const text = [area.title, area.description, ...(area.questions ?? [])].join(' ');
  return [...new Set(
    (text.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [])
      .filter((term) => term.length > 3 && !AREA_SEARCH_STOP_WORDS.has(term)),
  )];
}

function matchesResearchArea(source, area) {
  const terms = researchAreaTerms(area);
  if (!terms.length) return false;
  const content = `${source.title} ${source.description ?? ''} ${source.abstract ?? ''} ${source.publisher ?? ''} ${source.journal ?? ''} ${source.channel ?? ''}`
    .toLocaleLowerCase();
  const matches = terms.filter((term) => content.includes(term)).length;
  const requiredMatches = source.platform ? 1 : Math.min(2, terms.length);
  return matches >= requiredMatches;
}

function Icon({ name, size = 18 }) {
  const paths = {
    arrow: <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    close: <><path d="m18 6-12 12" /><path d="m6 6 12 12" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
    compass: <><circle cx="12" cy="12" r="9" /><path d="m15.8 8.2-2.4 5.2-5.2 2.4 2.4-5.2 5.2-2.4Z" /></>,
    dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
    gear: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4L17 17.4a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V4a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2.9Z" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
    filePlus: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M12 12v6m-3-3h6" /></>,
    folder: <><path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M3 9h18" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    workspace: <><circle cx="12" cy="12" r="2.5" /><circle cx="5" cy="6" r="1.5" /><circle cx="19" cy="6" r="1.5" /><circle cx="5" cy="18" r="1.5" /><circle cx="19" cy="18" r="1.5" /><path d="m10 10-4-3M14 10l4-3M10 14l-4 3m8-3 4 3" /></>,
    edit: <><path d="m16 5 3 3" /><path d="M4 20h4l11-11a2.1 2.1 0 0 0-4-4L4 16v4Z" /></>,
    enter: <><path d="M10 17 15 12 10 7" /><path d="M15 12H3" /><path d="M21 3v18" /></>,
    menu: <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z" /></>,
    external: <><path d="M15 3h6v6" /><path d="m10 14 11-11" /><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" /></>,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export default function ResearchDiscovery({
  initialPage = 'research',
  entryKey,
}) {
  const { user, signOut } = useCommunityAuth();
  const [displayName, setDisplayName] = useState(
    () => window.localStorage.getItem('attis:display-name')?.trim() ?? '',
  );
  const firstName = user && displayName.trim()
    ? displayName.trim().split(/\s+/)[0]
    : '';
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [region, setRegion] = useState('');
  const [regionMode, setRegionMode] = useState('worldwide');
  const [sourceLimit, setSourceLimit] = useState('all');
  const [dateMode, setDateMode] = useState('any');
  const [year, setYear] = useState('');
  const [startYear, setStartYear] = useState('');
  const [endYear, setEndYear] = useState('');
  const [month, setMonth] = useState('');
  const [purposes, setPurposes] = useState(['general']);
  const [research, setResearch] = useState(null);
  const [videoRefreshState, setVideoRefreshState] = useState(null);
  const [isEditingResearchQuestion, setIsEditingResearchQuestion] = useState(false);
  const [editedResearchQuestion, setEditedResearchQuestion] = useState('');
  const [researchPages, setResearchPages] = useState([]);
  const [researchScreen, setResearchScreen] = useState('form');
  const [history, setHistory] = useState([]);
  const [historyNotice, setHistoryNotice] = useState('');
  const [savedProjects, setSavedProjects] = useState([]);
  const [projectStorageWarning, setProjectStorageWarning] = useState('');
  const [selectedSavedProjectId, setSelectedSavedProjectId] = useState(null);
  const [savedProjectsExpanded, setSavedProjectsExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => !window.matchMedia('(max-width: 700px)').matches,
  );
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [projectActionError, setProjectActionError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [researchOptionsOpen, setResearchOptionsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [filterToolsOpen, setFilterToolsOpen] = useState(false);
  const [dateRange, setDateRange] = useState('any');
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState('discovery');
  const [activePage, setActivePageState] = useState(initialPage);
  const [hasNavigatedFromHome, setHasNavigatedFromHome] = useState(false);
  const [sourceSearchOpen, setSourceSearchOpen] = useState(false);
  const [resultPageLimit, setResultPageLimit] = useState(RESULTS_PER_PAGE);
  const [selectedResearchArea, setSelectedResearchArea] = useState(null);
  const [researchDefaults, setResearchDefaults] = useState(null);
  const activePageRef = useRef(initialPage);
  const pageHistoryRef = useRef([]);
  const sidebarRef = useRef(null);
  const sourceSearchToggleRef = useRef(null);
  const profileButtonRef = useRef(null);
  const profilePopoverRef = useRef(null);
  const questionInputRef = useRef(null);
  const researchOptionsRef = useRef(null);
  const outsideResearchOptionsClicksRef = useRef(0);
  const videoRefreshAttemptRef = useRef('');

  useEffect(() => {
    const hasStaleKeyWarning = (research?.videoWarnings ?? [])
      .some((warning) => /YouTube: add YOUTUBE_API_KEY/i.test(warning));
    if (!research || view !== 'videos' || !hasStaleKeyWarning) return;

    const attemptKey = `${research.id}:${research.retrievedAt}`;
    if (videoRefreshAttemptRef.current === attemptKey) return;
    videoRefreshAttemptRef.current = attemptKey;
    setVideoRefreshState({ researchId: research.id, status: 'checking' });

    const updateStoredResearch = (updated) => {
      setResearch((current) => current?.id === updated.id ? updated : current);
      setResearchPages((current) => current.map((page) =>
        page.id === updated.id ? updated : page,
      ));
      setHistory((current) => {
        try {
          const saved = compactResearchForHistory(updated, updated.id);
          const nextHistory = addResearchHistoryEntry(current, saved, {
            replaceMatchingQuestion: true,
          });
          window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
          return nextHistory;
        } catch (error) {
          setHistoryNotice(`Refreshed videos are available in this session, but browser history could not be updated: ${error.message}`);
          return current;
        }
      });
    };

    const refreshVideos = async () => {
      try {
        const healthResponse = await fetch('/api/health');
        let health;
        try {
          health = await healthResponse.json();
        } catch {
          throw new Error('The deployment health check returned an unreadable response.');
        }
        if (!healthResponse.ok) {
          throw new Error(health.error || `The deployment health check failed (${healthResponse.status}).`);
        }
        if (!health.videoProviders?.youtube) {
          setVideoRefreshState({
            researchId: research.id,
            status: 'unconfigured',
            message: 'This deployment cannot see YOUTUBE_API_KEY. Confirm the key is enabled for the Production environment in Vercel, then redeploy.',
          });
          return;
        }

        setVideoRefreshState({
          researchId: research.id,
          status: 'refreshing',
        });
        const scope = research.scope ?? {};
        const response = await fetch('/api/research/videos', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            question: research.question,
            region: scope.region ?? '',
            year: scope.year ?? null,
            month: scope.month ?? '',
            fromYear: scope.fromYear ?? null,
            toYear: scope.toYear ?? null,
          }),
        });
        let result;
        try {
          result = await response.json();
        } catch {
          throw new Error(response.status === 404
            ? 'Video refresh is not available in this deployment yet. Redeploy the latest application, then reopen Videos.'
            : 'The video refresh returned an unreadable response.');
        }
        if (!response.ok) {
          throw new Error(result.error || `Video refresh failed (${response.status}).`);
        }
        if (!Array.isArray(result.videos) || !Array.isArray(result.videoWarnings)) {
          throw new Error('The video refresh returned an incomplete result.');
        }

        const updated = {
          ...research,
          videos: result.videos,
          videoProviders: result.videoProviders ?? [],
          videoWarnings: result.videoWarnings,
          retrievedAt: new Date().toISOString(),
        };
        updateStoredResearch(updated);
        setVideoRefreshState({
          researchId: research.id,
          status: 'refreshed',
          message: `Video results refreshed with the configured providers. ${result.videos.length} video${result.videos.length === 1 ? '' : 's'} found.`,
        });
      } catch (refreshError) {
        setVideoRefreshState({
          researchId: research.id,
          status: 'error',
          message: refreshError.message || 'Video results could not be refreshed.',
        });
      }
    };

    refreshVideos();
  }, [research, view]);

  const setActivePage = (page) => {
    if (page === activePageRef.current) return;
    setHasNavigatedFromHome(true);
    pageHistoryRef.current.push(activePageRef.current);
    if (pageHistoryRef.current.length > 30) pageHistoryRef.current.shift();
    activePageRef.current = page;
    setActivePageState(page);
  };

  const goBackToRecentPage = () => {
    const previousPage = pageHistoryRef.current.pop();
    const destination = previousPage ?? 'history';
    activePageRef.current = destination;
    setActivePageState(destination);
  };

  useEffect(() => {
    setResultPageLimit(RESULTS_PER_PAGE);
  }, [dateRange, query, research, sort, view]);

  useEffect(() => {
    const textarea = questionInputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, window.innerHeight * 0.4, 360)}px`;
  }, [question]);

  useEffect(() => {
    const updateDisplayName = (event) => {
      const nextName = event.detail?.displayName?.trim() ?? '';
      setDisplayName(nextName);
      setProfileAvatarUrl(event.detail?.avatarUrl ?? '');
    };
    window.addEventListener('attis-profile-updated', updateDisplayName);
    return () => window.removeEventListener('attis-profile-updated', updateDisplayName);
  }, []);

  useEffect(() => {
    if (!user || !neon) {
      setResearchDefaults(null);
      setProfileAvatarUrl('');
      setDisplayName('');
      return undefined;
    }
    let active = true;
    setResearchDefaults(null);
    setProfileAvatarUrl('');
    setDisplayName(user.user_metadata?.displayName?.trim() || user.user_metadata?.display_name?.trim() || '');
    neon
      .from('user_profiles')
      .select('display_name, research_preferences, avatar_path')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error: preferenceError }) => {
        if (!active) return;
        if (preferenceError) {
          setProjectStorageWarning(`Research defaults could not be loaded: ${preferenceError.message}`);
          return;
        }
        setDisplayName(
          data?.display_name?.trim() ||
          user.user_metadata?.displayName?.trim() ||
          user.user_metadata?.display_name?.trim() ||
          '',
        );
        const saved = data?.research_preferences ?? {};
        const defaults = {
          default_purpose: saved.default_purpose ?? 'general',
          geographic_focus: saved.geographic_focus ?? 'worldwide',
          region: saved.region ?? '',
          publication_period: saved.publication_period ?? 'any',
          default_view: ['discovery', 'sources'].includes(saved.default_view)
            ? saved.default_view
            : 'discovery',
        };
        setResearchDefaults(defaults);
        setPurposes([defaults.default_purpose]);
        setRegionMode(defaults.geographic_focus === 'region' ? 'specific' : 'worldwide');
        setRegion(defaults.region);
        setDateRange(defaults.publication_period);
        if (data?.avatar_path) {
          getAvatarUrl(data.avatar_path)
            .then((signedUrl) => {
              if (!active) return;
              setProfileAvatarUrl(signedUrl);
            })
            .catch((signedError) => {
              if (active) setProjectStorageWarning(`Profile photo could not be loaded: ${signedError.message}`);
            });
        } else {
          setProfileAvatarUrl('');
        }
      })
      .catch((preferenceError) => {
        if (active) setProjectStorageWarning(`Research defaults could not be loaded: ${preferenceError.message}`);
      });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    pageHistoryRef.current = [];
    activePageRef.current = initialPage;
    setActivePageState(initialPage);
    setHasNavigatedFromHome(false);
  }, [entryKey, initialPage]);

  useEffect(() => {
    setFilterToolsOpen(false);
  }, [view]);

  useEffect(() => {
    if (view !== 'discovery') setSourceSearchOpen(false);
  }, [view]);

  useEffect(() => {
    if (!sidebarOpen) return undefined;

    const closeOnOutsideClick = (event) => {
      if (event.target instanceof Node && !sidebarRef.current?.contains(event.target)) {
        setSidebarOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (!profileOpen) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!(event.target instanceof Node)) return;
      if (
        profileButtonRef.current?.contains(event.target) ||
        profilePopoverRef.current?.contains(event.target)
      ) return;
      setProfileOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setProfileOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileOpen]);

  useEffect(() => {
    if (!researchOptionsOpen) return undefined;
    outsideResearchOptionsClicksRef.current = 0;

    const closeWhenClickingOutside = (event) => {
      if (!(event.target instanceof Node)) return;
      if (researchOptionsRef.current?.contains(event.target)) {
        outsideResearchOptionsClicksRef.current = 0;
        return;
      }
      outsideResearchOptionsClicksRef.current += 1;
      if (outsideResearchOptionsClicksRef.current >= 3) {
        outsideResearchOptionsClicksRef.current = 0;
        setResearchOptionsOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeWhenClickingOutside);
    return () => document.removeEventListener('pointerdown', closeWhenClickingOutside);
  }, [researchOptionsOpen]);

  useEffect(() => {
    try {
      setHistory(loadHistory());
    } catch {
      setNotice('Research history could not be read from this browser. You can still start a new search.');
    }
  }, []);

  useEffect(() => {
    try {
      const storedProjects = window.localStorage.getItem(SAVED_PROJECTS_KEY);
      const projects = parseSavedProjects(storedProjects);
      const legacySources = window.localStorage.getItem(LEGACY_SAVED_SOURCES_KEY);
      if (legacySources) {
        const parsedSources = JSON.parse(legacySources);
        if (!Array.isArray(parsedSources) || parsedSources.some((source) =>
          !source ||
          typeof source.id !== 'string' ||
          typeof source.title !== 'string' ||
          typeof source.url !== 'string' ||
          !['http:', 'https:'].includes(new URL(source.url).protocol)
        )) {
          throw new Error('Previously saved sources have an unsupported format.');
        }
        if (parsedSources.length) {
          const now = new Date().toISOString();
          const migration = createSavedProject(
            projects,
            'Saved sources',
            newSavedProjectId(),
            now,
          );
          const migratedProject = {
            ...migration[0],
            sources: parsedSources,
          };
          const migratedProjects = [migratedProject, ...projects];
          window.localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(migratedProjects));
          window.localStorage.removeItem(LEGACY_SAVED_SOURCES_KEY);
          setSavedProjects(migratedProjects);
          return;
        }
        window.localStorage.removeItem(LEGACY_SAVED_SOURCES_KEY);
      }
      setSavedProjects(projects);
    } catch (loadError) {
      setProjectStorageWarning(`Saved projects could not be loaded: ${loadError.message}`);
    }
  }, []);

  const visibleSources = useMemo(() => {
    if (!research || view !== 'sources') return [];
    const terms = deferredQuery.trim().toLocaleLowerCase();
    return research.sources
      .filter((source) => matchesQuestionRelevance(
        source.abstract ?? '',
        research.question,
      ))
      .filter((source) => {
        const scope = research.scope;
        const fromYear = scope?.fromYear ?? scope?.year;
        const toYear = scope?.toYear ?? scope?.year;
        if (!fromYear || !toYear) return true;
        if (!source.publicationYear || source.publicationYear < fromYear || source.publicationYear > toYear) {
          return false;
        }
        return fromYear !== toYear || !scope.month ||
          source.publicationMonth === MONTHS.indexOf(scope.month) + 1;
      })
      .filter((source) => matchesDate(source, dateRange))
      .filter((source) => {
        if (!terms) return true;
        return `${source.title} ${source.abstract} ${source.publisher} ${source.journal}`
          .toLocaleLowerCase()
          .includes(terms);
      })
      .sort((a, b) => {
        if (!a.publicationYear) return b.publicationYear ? 1 : 0;
        if (!b.publicationYear) return -1;
        const difference = (a.publicationYear ?? 0) - (b.publicationYear ?? 0);
        return sort === 'newest' ? -difference : difference;
      });
  }, [dateRange, deferredQuery, research, sort, view]);

  const visibleVideos = useMemo(() => {
    if (!research || view !== 'videos') return [];
    const terms = deferredQuery.trim().toLocaleLowerCase();
    return (research.videos ?? [])
      .filter((video) => matchesVideoQuestion(video, research.question))
      .filter((video) => matchesVideoDate(video, dateRange))
      .filter((video) => !terms || `${video.title} ${video.description} ${video.channel} ${video.platform}`
        .toLocaleLowerCase()
        .includes(terms))
      .sort((a, b) => {
        const aDate = videoDate(a)?.getTime() ?? 0;
        const bDate = videoDate(b)?.getTime() ?? 0;
        return sort === 'newest' ? bDate - aDate : aDate - bDate;
      });
  }, [dateRange, deferredQuery, research, sort, view]);

  const visibleWebSources = useMemo(() => {
    if (!research || view !== 'web') return [];
    const terms = deferredQuery.trim().toLocaleLowerCase();
    return (research.webSources ?? [])
      .filter((source) => matchesQuestionRelevance(
        source.rawContent || source.description || '',
        research.question,
      ))
      .filter((source) => matchesWebDate(source, dateRange))
      .filter((source) => !terms || `${source.title} ${source.description} ${source.rawContent} ${source.provider}`
        .toLocaleLowerCase()
        .includes(terms))
      .sort((a, b) => {
        const aDate = a.publishedAt ? Date.parse(a.publishedAt) : 0;
        const bDate = b.publishedAt ? Date.parse(b.publishedAt) : 0;
        return sort === 'newest' ? bDate - aDate : aDate - bDate;
      });
  }, [dateRange, deferredQuery, research, sort, view]);

  const gapMatches = useMemo(() => {
    if (!research || !selectedResearchArea) return [];
    return [
      ...research.sources.map((source) => ({
        id: `scholarly:${source.id}`,
        title: source.title,
        url: source.url,
        description: source.abstract,
        provider: source.metadataSource,
        type: source.sourceType || 'Scholarly source',
      })),
      ...(research.webSources ?? []).map((source) => ({
        id: `web:${source.id}`,
        title: source.title,
        url: source.url,
        description: source.description,
        rawContent: source.rawContent,
        provider: source.provider,
        type: 'Web result',
      })),
      ...(research.videos ?? []).map((video) => ({
        id: `video:${video.id}`,
        title: video.title,
        url: video.url,
        description: video.description,
        provider: video.platform,
        platform: video.platform,
        type: 'Video',
      })),
    ].filter((source) =>
      matchesQuestionRelevance(source.rawContent || source.description || '', research.question) &&
      matchesResearchArea(source, selectedResearchArea),
    );
  }, [research, selectedResearchArea]);

  const preserveResearchPage = (page) => {
    if (!page) return;
    setResearchPages((pages) => [
      page,
      ...pages.filter((existing) => existing.id !== page.id),
    ]);
  };

  const startNewResearch = () => {
    preserveResearchPage(research);
    setResearch(null);
    setResearchScreen('form');
    setResearchOptionsOpen(false);
    setActivePage('research');
    setSelectedResearchArea(null);
    setQuestion('');
    setNotice('');
    setError('');
    setView('discovery');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => questionInputRef.current?.focus(), 0);
  };

  const openResearchPage = (page) => {
    if (research && research.id !== page.id) preserveResearchPage(research);
    setResearchPages((pages) => pages.filter((existing) => existing.id !== page.id));
    setResearch(page);
    setResearchScreen('results');
    setActivePage('research');
    setQuestion(page.question);
    setSelectedResearchArea(null);
    setNotice('');
    setError('');
    setView('discovery');
    setQuery('');
    setDateRange('any');
    setSort('newest');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeResearchPage = (pageId) => {
    setResearchPages((pages) => pages.filter((page) => page.id !== pageId));
    if (research?.id !== pageId) return;

    setResearch(null);
    setIsEditingResearchQuestion(false);
    setResearchScreen('form');
    setSelectedResearchArea(null);
    setQuestion('');
    setNotice('Research closed. Its saved copy remains available in History.');
    setError('');
    setView('discovery');
    setQuery('');
    setDateRange('any');
    setSort('newest');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => questionInputRef.current?.focus(), 0);
  };

  const editResearchDetails = () => {
    if (!research) return;
    setQuestion(research.question);
    setIsEditingResearchQuestion(false);
    setResearchScreen('form');
    setResearchOptionsOpen(true);
    setNotice('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => questionInputRef.current?.focus(), 0);
  };

  const cancelResearchDetailsEdit = () => {
    if (!research) return;
    const scope = research.scope ?? {};
    const fromYear = scope.fromYear ?? scope.year ?? null;
    const toYear = scope.toYear ?? scope.year ?? null;
    setQuestion(research.question);
    setRegion(scope.region ?? '');
    setRegionMode(scope.region ? 'specific' : 'worldwide');
    setSourceLimit(String(scope.sourceLimit ?? 'all'));
    setDateMode(fromYear ? 'range' : 'any');
    setStartYear(fromYear ? String(fromYear) : '');
    setEndYear(toYear ? String(toYear) : '');
    setYear(scope.year ? String(scope.year) : '');
    setMonth(scope.month ?? '');
    setPurposes(research.analysis.purposes);
    setResearchScreen('results');
    setResearchOptionsOpen(false);
    setError('');
    setNotice('');
  };

  const startResearch = async (
    event,
    questionOverride = null,
    followUp = null,
    { reuseCurrentResearch = false } = {},
  ) => {
    event?.preventDefault();
    setHasNavigatedFromHome(true);
    setActivePage('research');
    const effectivePurposes = purposes.length ? purposes : ['general'];
    const effectiveRegionMode = regionMode;
    const effectiveRegion = region;
    const effectiveDateRange = dateRange;
    const configuredView = researchDefaults?.default_view;
    const effectiveView = ['discovery', 'sources'].includes(configuredView)
      ? configuredView
      : 'discovery';
    const cleanedQuestion = (questionOverride ?? question).trim();
    const currentResearchId = reuseCurrentResearch ? research?.id : null;
    if (!reuseCurrentResearch) {
      preserveResearchPage(research);
      setResearch(null);
    }
    setResearchScreen('form');
    setSelectedResearchArea(null);
    setQuery('');
    setDateRange(effectiveDateRange);
    setSort('newest');
    setNotice('');
    setError('');
    setView(effectiveView);
    if (cleanedQuestion.length < 8) {
      setError('Add a little more detail to your question (at least 8 characters).');
      return;
    }
    if (effectiveRegionMode === 'specific' && !effectiveRegion.trim()) {
      setError('Enter a region or choose Worldwide.');
      return;
    }
    if (dateMode === 'range' && (!startYear || !endYear)) {
      setError('Choose both a start year and an end year, or select Any date.');
      return;
    }
    if (dateMode === 'range' && Number(startYear) > Number(endYear)) {
      setError('The start year must be before or the same as the end year.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: cleanedQuestion,
          purposes: effectivePurposes,
          region: effectiveRegionMode === 'specific' ? effectiveRegion.trim() : '',
          sourceLimit: sourceLimit === 'all' ? 'all' : Number(sourceLimit),
          year: null,
          fromYear: dateMode === 'range' ? Number(startYear) : null,
          toYear: dateMode === 'range' ? Number(endYear) : null,
          month: dateMode === 'range' && startYear === endYear ? month : '',
        }),
      });
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error(
          response.ok
            ? 'Research request failed: the API returned an unreadable response. Try again or check the API server logs.'
            : 'Research API error: the server returned an unreadable error. If you are running locally, restart it with npm run server, then retry.',
        );
      }
      if (!response.ok) {
        const failedStep = result.step === 'discovery'
          ? 'Source search failed'
          : result.step === 'validation'
            ? 'Question check'
            : 'Research request failed';
        throw new Error(`${failedStep}: ${result.error || 'Please check your connection and try again.'}`);
      }

      const sessionResult = {
        ...result,
        id: currentResearchId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...(followUp?.parentResearch ? {
          parentProjectId: followUp.parentResearch.id,
          parentQuestion: followUp.parentResearch.question,
          relatedSourceCategories: followUp.sourceCategories ?? [],
        } : {}),
      };
      setResearch(sessionResult);
      setResearchScreen('results');
      setQuestion(result.question);
      setRegion(result.scope?.region ?? '');
      setRegionMode(result.scope?.region ? 'specific' : 'worldwide');
      setSourceLimit(String(result.scope?.sourceLimit ?? 'all'));
      const resultFromYear = result.scope?.fromYear ?? result.scope?.year ?? null;
      const resultToYear = result.scope?.toYear ?? result.scope?.year ?? null;
      setDateMode(resultFromYear ? 'range' : 'any');
      setStartYear(resultFromYear ? String(resultFromYear) : '');
      setEndYear(resultToYear ? String(resultToYear) : '');
      setYear(result.scope?.year ? String(result.scope.year) : '');
      setMonth(result.scope?.month ?? '');
      setNotice(
        `Research saved to browser history. Found ${result.sources.length} scholarly source${result.sources.length === 1 ? '' : 's'}, ${(result.webSources ?? []).length} web result${(result.webSources ?? []).length === 1 ? '' : 's'}, and ${(result.videos ?? []).length} video${(result.videos ?? []).length === 1 ? '' : 's'}.`,
      );
      const providerWarnings = [
        ...(result.warnings ?? []),
        ...(result.webWarnings ?? []),
        ...(result.videoWarnings ?? []),
      ];
      if (providerWarnings.length) {
        setNotice((current) => `${current} Provider notice: ${providerWarnings.join(' ')} You can use available results or configure the indicated provider and retry.`);
      }

      const saved = compactResearchForHistory(sessionResult, sessionResult.id);
      try {
        const nextHistory = addResearchHistoryEntry(history, saved, {
          replaceMatchingQuestion: true,
        });
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
        setHistory(nextHistory);
        if (saved.historyResultsTruncated) {
          setNotice((current) => `${current} The browser history copy keeps the first 50 scholarly sources and up to 20 web results and videos; all results remain available in this open research session.`);
        }
      } catch {
        setNotice((current) => `${current} This browser could not save the search, so it will not appear in research history.`);
      }
    } catch (requestError) {
      setError(
        requestError instanceof TypeError
          ? 'Research API unavailable: the application server could not be reached. Start the API with npm run server, then retry.'
          : requestError.message,
      );
    } finally {
      setLoading(false);
    }
  };

  const openSavedResearch = (saved) => {
    if (research && research.id !== saved.id) preserveResearchPage(research);
    setResearchPages((pages) => pages.filter((page) => page.id !== saved.id));
    setActivePage('research');
    setResearch(saved);
    setResearchScreen('results');
    if (saved.historyResultsTruncated) {
      setNotice(`Showing a compact browser-history copy of this research (${saved.historyResultCounts.sources} scholarly sources, ${saved.historyResultCounts.webSources} web results, and ${saved.historyResultCounts.videos} videos were originally retrieved).`);
    } else {
      setNotice('');
    }
    setSelectedResearchArea(null);
    setQuestion(saved.question);
    setRegion(saved.scope?.region ?? '');
    setRegionMode(saved.scope?.region ? 'specific' : 'worldwide');
    setSourceLimit(String(saved.scope?.sourceLimit ?? 'all'));
    const savedFromYear = saved.scope?.fromYear ?? saved.scope?.year ?? null;
    const savedToYear = saved.scope?.toYear ?? saved.scope?.year ?? null;
    setDateMode(savedFromYear ? 'range' : 'any');
    setStartYear(savedFromYear ? String(savedFromYear) : '');
    setEndYear(savedToYear ? String(savedToYear) : '');
    setYear(saved.scope?.year ? String(saved.scope.year) : '');
    setMonth(saved.scope?.month ?? '');
    setPurposes(saved.analysis.purposes);
    setError('');
    setNotice('Opened saved research from this browser. Its source list reflects the original search time.');
    setView('discovery');
    setQuery('');
    setDateRange('any');
    setSort('newest');
  };

  const removeHistoryEntry = (historyId) => {
    const nextHistory = history.filter((item) => item.id !== historyId);
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      setHistory(nextHistory);
      setHistoryNotice('Research removed from history.');
    } catch (storageError) {
      setHistoryNotice(`Could not update research history: ${storageError.message}`);
    }
  };

  const persistSavedProjects = (nextProjects) => {
    try {
      window.localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(nextProjects));
      setSavedProjects(nextProjects);
      setProjectStorageWarning('');
      setProjectActionError('');
      return true;
    } catch (saveError) {
      setProjectStorageWarning(`Saved projects could not be saved in this browser: ${saveError.message}`);
      return false;
    }
  };

  const createProject = (name, initialSource = null, metadata = {}) => {
    try {
      let nextProjects = createSavedProject(
        savedProjects,
        name,
        newSavedProjectId(),
      );
      const projectId = nextProjects[0].id;
      if (initialSource) nextProjects = addSourceToProject(nextProjects, projectId, initialSource);
      if (Object.keys(metadata).length) nextProjects = updateSavedProject(nextProjects, projectId, metadata);
      if (!persistSavedProjects(nextProjects)) return null;
      setSelectedSavedProjectId(projectId);
      setProjectNameDraft('');
      return projectId;
    } catch (projectError) {
      setProjectActionError(projectError.message);
      return null;
    }
  };

  const saveSourceToProject = (projectId, source) => {
    try {
      const nextProjects = addSourceToProject(savedProjects, projectId, source);
      return persistSavedProjects(nextProjects);
    } catch (projectError) {
      setProjectActionError(projectError.message);
      return false;
    }
  };

  const deleteProject = (projectId) => {
    if (!persistSavedProjects(removeSavedProject(savedProjects, projectId))) return;
    if (selectedSavedProjectId === projectId) setSelectedSavedProjectId(null);
  };

  const deleteProjectSource = (projectId, sourceId) => {
    persistSavedProjects(removeSourceFromProject(savedProjects, projectId, sourceId));
  };

  const updateProjectDetails = (projectId, changes) => {
    try {
      return persistSavedProjects(updateSavedProject(savedProjects, projectId, changes));
    } catch (projectError) {
      setProjectActionError(projectError.message);
      return false;
    }
  };

  const navigateResearchWorkspace = (destination) => {
    if (destination === 'new-research') {
      startNewResearch();
      return;
    }
    if (destination === 'claims' || destination === 'discovery') {
      setHasNavigatedFromHome(true);
      setActivePage('research');
      setView(destination);
      return;
    }
    if (destination === 'research') {
      setActivePage('research');
      setView('discovery');
      return;
    }
    setActivePage(destination);
  };
  const toggleSidebar = () => setSidebarOpen((open) => !open);
  const openAccountPage = (page) => {
    setProfileOpen(false);
    setActivePage(page);
    if (window.matchMedia('(max-width: 700px)').matches) setSidebarOpen(false);
  };

  return (
    <div className="research-app">
      <div className="research-layout">
        {sidebarOpen && (
          <button
            type="button"
            className="research-sidebar-backdrop"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          ref={sidebarRef}
          id="research-sidebar"
          className={`research-sidebar${sidebarOpen ? ' research-sidebar-open' : ' research-sidebar-collapsed'}`}
          aria-label="Main navigation"
        >
          <div className="research-sidebar-brand">
            <button
              className="research-sidebar-brand-toggle"
              type="button"
              aria-label={sidebarOpen ? 'Collapse navigation' : 'Expand navigation'}
              aria-controls="research-sidebar"
              aria-expanded={sidebarOpen}
              title={sidebarOpen ? 'Collapse navigation' : 'Expand navigation'}
              onClick={toggleSidebar}
            >
              <Icon name="menu" size={19} />
            </button>
          </div>
          <nav
            className="research-sidebar-nav"
            onClick={(event) => {
              const button = event.target instanceof Element ? event.target.closest('button') : null;
              if (
                button &&
                !button.hasAttribute('aria-controls') &&
                window.matchMedia('(max-width: 700px)').matches
              ) {
                setSidebarOpen(false);
              }
            }}
          >
            <button
              type="button"
              aria-label="New Research"
              aria-current={activePage === 'research' ? 'page' : undefined}
              title="New Research"
              onClick={startNewResearch}
            >
              <Icon name="filePlus" size={17} />
              <span>New Research</span>
            </button>
            <button
              type="button"
              aria-label="Intelligence Workspace"
              aria-current={activePage === 'org-dashboard' ||
                activePage.startsWith('org-') ||
                activePage === 'saved-files' ||
                activePage === 'team-workspace'
                ? 'page'
                : undefined}
              title="Intelligence Workspace"
              onClick={() => setActivePage('org-dashboard')}
            >
              <Icon name="dashboard" size={17} />
              <span>Intelligence Workspace</span>
            </button>
            <div className="research-sidebar-project-list research-sidebar-file-builder-list">
              <button
                type="button"
                className="research-sidebar-project"
                aria-label="Create a File"
                aria-current={activePage === 'file-builder' ? 'page' : undefined}
                onClick={() => setActivePage('file-builder')}
              >
                <Icon name="file" size={17} />
                <span>Create a File</span>
              </button>
            </div>
            <button
              type="button"
              aria-label={`Source Collections, ${savedProjects.length} projects`}
              aria-expanded={savedProjectsExpanded}
              aria-controls="research-sidebar-saved-projects"
              aria-current={activePage === 'projects' ? 'page' : undefined}
              title="Source Collections"
              onClick={() => {
                setSelectedSavedProjectId(null);
                setActivePage('projects');
                setSavedProjectsExpanded((expanded) => !expanded);
              }}
            >
              <Icon name="folder" size={17} />
              <span>Source Collections</span>
              {savedProjects.length > 0 && <span className="research-sidebar-count">{savedProjects.length}</span>}
              <Icon name="chevron" size={15} />
            </button>
            {savedProjectsExpanded && (
              <div id="research-sidebar-saved-projects" className="research-sidebar-project-list">
                {savedProjects.map((project) => (
                  <button
                    type="button"
                    className="research-sidebar-project"
                    key={project.id}
                    aria-current={activePage === 'projects' && selectedSavedProjectId === project.id ? 'page' : undefined}
                    onClick={() => {
                      setSelectedSavedProjectId(project.id);
                      setActivePage('projects');
                    }}
                    title={project.name}
                  >
                    <span>{project.name}</span>
                    <span className="research-sidebar-count">{project.sources.length}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              aria-label={`History, ${history.length} research searches`}
              aria-expanded={historyExpanded}
              aria-controls="research-sidebar-history"
              aria-current={activePage === 'history' ? 'page' : undefined}
              title="History"
              onClick={() => {
                setActivePage('history');
                setHistoryExpanded((expanded) => !expanded);
              }}
            >
              <Icon name="clock" size={17} />
              <span>History</span>
              {history.length > 0 && <span className="research-sidebar-count">{history.length}</span>}
              <Icon name="chevron" size={15} />
            </button>
            {historyExpanded && (
              <div id="research-sidebar-history" className="research-sidebar-history-list">
                {history.length ? history.map((item) => (
                  <div className="research-sidebar-history-item" key={item.id}>
                    <button
                      type="button"
                      className="research-sidebar-history"
                      title={item.question}
                      onClick={() => openSavedResearch(item)}
                    >
                      <span>{item.question}</span>
                      <span className="research-sidebar-history-date">
                        {new Date(item.retrievedAt).toLocaleDateString()}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="research-sidebar-history-remove"
                      aria-label={`Remove research from history: ${item.question}`}
                      title="Remove from history"
                      onClick={() => removeHistoryEntry(item.id)}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                )) : (
                  <p className="research-sidebar-history-empty">Your searches will appear here.</p>
                )}
              </div>
            )}
            <button
              type="button"
              aria-label="Discover trending topics and videos"
              aria-current={activePage === 'discover' ? 'page' : undefined}
              title="Discover"
              onClick={() => setActivePage('discover')}
            >
              <Icon name="compass" size={17} />
              <span>Discover</span>
            </button>
            <button
              type="button"
              aria-current={activePage === 'community-hub' ? 'page' : undefined}
              aria-label="Community Research Hub"
              title="Community Research Hub"
              onClick={() => setActivePage('community-hub')}
            >
              <Icon name="users" size={17} />
              <span>Community Research Hub</span>
            </button>
          </nav>
          <div className="research-sidebar-footer">
            <div className="research-sidebar-footer-actions">
              <button
                type="button"
                className="research-sidebar-footer-button"
                ref={profileButtonRef}
                aria-label="Profile"
                aria-expanded={profileOpen}
                aria-controls="research-sidebar-profile"
                title={displayName || 'Profile'}
                onClick={() => {
                  if (window.matchMedia('(max-width: 700px)').matches) setSidebarOpen(true);
                  setProfileOpen((open) => !open);
                }}
              >
                <span className="research-sidebar-avatar" aria-hidden="true">
                  {profileAvatarUrl
                    ? <img src={profileAvatarUrl} alt="" />
                    : displayName
                      ? displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
                      : <Icon name="user" size={18} />}
                </span>
                <span>{displayName || user?.email || 'Profile'}</span>
              </button>
            </div>
            {profileOpen && (
              <section
                id="research-sidebar-profile"
                ref={profilePopoverRef}
                className="research-sidebar-popover"
                aria-label="Profile"
              >
                <strong>{displayName || user?.email || 'Your account'}</strong>
                <button type="button" onClick={() => openAccountPage('account-profile')}>View Profile</button>
                <button type="button" onClick={() => openAccountPage('account-settings')}>Settings</button>
                <button type="button" onClick={() => openAccountPage('account-security')}>Security</button>
                <button type="button" onClick={() => openAccountPage('account-privacy')}>Privacy &amp; Data</button>
                <button
                  type="button"
                  onClick={() => {
                    if (user) signOut().catch((signOutError) => setProjectActionError(`Could not sign out: ${signOutError.message}`));
                    else openAccountPage('account-profile');
                    setProfileOpen(false);
                    if (window.matchMedia('(max-width: 700px)').matches) setSidebarOpen(false);
                  }}
                >
                  {user ? 'Sign out' : 'Sign in'}
                </button>
              </section>
            )}
            <p className="research-sidebar-note">Trends are fetched from public provider feeds.</p>
          </div>
        </aside>

        <div className="research-content">
          <header className="research-topbar">
          <div className="research-topbar-start">
            <button
              className="research-mobile-menu"
              type="button"
              aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
              aria-controls="research-sidebar"
              aria-expanded={sidebarOpen}
              onClick={toggleSidebar}
            >
              <Icon name="menu" />
            </button>
            {hasNavigatedFromHome && (
              <button
                className="btn btn-ghost research-back"
                onClick={goBackToRecentPage}
                type="button"
                aria-label="Back"
                title="Back"
              >
                <Icon name="arrow" />
              </button>
            )}
          </div>
          <div className="research-topbar-label">Research workspace</div>
          <ThemeToggle />
          </header>

          <main className={`research-main${activePage === 'research' && researchScreen === 'form' ? ' research-main-question' : ''}`}>
        {projectStorageWarning && <p className="discovery-warning" role="status">{projectStorageWarning}</p>}
        {projectActionError && <p className="discovery-warning" role="alert">{projectActionError}</p>}
        {['account-profile', 'account-settings', 'account-security', 'account-privacy'].includes(activePage) && (
          <AccountCenter
            section={
              activePage === 'account-settings'
                ? 'settings'
                : activePage === 'account-security'
                  ? 'security'
                  : activePage === 'account-privacy'
                    ? 'privacy'
                    : 'profile'
            }
            onSectionChange={setActivePage}
          />
        )}
        {activePage === 'research' && (
          <>
        {(research || researchPages.length > 0) && (
          <div className="research-page-controls">
            <button
              type="button"
              className="btn btn-secondary research-home-button"
              onClick={startNewResearch}
            >
              HOME
            </button>
            <nav className="research-page-tabs" aria-label="Open research pages">
              {researchPages.map((page, index) => (
                <div
                  className="research-page-tab"
                  key={page.id}
                >
                  <button
                    type="button"
                    className="research-page-tab-open"
                    title={page.question}
                    onClick={() => openResearchPage(page)}
                  >
                    Research {researchPages.length - index}: {page.question}
                  </button>
                  <button
                    type="button"
                    className="research-page-tab-close"
                    aria-label={`Close research: ${page.question}`}
                    title="Close research tab"
                    onClick={() => closeResearchPage(page.id)}
                  >
                    <Icon name="close" size={13} />
                  </button>
                </div>
              ))}
              {researchScreen === 'results' && research && (
                <div className="research-page-tab research-page-tab-active" aria-current="page">
                  <span className="research-page-current" title={research.question}>
                    {research.question}
                  </span>
                </div>
              )}
              {researchScreen === 'form' && (
                <span className="research-page-current" aria-current="page">
                  {research ? 'Editing research' : 'New research'}
                </span>
              )}
            </nav>
            <button
              type="button"
              className="btn btn-primary research-add-button"
              aria-label="Start another research"
              title="Start another research"
              onClick={startNewResearch}
            >
              +
            </button>
            {researchScreen === 'results' && view === 'discovery' && (
              <button
                className="discovery-search-toggle research-top-search-toggle"
                ref={sourceSearchToggleRef}
                type="button"
                aria-label={sourceSearchOpen ? 'Close source search' : 'Search sources'}
                aria-expanded={sourceSearchOpen}
                aria-controls="source-search-panel"
                onClick={() => setSourceSearchOpen((open) => !open)}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-4-4" />
                </svg>
              </button>
            )}
          </div>
        )}

        {researchScreen === 'form' && research && (
          <section className="research-intro research-question-intro research-question-edit-intro" aria-labelledby="research-heading">
            <h1 id="research-heading">EDIT YOUR RESEARCH</h1>
            <p className="research-edit-context">Update the question or search settings below. Applying changes runs a fresh search in this same research tab; existing results remain until the search succeeds.</p>
          </section>
        )}

        {researchScreen === 'form' && <div className={`research-form-stage${!research ? ' research-form-stage-home' : ''}${!research && researchOptionsOpen ? ' research-form-stage-filter-open' : ''}`}>
        {!research && (
          <div className="research-home-brand">
            <img src="/brinfolynk-mark.png" alt="" />
            <h1>Brinfolynk</h1>
          </div>
        )}

        <form className="research-form research-question-form" onSubmit={(event) => startResearch(event, null, null, { reuseCurrentResearch: Boolean(research) })}>
          <details
            className="research-options-drawer"
            ref={researchOptionsRef}
            open={researchOptionsOpen}
            onToggle={(event) => setResearchOptionsOpen(event.currentTarget.open)}
          >
            <summary>Filter</summary>
            <div className="research-options-content">
              <fieldset className="scope-fieldset">
                <legend>Search scope</legend>
                <div className="scope-fields">
              <label>
                <span>Source search area</span>
                <select value={regionMode} onChange={(event) => setRegionMode(event.target.value)}>
                  <option value="worldwide">Worldwide</option>
                  <option value="specific">Specific region</option>
                </select>
              </label>
              <label>
                <span>Publication date</span>
                <select value={dateMode} onChange={(event) => setDateMode(event.target.value)}>
                  <option value="any">Any date</option>
                  <option value="range">Choose a year range</option>
                </select>
              </label>
              <label>
                <span>Source limit <small>(optional)</small></span>
                <select value={sourceLimit} onChange={(event) => setSourceLimit(event.target.value)}>
                  <option value="all">No limit — all available sources</option>
                  <option value="20">Limit to 20 sources</option>
                  <option value="50">Limit to 50 sources</option>
                  <option value="100">Limit to 100 sources</option>
                </select>
              </label>
              {regionMode === 'specific' && (
                <label>
                  <span>Region of interest</span>
                  <input
                    type="text"
                    value={region}
                    onChange={(event) => setRegion(event.target.value.slice(0, 100))}
                    placeholder="For example: Nairobi, Kenya"
                    maxLength={100}
                    required
                  />
                </label>
              )}
              {dateMode === 'range' && (
                <>
                  <label>
                    <span>From year</span>
                    <input
                      type="number"
                      min="1900"
                      max="2100"
                      step="1"
                      value={startYear}
                      onChange={(event) => setStartYear(event.target.value)}
                      placeholder="e.g. 2014"
                      required
                    />
                  </label>
                  <label>
                    <span>To year</span>
                    <input
                      type="number"
                      min={startYear || '1900'}
                      max="2100"
                      step="1"
                      value={endYear}
                      onChange={(event) => setEndYear(event.target.value)}
                      placeholder={`e.g. ${new Date().getFullYear()}`}
                      required
                    />
                  </label>
                  {startYear && startYear === endYear && (
                    <label>
                      <span>Month <small>(optional)</small></span>
                      <select value={month} onChange={(event) => setMonth(event.target.value)}>
                        <option value="">All months</option>
                        {MONTHS.map((item) => <option value={item} key={item}>{item}</option>)}
                      </select>
                    </label>
                  )}
                </>
              )}
                </div>
              </fieldset>

            </div>
          </details>
          <label htmlFor="research-question">
            {research
              ? 'Research question'
              : `${firstName ? `${firstName}, ` : ''}what would you like to investigate?`}
          </label>
          <div className="research-question-input-wrap">
            <textarea
              ref={questionInputRef}
              id="research-question"
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
              }}
              rows={1}
              required
              aria-describedby={research ? 'question-help' : undefined}
            />
            <button
              className="btn btn-primary research-submit research-submit-icon"
              type="submit"
              disabled={loading}
              aria-label={loading ? 'Searching sources and videos' : research ? 'Update research' : 'Start research'}
              title={loading ? 'Searching sources and videos' : research ? 'Update research' : 'Start research'}
            >
              {loading ? <span className="research-spinner" aria-hidden="true" /> : <Icon name="enter" size={13} />}
            </button>
          </div>
          <div className="research-input-meta">
            {research && <span id="question-help">Update this question and its search settings.</span>}
            {question.length > 0 && (
              <span id="question-count">{question.length.toLocaleString()} characters</span>
            )}
          </div>

          {research && (
            <div className="research-edit-form-actions">
              <button className="btn btn-secondary" type="button" onClick={cancelResearchDetailsEdit} disabled={loading}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Updating research…' : 'Update research'}
              </button>
            </div>
          )}
        </form>
        </div>}

        {researchScreen === 'form' && <div className="research-messages" aria-live="polite" aria-atomic="true">
          {loading && (
            <p className="research-progress">
              {sourceLimit === 'all'
                ? 'Checking your question and searching available scholarly catalogs, web search providers, and video platforms. Retrieving all scholarly matches may take longer.'
                : 'Checking your question, preparing suggested research areas, and searching connected scholarly, web, and video providers. This may take a few seconds.'}
            </p>
          )}
          {error && <p className="research-error" role="alert">{error}</p>}
          {notice && !loading && <p className="research-notice" role="status">{notice}</p>}
        </div>}

        {research && researchScreen === 'results' && (
          <section className="research-results" aria-labelledby="results-heading">
            <div className="research-results-header">
              <div>
                {isEditingResearchQuestion ? (
                  <form
                    className="research-question-edit-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setIsEditingResearchQuestion(false);
                      startResearch(event, editedResearchQuestion, null, { reuseCurrentResearch: true });
                    }}
                  >
                    <h2 id="results-heading" className="research-question-edit-heading">Edit research question</h2>
                    <textarea
                      id="edit-research-question"
                      aria-label="Edit research question"
                      value={editedResearchQuestion}
                      onChange={(event) => setEditedResearchQuestion(event.target.value)}
                      rows={2}
                      required
                      autoFocus
                    />
                    <div className="research-question-edit-actions">
                      <span>{editedResearchQuestion.length.toLocaleString()} characters · Updating runs a fresh search in this same research tab; existing results remain until the search succeeds.</span>
                      <button className="btn btn-primary" type="submit" disabled={loading}>
                        {loading ? 'Searching…' : 'Search updated question'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => setIsEditingResearchQuestion(false)}
                        disabled={loading}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="research-question-heading">
                      <h2 id="results-heading">{research.question}</h2>
                      <button
                        className="research-edit-question"
                        type="button"
                        aria-label="Edit research question"
                        title="Edit research question"
                        onClick={() => {
                          setEditedResearchQuestion(research.question);
                          setIsEditingResearchQuestion(true);
                        }}
                      >
                        <Icon name="edit" size={16} />
                      </button>
                    </div>
                    <button className="research-edit-details" type="button" onClick={editResearchDetails}>
                      <Icon name="edit" size={14} />
                      Edit research details
                    </button>
                  </>
                )}
                <p className="research-retrieved">
                  Search run {new Date(research.retrievedAt).toLocaleString()}
                </p>
                {research.parentProjectId && (
                  <p className="research-parent-link">
                    Follow-up investigation from{' '}
                    <button
                      type="button"
                      onClick={() => {
                        const parent = history.find((item) => item.id === research.parentProjectId);
                        if (parent) openSavedResearch(parent);
                        else setNotice('The original research is no longer in this browser history.');
                      }}
                    >
                      {research.parentQuestion}
                    </button>
                  </p>
                )}
              </div>
            </div>

            <nav className="research-tabs" aria-label="Research sections">
              <button
                type="button"
                aria-current={view === 'discovery' ? 'page' : undefined}
                onClick={() => {
                  setFilterToolsOpen(false);
                  setQuery('');
                  setView('discovery');
                }}
              >
                Sources ({research.sources.length + (research.webSources ?? []).length + (research.videos ?? []).length})
              </button>
              <button
                type="button"
                className="research-related-topics-tab"
                aria-current={view === 'related-topics' ? 'page' : undefined}
                onClick={() => setView('related-topics')}
              >
                Related Topic
              </button>
              <button type="button" aria-current={view === 'videos' ? 'page' : undefined} onClick={() => setView('videos')}>
                Video ({(research.videos ?? []).length})
              </button>
              <button type="button" aria-current={view === 'claims' ? 'page' : undefined} onClick={() => setView('claims')}>
                Claims &amp; evidence
              </button>
              <button type="button" aria-current={view === 'research-gaps' ? 'page' : undefined} onClick={() => setView('research-gaps')}>
                Explore
              </button>
              {selectedResearchArea && (
                <button type="button" aria-current={view === 'gap' ? 'page' : undefined} onClick={() => setView('gap')}>
                  Area sources ({gapMatches.length})
                </button>
              )}
            </nav>

            {view === 'related-topics' ? (
              <RelatedTopics
                research={research}
              />
            ) : view === 'claims' ? (
              <ClaimEvidence research={research} />
            ) : view === 'research-gaps' ? (
              <ResearchGaps
                research={research}
                onOpenArea={(areaTitle) => {
                  const area = research.analysis.researchAreas.find((item) => item.title === areaTitle);
                  if (!area) return;
                  setSelectedResearchArea(area);
                  setView('gap');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onUseSearch={(suggestedSearch) => {
                  setQuestion(suggestedSearch);
                  setResearchScreen('form');
                  setResearchOptionsOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  window.setTimeout(() => questionInputRef.current?.focus(), 250);
                }}
              />
            ) : view === 'discovery' ? (
              <SourceDiscovery
                research={research}
                sourceSearchOpen={sourceSearchOpen}
                onCloseSourceSearch={setSourceSearchOpen}
                sourceSearchToggleRef={sourceSearchToggleRef}
                savedProjects={savedProjects}
                projectStorageWarning={projectStorageWarning}
                projectActionError={projectActionError}
                onCreateSavedProject={createProject}
                onAddSourceToProject={saveSourceToProject}
                onFindSimilar={(title) => {
                  const similarQuery = `Related sources for: ${title}`;
                  setQuestion(similarQuery);
                  setView('research-gaps');
                  startResearch(null, similarQuery);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            ) : view === 'gap' ? (
              <div className="source-explorer">
                <div className="source-filter-panel">
                  <div className="source-search-area">
                    <strong>Matching this research area</strong>
                    <span>{selectedResearchArea?.title}</span>
                    <span>Only results already discovered in this search are shown.</span>
                  </div>
                  <p className="source-match-count">{gapMatches.length} matching source{gapMatches.length === 1 ? '' : 's'}</p>
                  <p className="source-filter-note">
                    A missing match in this search is not proof that no research exists or that a gap is confirmed.
                  </p>
                </div>
                {gapMatches.length === 0 ? (
                  <div className="source-empty">
                    <Icon name="search" size={24} />
                    <h3>No matching sources in this search</h3>
                    <p>Try another suggested area or run a broader research search. This result does not establish a research gap.</p>
                  </div>
                ) : (
                  <div className="source-list">
                    {gapMatches.slice(0, resultPageLimit).map((source) => (
                      <article className="source-card" key={source.id}>
                        <div className="source-card-topline">
                          <span className="source-type">{source.type}</span>
                          <span>{source.provider}</span>
                        </div>
                        <h3><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<Icon name="external" size={15} /></a></h3>
                        {source.description && <p className="web-result-description">{source.description}</p>}
                        <div className="source-card-footer">
                          <span>Already available in this research project</span>
                          <a href={source.url} target="_blank" rel="noopener noreferrer">Open original source to review</a>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                {gapMatches.length > resultPageLimit && (
                  <button className="btn btn-secondary result-load-more" type="button" onClick={() => setResultPageLimit((current) => current + RESULTS_PER_PAGE)}>
                    Show next {Math.min(RESULTS_PER_PAGE, gapMatches.length - resultPageLimit)} results
                  </button>
                )}
              </div>
            ) : view === 'sources' ? (
              <div className="source-explorer">
                <div className="source-filter-panel">
                  <p className="source-search-area">
                    <strong>Source search area</strong>
                    <span>{research.scope?.region || 'Worldwide'}</span>
                    <span>
                      {research.scope?.sourceLimit === 'all'
                        ? 'All matching records requested'
                        : `Up to ${research.scope?.sourceLimit ?? research.sources.length} sources requested`}
                    </span>
                  </p>
                  <label className="source-search">
                    <span>Search titles and abstracts</span>
                    <div><Icon name="search" size={16} /><input value={query} onChange={(event) => {
                      setQuery(event.target.value);
                      if (event.target.value.trim()) setFilterToolsOpen(true);
                    }} placeholder="Search these sources" /></div>
                  </label>
                  <details className="research-filter-drawer" open={filterToolsOpen} onToggle={(event) => setFilterToolsOpen(event.currentTarget.open)}>
                    <summary>Filters</summary>
                    <div className="research-filter-options">
                      <label>
                        <span>Publication date</span>
                        <select value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
                          <option value="any">Any date</option>
                          <option value="1">Past year (publication year)</option>
                          <option value="3">Past 3 years (publication year)</option>
                          <option value="5">Past 5 years (publication year)</option>
                        </select>
                      </label>
                      <label>
                        <span>Sort by</span>
                        <select value={sort} onChange={(event) => setSort(event.target.value)}>
                          <option value="newest">Newest first</option>
                          <option value="oldest">Oldest first</option>
                        </select>
                      </label>
                    </div>
                  </details>
                  <p className="source-match-count">{visibleSources.length} of {research.sources.length} sources match · Showing {Math.min(resultPageLimit, visibleSources.length)}</p>
                  {dateRange !== 'any' && (
                    <p className="source-filter-note">
                      Date filtering uses publication year only, so it is approximate. Records without a year are excluded.
                    </p>
                  )}
                </div>

                {visibleSources.length === 0 ? (
                  <div className="source-empty">
                    <Icon name="search" size={24} />
                    <h3>{research.sources.length ? 'No sources match these filters' : 'No source records found'}</h3>
                    <p>{research.sources.length ? 'Try clearing your search or widening the date range.' : 'The catalogs returned no matching records for this wording. Try shorter or broader search terms.'}</p>
                  </div>
                ) : (
                  <div className="source-list">
                    {visibleSources.slice(0, resultPageLimit).map((source) => (
                      <article className="source-card" key={source.id}>
                        <div className="source-card-topline">
                          <span className="source-type">{source.sourceType}</span>
                          <span>{sourceDate(source)}</span>
                        </div>
                        <h3><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<Icon name="external" size={15} /></a></h3>
                        <p className="source-publisher">
                          {source.authors.length ? source.authors.join(', ') : 'Author information not available'}
                          {source.journal ? ` · ${source.journal}` : source.publisher ? ` · ${source.publisher}` : ''}
                        </p>
                        {(source.doi || Number.isInteger(source.citationCount)) && (
                          <p className="source-related-info">
                            {source.doi && <span>DOI: {source.doi}</span>}
                            {Number.isInteger(source.citationCount) && (
                              <span>{source.citationCount.toLocaleString()} citations</span>
                            )}
                          </p>
                        )}
                        {source.openAccessUrl && (
                          <p className="source-availability">
                            <a href={source.openAccessUrl} target="_blank" rel="noopener noreferrer">
                              Open-access PDF
                            </a>
                            {' '}· Link provided by Semantic Scholar; full text not fetched
                          </p>
                        )}
                        {source.abstract ? (
                          <details className="source-abstract">
                            <summary>View indexed abstract</summary>
                            <p>{source.abstract}</p>
                          </details>
                        ) : (
                          <p className="source-availability">Abstract not available in the retrieved catalog record.</p>
                        )}
                        <div className="source-card-footer">
                          <span>Metadata: {source.metadataSource}</span>
                          <span>{source.abstract ? 'Abstract available' : 'Metadata only'} · Full text not checked</span>
                          {source.openAccess === true && <span>Catalog marks open access; full text not fetched</span>}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                {visibleSources.length > resultPageLimit && (
                  <button className="btn btn-secondary result-load-more" type="button" onClick={() => setResultPageLimit((current) => current + RESULTS_PER_PAGE)}>
                    Show next {Math.min(RESULTS_PER_PAGE, visibleSources.length - resultPageLimit)} sources
                  </button>
                )}
              </div>
            ) : view === 'web' ? (
              <div className="source-explorer web-explorer">
                <div className="source-filter-panel">
                  <label className="source-search">
                    <span>Search web titles and descriptions</span>
                    <div><Icon name="search" size={16} /><input value={query} onChange={(event) => {
                      setQuery(event.target.value);
                      if (event.target.value.trim()) setFilterToolsOpen(true);
                    }} placeholder="Search these web results" /></div>
                  </label>
                  <details className="research-filter-drawer" open={filterToolsOpen} onToggle={(event) => setFilterToolsOpen(event.currentTarget.open)}>
                    <summary>Filters</summary>
                    <div className="research-filter-options">
                      <label>
                        <span>Published</span>
                        <select value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
                          <option value="any">Any date</option>
                          <option value="1">Past year</option>
                          <option value="3">Past 3 years</option>
                          <option value="5">Past 5 years</option>
                        </select>
                      </label>
                      <label>
                        <span>Sort by</span>
                        <select value={sort} onChange={(event) => setSort(event.target.value)}>
                          <option value="newest">Newest first</option>
                          <option value="oldest">Oldest first</option>
                        </select>
                      </label>
                    </div>
                  </details>
                  <p className="source-match-count">{visibleWebSources.length} of {(research.webSources ?? []).length} web results match · Showing {Math.min(resultPageLimit, visibleWebSources.length)}</p>
                  {(research.webWarnings ?? []).map((warning) => (
                    <p className="video-provider-warning" key={warning}>{warning}</p>
                  ))}
                </div>

                {visibleWebSources.length === 0 ? (
                  <div className="source-empty">
                    <Icon name="search" size={24} />
                    <h3>{(research.webSources ?? []).length ? 'No web results match these filters' : 'No web results found'}</h3>
                    <p>{(research.webSources ?? []).length
                      ? 'Try clearing your search or widening the date range.'
                      : 'Configure Google Search credentials (API key and Programmable Search Engine ID), Tavily, or Brave Search on the server to enable web discovery. A search with no results does not show that no information exists.'}</p>
                  </div>
                ) : (
                  <div className="source-list">
                    {visibleWebSources.slice(0, resultPageLimit).map((source) => (
                      <article className="source-card" key={source.id}>
                        <div className="source-card-topline">
                          <span className="source-type">{source.provider} web result</span>
                          <span>{webSourceDate(source)}</span>
                        </div>
                        <h3><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<Icon name="external" size={15} /></a></h3>
                        {source.description && <p className="web-result-description">{source.description}</p>}
                        <div className="source-card-footer">
                          <span>Search provider: {source.provider}</span>
                          <span>Search snippet only; open the original page to review its context and evidence</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                {visibleWebSources.length > resultPageLimit && (
                  <button className="btn btn-secondary result-load-more" type="button" onClick={() => setResultPageLimit((current) => current + RESULTS_PER_PAGE)}>
                    Show next {Math.min(RESULTS_PER_PAGE, visibleWebSources.length - resultPageLimit)} web results
                  </button>
                )}
              </div>
            ) : view === 'videos' ? (
              <div className="source-explorer video-explorer">
                <div className="source-filter-panel">
                  <label className="source-search">
                    <span>Search video titles and descriptions</span>
                    <div><Icon name="search" size={16} /><input value={query} onChange={(event) => {
                      setQuery(event.target.value);
                      if (event.target.value.trim()) setFilterToolsOpen(true);
                    }} placeholder="Search these videos" /></div>
                  </label>
                  <details className="research-filter-drawer" open={filterToolsOpen} onToggle={(event) => setFilterToolsOpen(event.currentTarget.open)}>
                    <summary>Filters</summary>
                    <div className="research-filter-options">
                      <label>
                        <span>Published</span>
                        <select value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
                          <option value="any">Any date</option>
                          <option value="1">Past year</option>
                          <option value="3">Past 3 years</option>
                          <option value="5">Past 5 years</option>
                        </select>
                      </label>
                      <label>
                        <span>Sort by</span>
                        <select value={sort} onChange={(event) => setSort(event.target.value)}>
                          <option value="newest">Newest first</option>
                          <option value="oldest">Oldest first</option>
                        </select>
                      </label>
                    </div>
                  </details>
                  <p className="source-match-count">{visibleVideos.length} of {(research.videos ?? []).length} videos match · Showing {Math.min(resultPageLimit, visibleVideos.length)}</p>
                  {videoRefreshState?.researchId === research.id && (
                    <div className={`video-refresh-status is-${videoRefreshState.status}`} role={['checking', 'refreshing'].includes(videoRefreshState.status) ? 'status' : 'alert'}>
                      <p>{videoRefreshState.status === 'checking'
                        ? 'Checking whether YouTube is configured on this deployment…'
                        : videoRefreshState.status === 'refreshing'
                          ? 'YouTube is configured. Refreshing this saved search with the current provider settings…'
                          : videoRefreshState.message}</p>
                      {['unconfigured', 'error'].includes(videoRefreshState.status) && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            videoRefreshAttemptRef.current = '';
                            setVideoRefreshState(null);
                            setResearch((current) => current ? { ...current } : current);
                          }}
                        >
                          Check again
                        </button>
                      )}
                    </div>
                  )}
                  {(research.videoWarnings ?? []).map((warning) => (
                    <p className="video-provider-warning" key={warning}>{warning}</p>
                  ))}
                </div>

                {visibleVideos.length === 0 ? (
                  <div className="source-empty">
                    <Icon name="search" size={24} />
                    <h3>{(research.videos ?? []).length ? 'No videos match these filters' : 'No video records found'}</h3>
                    <p>{(research.videos ?? []).length
                      ? 'Try clearing your search or widening the date range.'
                      : 'No videos were returned for this wording. Review any provider notices above or try broader search terms.'}</p>
                  </div>
                ) : (
                  <div className="source-list">
                    {visibleVideos.slice(0, resultPageLimit).map((video) => (
                      <article className="source-card video-card" key={video.id}>
                        <div className="source-card-topline">
                          <span className="source-type">{video.platform} video</span>
                          <span>{formatVideoDate(video)}</span>
                        </div>
                        <h3><a href={video.url} target="_blank" rel="noopener noreferrer">{video.title}<Icon name="external" size={15} /></a></h3>
                        <p className="source-publisher">
                          {video.channel || 'Channel information not available'} · Public video metadata
                        </p>
                        {video.description && <p className="video-description">{video.description}</p>}
                        <div className="source-card-footer">
                          <span>Metadata: {video.platform}</span>
                          <span>Open the platform link to watch; video content was not retrieved or verified</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                {visibleVideos.length > resultPageLimit && (
                  <button className="btn btn-secondary result-load-more" type="button" onClick={() => setResultPageLimit((current) => current + RESULTS_PER_PAGE)}>
                    Show next {Math.min(RESULTS_PER_PAGE, visibleVideos.length - resultPageLimit)} videos
                  </button>
                )}
              </div>
            ) : null}
          </section>
        )}

          </>
        )}
        {activePage === 'history' && (
          <section className="research-history-page" aria-labelledby="research-history-heading">
            <p className="research-eyebrow">Your workspace</p>
            <h1 id="research-history-heading">Research History</h1>
            <p>Your searches appear here automatically. Use Saved Project to curate sources into named collections.</p>
            {historyNotice && <p className="research-history-notice" role="status">{historyNotice}</p>}
            {history.length ? (
              <ul className="research-history-page-list">
                {history.map((item) => (
                  <li className="research-history-item" key={item.id}>
                    <button className="research-history-open" type="button" onClick={() => openSavedResearch(item)}>
                      <strong>{item.question}</strong>
                      <span>{item.historyResultCounts?.sources ?? item.sources.length} scholarly sources · {new Date(item.retrievedAt).toLocaleString()}</span>
                      {item.parentQuestion && <small>Follow-up from: {item.parentQuestion}</small>}
                    </button>
                    <button
                      className="research-history-remove"
                      type="button"
                      aria-label={`Remove research from history: ${item.question}`}
                      title="Remove from history"
                      onClick={() => removeHistoryEntry(item.id)}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="research-history-empty">Your searches will appear here after you run research.</p>}
          </section>
        )}
        {activePage === 'projects' && (
          <section className="research-history-page" aria-labelledby="saved-projects-heading">
            <p className="research-eyebrow">Your workspace</p>
            <h1 id="saved-projects-heading">{selectedSavedProjectId ? savedProjects.find((project) => project.id === selectedSavedProjectId)?.name ?? 'Saved Project' : 'Saved Project'}</h1>
            {selectedSavedProjectId ? (
              (() => {
                const project = savedProjects.find((entry) => entry.id === selectedSavedProjectId);
                if (!project) return <p className="research-history-empty">This project is no longer available.</p>;
                return (
                  <>
                    <p>{project.sources.length} saved source{project.sources.length === 1 ? '' : 's'} · Collections are stored in this browser.</p>
                    <div className="saved-project-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => setSelectedSavedProjectId(null)}>All projects</button>
                      <button type="button" className="btn btn-ghost" onClick={() => deleteProject(project.id)}>Delete project</button>
                    </div>
                    {project.sources.length ? (
                      <ul className="research-history-page-list">
                        {project.sources.map((source) => (
                          <li key={source.id}>
                            <div className="saved-project-source">
                              <a href={source.url} target="_blank" rel="noopener noreferrer">
                                <strong>{source.title}</strong>
                              </a>
                              <span>{source.category ?? source.kind ?? 'Source'} · Added {new Date(source.savedAt).toLocaleString()}</span>
                              {source.savedFor && <small>Added from: {source.savedFor}</small>}
                              <button type="button" className="btn btn-ghost" onClick={() => deleteProjectSource(project.id, source.id)}>Remove source</button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="research-history-empty">No sources yet. Add sources from Sources.</p>}
                  </>
                );
              })()
            ) : (
              <>
                <p>Create as many named projects as browser storage allows, then add sources from different searches.</p>
                <form
                  className="saved-project-create-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    createProject(projectNameDraft);
                  }}
                >
                  <label htmlFor="saved-project-name">New project name</label>
                  <div>
                    <input
                      id="saved-project-name"
                      value={projectNameDraft}
                      onChange={(event) => setProjectNameDraft(event.target.value)}
                      maxLength={100}
                      placeholder="e.g. Climate policy sources"
                      required
                    />
                    <button type="submit" className="btn btn-primary">Create project</button>
                  </div>
                </form>
                {savedProjects.length ? (
                  <ul className="research-history-page-list">
                    {savedProjects.map((project) => (
                      <li key={project.id}>
                        <button type="button" onClick={() => setSelectedSavedProjectId(project.id)}>
                          <strong>{project.name}</strong>
                          <span>{project.sources.length} source{project.sources.length === 1 ? '' : 's'} · Updated {new Date(project.updatedAt).toLocaleString()}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="research-history-empty">No projects yet. Create one above, or save a source from Sources into a new project.</p>}
              </>
            )}
          </section>
        )}
        {activePage === 'discover' && <TrendingDiscover />}
        {activePage === 'community-hub' && <CommunityResearchHub />}
        <OrganizationWorkspace
          page={activePage}
          hidden={!activePage.startsWith('org-') && activePage !== 'file-builder' && activePage !== 'saved-files' && activePage !== 'team-workspace'}
          research={research}
          projects={savedProjects}
          onUpdateProject={updateProjectDetails}
          onCreateProject={createProject}
          onRunResearch={(researchQuestion) => {
            setQuestion(researchQuestion);
            startResearch(null, researchQuestion);
          }}
          onNavigateResearch={navigateResearchWorkspace}
        />
          </main>
        </div>
      </div>
    </div>
  );
}
