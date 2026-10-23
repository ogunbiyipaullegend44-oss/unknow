import { useEffect, useMemo, useState } from 'react';
import { buildEvidenceStatements } from './claimEvidenceUtils.js';
import CommunityPublishDialog from './CommunityPublishDialog.jsx';
import {
  parseResearchFiles,
  removeResearchFile,
  RESEARCH_FILES_KEY,
  saveResearchFile,
} from './researchWorkspace.js';
import { categoryFor, sourceHost, sourceDateLabel } from './sourceCategories.js';
import './OrganizationWorkspace.css';

const PAGE_TITLES = {
  'org-dashboard': 'Intelligence Workspace',
  'org-projects': 'Research projects',
  'org-monitoring': 'Source monitoring',
  'org-findings': 'Evidence and findings',
  'org-geography': 'Geographic explorer',
  'org-briefings': 'Research briefings',
  'file-builder': 'Create a File',
  'saved-files': 'Saved files',
  'team-workspace': 'Team workspace',
};

function newId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function splitList(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function readFiles() {
  try {
    return parseResearchFiles(window.localStorage.getItem(RESEARCH_FILES_KEY));
  } catch (error) {
    return { error: error.message };
  }
}

function sourceRecords(research, projects) {
  const current = [
    ...(research?.sources ?? []).map((source) => ({
      id: `academic:${source.id}`,
      originalId: source.id,
      title: source.title,
      url: source.url,
      description: source.abstract || '',
      publisher: source.journal || source.publisher || '',
      category: categoryFor({ ...source, kind: 'academic' }),
      date: source.publicationYear
        ? source.publicationMonth
          ? `${source.publicationYear}-${String(source.publicationMonth).padStart(2, '0')}`
          : String(source.publicationYear)
        : '',
      provider: source.metadataSource || 'Academic catalog',
      savedFor: research.question,
    })),
    ...(research?.webSources ?? []).map((source) => ({
      id: `web:${source.id}`,
      originalId: source.id,
      title: source.title,
      url: source.url,
      description: source.description || '',
      rawContent: source.rawContent || '',
      publisher: sourceHost(source.url),
      category: categoryFor({ ...source, kind: 'web' }),
      date: source.publishedAt || '',
      provider: source.provider || 'Web search',
      savedFor: research.question,
    })),
    ...(research?.videos ?? []).map((source) => ({
      id: `video:${source.id}`,
      originalId: source.id,
      title: source.title,
      url: source.url,
      description: source.description || '',
      rawContent: source.rawContent || '',
      publisher: source.channel || source.platform || '',
      category: 'Videos and YouTube',
      date: source.publishedAt || '',
      provider: source.platform || 'Video platform',
      savedFor: research.question,
    })),
  ].filter((source) => source.title && source.url);
  const projectSources = projects.flatMap((project) =>
    project.sources.map((source) => ({
      ...source,
      id: `project:${project.id}:${source.id}`,
      originalId: source.id,
      projectId: project.id,
      category: source.category || categoryFor({
        ...source,
        kind: source.kind || (source.platform ? 'video' : 'web'),
      }),
      date: source.date || source.publicationDate || source.publishedAt || '',
      provider: source.provider || source.publisher || sourceHost(source.url),
      projectName: project.name,
    })),
  );
  return [...current, ...projectSources].filter((source, index, all) =>
    all.findIndex((item) => item.id === source.id) === index,
  );
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function reportHtml(file) {
  const sections = file.sections.map((section) => {
    const findings = file.findings.filter((finding) => finding.sectionId === section.id);
    return `<section><h2>${escapeHtml(section.title)}</h2>${section.notes ? `<p>${escapeHtml(section.notes)}</p>` : ''}${findings.map((finding) => {
      const source = file.sources.find((item) => item.id === finding.sourceId);
      return `<blockquote>${escapeHtml(finding.text)}${source ? `<footer>Source: <a href="${escapeHtml(source.url)}">${escapeHtml(source.title)}</a></footer>` : ''}</blockquote>`;
    }).join('')}</section>`;
  }).join('');
  const sources = file.sources.map((source, index) =>
    `<li><a href="${escapeHtml(source.url)}">${index + 1}. ${escapeHtml(source.title)}</a> — ${escapeHtml(source.publisher || source.provider || sourceHost(source.url))}; ${escapeHtml(sourceDateLabel(source.date))}</li>`,
  ).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(file.title)}</title><style>body{max-width:850px;margin:48px auto;padding:0 24px;color:#202632;font:16px/1.6 system-ui,sans-serif}h1,h2{line-height:1.2}header{border-bottom:1px solid #d7dce2;margin-bottom:28px;padding-bottom:18px}blockquote{margin:18px 0;padding:12px 16px;border-left:3px solid #6277a5;background:#f5f7fa}blockquote footer{margin-top:10px;font-size:13px}li{margin:8px 0;overflow-wrap:anywhere}@media print{body{margin:0 auto}}</style><body><header><h1>${escapeHtml(file.title)}</h1><p>${escapeHtml(file.topic)}</p><p>Updated ${escapeHtml(new Date(file.updatedAt).toLocaleDateString())}</p></header>${sections}<section><h2>Sources</h2><ol>${sources}</ol></section></body></html>`;
}

export default function OrganizationWorkspace({
  page,
  hidden = false,
  research,
  projects,
  onUpdateProject,
  onCreateProject,
  onRunResearch,
  onNavigateResearch,
}) {
  const [files, setFiles] = useState([]);
  const [storageError, setStorageError] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState('all');
  const [projectSort, setProjectSort] = useState('updated');
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [projectDraft, setProjectDraft] = useState(null);
  const [projectError, setProjectError] = useState('');
  const [builderMode, setBuilderMode] = useState('research');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [reportProjectId, setReportProjectId] = useState('');
  const [urlDraft, setUrlDraft] = useState('');
  const [manualSources, setManualSources] = useState([]);
  const [editingFileSources, setEditingFileSources] = useState([]);
  const [savedFindingRecords, setSavedFindingRecords] = useState([]);
  const [urlError, setUrlError] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [sourceDateFilter, setSourceDateFilter] = useState('any');
  const [sourceGeographyFilter, setSourceGeographyFilter] = useState('');
  const [sourceRelevanceFilter, setSourceRelevanceFilter] = useState('all');
  const [selectedSourceCategory, setSelectedSourceCategory] = useState('');
  const [selectedSourceIds, setSelectedSourceIds] = useState([]);
  const [selectedFindingIds, setSelectedFindingIds] = useState([]);
  const [findingSections, setFindingSections] = useState({});
  const [titleDraft, setTitleDraft] = useState('');
  const [topicDraft, setTopicDraft] = useState('');
  const [sections, setSections] = useState(() => [
    { id: newId('section'), title: 'Key findings', notes: '' },
    { id: newId('section'), title: 'Context and limitations', notes: '' },
  ]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [fileError, setFileError] = useState('');
  const [fileNotice, setFileNotice] = useState('');
  const [fileSearch, setFileSearch] = useState('');
  const [teamNotice, setTeamNotice] = useState('');
  const [publishFile, setPublishFile] = useState(null);
  const [sourceSelectionMode, setSourceSelectionMode] = useState('manual');

  useEffect(() => {
    const loaded = readFiles();
    if (Array.isArray(loaded)) {
      setFiles(loaded);
      setStorageError('');
    } else {
      setStorageError(`Saved files could not be loaded: ${loaded.error}`);
    }
  }, []);

  const availableSources = useMemo(
    () => {
      const all = [...editingFileSources, ...sourceRecords(research, projects), ...manualSources];
      return all.filter((source, index) =>
        all.findIndex((item) => item.id === source.id) === index,
      );
    },
    [editingFileSources, manualSources, projects, research],
  );
  const findings = useMemo(() => {
    const useProjectInput = page === 'file-builder' && builderMode === 'project';
    if (!research && !useProjectInput) return [];
    const selectedProjects = useProjectInput
      ? projects.filter((project) => selectedProjectId === 'all' || project.id === selectedProjectId)
      : [];
    const savedSources = selectedProjects.flatMap((project) => project.sources);
    const projectTopic = selectedProjects
      .map((project) => [project.objectives, (project.keywords ?? []).join(' ')].filter(Boolean).join(' '))
      .filter(Boolean)
      .join(' ');
    const evidenceResearch = {
      question: projectTopic || research?.question || topicDraft,
      sources: [
        ...(research?.sources ?? []),
        ...savedSources.filter((source) => source.kind === 'academic').map((source) => ({
          ...source,
          abstract: source.abstract || source.description || '',
        })),
      ],
      webSources: [
        ...(research?.webSources ?? []),
        ...savedSources.filter((source) => source.kind !== 'academic' && source.kind !== 'video').map((source) => ({
          ...source,
          description: source.description || source.abstract || '',
        })),
      ],
      videos: [
        ...(research?.videos ?? []),
        ...savedSources.filter((source) => source.kind === 'video').map((source) => ({
          ...source,
          platform: source.platform || source.provider || 'Video platform',
        })),
      ],
    };
    if (!evidenceResearch.question.trim()) return [];
    return buildEvidenceStatements(evidenceResearch).flatMap((statement) =>
      statement.evidence.map((evidence, index) => {
        const source = availableSources.find((item) => item.originalId === evidence.sourceId || item.url === evidence.url);
        if (!source) return null;
        return {
          id: `${statement.key}:${source.id}:${index}`,
          text: statement.text,
          sourceId: source.id,
          sourceTitle: source.title,
          url: source.url,
          context: evidence.context,
          limitation: evidence.limitation,
        };
      }).filter(Boolean),
    );
  }, [availableSources, builderMode, page, projects, research, selectedProjectId, topicDraft]);
  const currentPageTitle = PAGE_TITLES[page] || 'Research workspace';
  const activeProjects = projects.filter((project) => !project.archived);
  const visibleProjects = projects.filter((project) =>
    `${project.name} ${project.description ?? ''} ${(project.keywords ?? []).join(' ')}`
      .toLocaleLowerCase()
      .includes(projectSearch.toLocaleLowerCase()),
  ).filter((project) => projectStatusFilter === 'all' ||
    (projectStatusFilter === 'active' ? !project.archived : project.archived))
    .sort((left, right) => projectSort === 'name'
      ? left.name.localeCompare(right.name)
      : Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const sourceActivity = availableSources.slice(0, 6);
  const monitoredTopics = [...new Set(activeProjects.flatMap((project) => project.keywords ?? []))];
  const savedFileFindings = files.flatMap((file) => file.findings.flatMap((finding) => {
    const source = file.sources.find((item) => item.id === finding.sourceId);
    if (!source?.url) return [];
    return [{
      id: `saved-file:${file.id}:${finding.id}`,
      text: finding.text,
      sourceId: source.id,
      sourceTitle: source.title,
      url: source.url,
      limitation: 'Saved excerpt; review the original source for context.',
    }];
  }));
  const projectFindings = activeProjects.flatMap((project) => {
    const projectSources = sourceRecords(null, [project]);
    const projectTopic = [project.objectives, (project.keywords ?? []).join(' ')].filter(Boolean).join(' ');
    if (!projectTopic.trim()) return [];
    const evidenceResearch = {
      question: projectTopic,
      sources: projectSources.filter((source) => source.kind === 'academic').map((source) => ({
        ...source,
        abstract: source.abstract || source.description || '',
      })),
      webSources: projectSources.filter((source) => source.kind !== 'academic' && source.kind !== 'video').map((source) => ({
        ...source,
        description: source.description || source.abstract || '',
      })),
      videos: projectSources.filter((source) => source.kind === 'video').map((source) => ({
        ...source,
        platform: source.platform || source.provider || 'Video platform',
      })),
    };
    if (!evidenceResearch.sources.length && !evidenceResearch.webSources.length && !evidenceResearch.videos.length) return [];
    return buildEvidenceStatements(evidenceResearch).flatMap((statement) =>
      statement.evidence.flatMap((evidence) => {
        const source = projectSources.find((item) => item.originalId === evidence.sourceId || item.url === evidence.url);
        if (!source) return [];
        return [{
          id: `project:${project.id}:${statement.key}:${source.id}`,
          text: statement.text,
          sourceTitle: source.title,
          url: source.url,
          projectName: project.name,
          limitation: evidence.limitation,
        }];
      }),
    );
  });
  const dashboardFindings = [...findings, ...projectFindings, ...savedFileFindings];
  const geographyEntries = [
    ...(research?.scope?.region ? [{ id: 'current-research', title: research.question, geography: research.scope.region }] : []),
    ...activeProjects
      .filter((project) => project.geography?.trim())
      .map((project) => ({ id: project.id, title: project.name, geography: project.geography })),
  ];
  const inputSources = availableSources.filter((source) => {
    if (builderMode === 'project') {
      return (selectedProjectId === 'all' && (source.projectId || source.projectName)) ||
        source.projectId === selectedProjectId ||
        source.projectName === projects.find((project) => project.id === selectedProjectId)?.name ||
        source.id.startsWith('url:');
    }
    if (builderMode === 'url') return source.id.startsWith('url:');
    return !source.projectName && !source.projectId;
  });
  const visibleSources = (page === 'file-builder' ? inputSources : availableSources).filter((source) =>
    `${source.title} ${source.description} ${source.publisher} ${source.projectName ?? ''}`
      .toLocaleLowerCase().includes(sourceFilter.toLocaleLowerCase()) &&
    (categoryFilter === 'All categories' || source.category === categoryFilter) &&
    (!sourceGeographyFilter.trim() ||
      `${source.title} ${source.description}`.toLocaleLowerCase().includes(sourceGeographyFilter.trim().toLocaleLowerCase())) &&
    (sourceDateFilter === 'any' || (() => {
      const date = Date.parse(source.date);
      return Number.isFinite(date) && date >= Date.now() - Number(sourceDateFilter) * 365.25 * 24 * 60 * 60 * 1000;
    })()) &&
    (sourceRelevanceFilter === 'all' || (() => {
      const terms = (topicDraft.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [])
        .filter((term) => term.length > 3);
      const text = `${source.title} ${source.description}`.toLocaleLowerCase();
      return terms.some((term) => text.includes(term));
    })()),
  );
  const selectedSources = availableSources.filter((source) => selectedSourceIds.includes(source.id));
  const selectedFindings = selectedFindingIds.flatMap((id) => {
    const current = findings.find((finding) => finding.id === id);
    if (current) return [current];
    return savedFindingRecords.filter((finding) => finding.id === id);
  });
  const builderFindings = [
    ...findings,
    ...savedFindingRecords.filter((saved) => !findings.some((finding) => finding.id === saved.id)),
  ];
  const categories = ['All categories', ...new Set(availableSources.map((source) => source.category))];
  const inputCategories = [...new Set(inputSources.map((source) => source.category))];
  const visibleFiles = files.filter((file) =>
    `${file.title} ${file.topic}`.toLocaleLowerCase().includes(fileSearch.toLocaleLowerCase()),
  );

  const persistFiles = (nextFiles) => {
    try {
      window.localStorage.setItem(RESEARCH_FILES_KEY, JSON.stringify(nextFiles));
      setFiles(nextFiles);
      setStorageError('');
      return true;
    } catch (error) {
      setStorageError(`Saved files could not be saved in this browser: ${error.message}`);
      return false;
    }
  };

  const beginNewFile = () => {
    const firstSection = { id: newId('section'), title: 'Key findings', notes: '' };
    setActiveFileId(null);
    setTitleDraft(research?.question || '');
    setTopicDraft(research?.question || '');
    setSections([firstSection, { id: newId('section'), title: 'Context and limitations', notes: '' }]);
    setSelectedSourceIds([]);
    setSelectedFindingIds([]);
    setFindingSections({});
    setEditingFileSources([]);
    setSavedFindingRecords([]);
    setManualSources([]);
    setBuilderMode('research');
    setSelectedProjectId('');
    setReportProjectId('');
    setUrlDraft('');
    setUrlError('');
    setSourceFilter('');
    setCategoryFilter('All categories');
    setSourceDateFilter('any');
    setSourceGeographyFilter('');
    setSourceRelevanceFilter('all');
    setSourceSelectionMode('manual');
    setSelectedSourceCategory('');
    setFileError('');
    setFileNotice('');
  };

  const openFile = (file) => {
    setSourceSelectionMode('manual');
    setSelectedSourceCategory('');
    setActiveFileId(file.id);
    setTitleDraft(file.title);
    setTopicDraft(file.topic);
    setReportProjectId(file.projectId || '');
    const containsProjectSources = file.sources.some((source) => source.projectId || source.projectName);
    setSelectedProjectId(file.projectId || (containsProjectSources ? 'all' : ''));
    setBuilderMode(file.projectId || containsProjectSources ? 'project' : 'research');
    setSections(file.sections.map((section) => ({ ...section })));
    setSelectedSourceIds(file.sources.map((source) => source.id));
    setEditingFileSources(file.sources);
    setSavedFindingRecords(file.findings.map((finding) => {
      const source = file.sources.find((item) => item.id === finding.sourceId);
      return {
        ...finding,
        sourceTitle: source?.title || 'Source unavailable',
        url: source?.url || '',
        limitation: 'Saved excerpt; original source metadata was preserved with this file.',
      };
    }));
    setSelectedFindingIds(file.findings.map((finding) => finding.id));
    setFindingSections(Object.fromEntries(file.findings.map((finding) => [finding.id, finding.sectionId])));
    setFileError('');
    setFileNotice('');
  };

  const saveFile = () => {
    if (!titleDraft.trim()) {
      setFileError('Enter a title before saving this file.');
      return null;
    }
    const sourceById = new Map(availableSources.map((source) => [source.id, source]));
    const selectedSourceRecords = selectedSourceIds
      .map((id) => sourceById.get(id))
      .filter(Boolean);
    const sourcesWithFindings = selectedFindings
      .map((finding) => sourceById.get(finding.sourceId))
      .filter(Boolean);
    const reportSources = [...new Map(
      [...selectedSourceRecords, ...sourcesWithFindings].map((source) => [source.id, source]),
    ).values()];
    const draft = {
      id: activeFileId || newId('file'),
      title: titleDraft,
      topic: topicDraft,
      projectId: reportProjectId || null,
      sections,
      findings: selectedFindings.map((finding) => ({
        id: finding.id,
        text: finding.text,
        sourceId: finding.sourceId,
        sectionId: findingSections[finding.id] || sections[0]?.id || '',
      })),
      sources: reportSources.map((source) => ({
        id: source.id,
        title: source.title,
        url: source.url,
        publisher: source.publisher || '',
        provider: source.provider || '',
        date: source.date || '',
        ...(source.projectId ? { projectId: source.projectId, projectName: source.projectName || '' } : {}),
      })),
      ...(files.find((file) => file.id === activeFileId)
        ? { createdAt: files.find((file) => file.id === activeFileId).createdAt }
        : {}),
    };
    try {
      const nextFiles = saveResearchFile(files, draft);
      if (!persistFiles(nextFiles)) return null;
      setActiveFileId(draft.id);
      setFileNotice('Research file saved in this browser. Its source links and selected excerpts are preserved.');
      setFileError('');
      return nextFiles.find((file) => file.id === draft.id);
    } catch (error) {
      setFileError(error.message);
      return null;
    }
  };

  const exportFile = (print = false) => {
    const draft = {
      id: activeFileId || 'preview',
      title: titleDraft.trim() || 'Research file',
      topic: topicDraft,
      sections,
      findings: selectedFindings.map((finding) => ({
        ...finding,
        sectionId: findingSections[finding.id] || sections[0]?.id || '',
      })),
      sources: availableSources.filter((source) =>
        selectedSourceIds.includes(source.id) ||
        selectedFindings.some((finding) => finding.sourceId === source.id),
      ),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectId: selectedProjectId || null,
    };
    const blob = new Blob([reportHtml(draft)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    if (print) {
      const printWindow = window.open(url, '_blank');
      if (!printWindow) setFileError('The print-ready preview was blocked. Allow pop-ups for this site and try again.');
      else setFileError('');
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(titleDraft.trim() || 'research-file').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 100)}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const createManualUrlSource = () => {
    try {
      const parsed = new URL(urlDraft.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      const newSource = {
        id: `url:${parsed.href}`,
        title: parsed.hostname,
        url: parsed.href,
        description: 'User-provided source link. Page content was not fetched or reviewed.',
        category: 'Websites and Articles',
        publisher: parsed.hostname,
        provider: 'User-provided URL',
        date: '',
      };
      setManualSources((current) => [...current.filter((source) => source.id !== newSource.id), newSource]);
      setSelectedSourceIds((selected) => [...new Set([...selected, newSource.id])]);
      setUrlDraft('');
      setUrlError('URL added as a source link only. Its page content was not fetched.');
    } catch {
      setUrlError('Enter a valid HTTP or HTTPS URL.');
    }
  };

  const createProjectFromDraft = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const metadata = {
      description: String(form.get('description') ?? '').trim(),
      objectives: String(form.get('objectives') ?? '').trim(),
      geography: String(form.get('geography') ?? '').trim(),
      keywords: splitList(String(form.get('keywords') ?? '')),
      categories: splitList(String(form.get('categories') ?? '')),
      owner: String(form.get('owner') ?? '').trim(),
    };
    if (!onCreateProject(name, null, metadata)) return;
    event.currentTarget.reset();
  };

  const saveProjectDraft = () => {
    if (!projectDraft || !editingProjectId) return;
    try {
      const saved = onUpdateProject(editingProjectId, {
        name: projectDraft.name,
        description: projectDraft.description,
        objectives: projectDraft.objectives,
        geography: projectDraft.geography,
        keywords: splitList(projectDraft.keywords),
        categories: splitList(projectDraft.categories),
        owner: projectDraft.owner,
        archived: projectDraft.archived,
      });
      if (!saved) {
        setProjectError('Project changes could not be saved. Review the browser storage warning and try again.');
        return;
      }
      setEditingProjectId(null);
      setProjectDraft(null);
      setProjectError('');
    } catch (error) {
      setProjectError(error.message);
    }
  };

  const startFileResearch = () => {
    if (topicDraft.trim().length < 8) {
      setFileError('Enter a topic or research question of at least 8 characters.');
      return;
    }
    setFileError('');
    onRunResearch(topicDraft.trim());
  };

  const toggle = (setter, id) => setter((current) =>
    current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
  );
  const updateSection = (id, changes) => setSections((current) =>
    current.map((section) => section.id === id ? { ...section, ...changes } : section),
  );
  const moveSection = (index, direction) => setSections((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const reordered = [...current];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    return reordered;
  });
  const removeSection = (sectionId) => {
    const remaining = sections.filter((section) => section.id !== sectionId);
    const fallbackId = remaining[0]?.id;
    setSections(remaining);
    setFindingSections((current) => Object.fromEntries(
      Object.entries(current).map(([findingId, currentSectionId]) => [
        findingId,
        currentSectionId === sectionId ? fallbackId : currentSectionId,
      ]),
    ));
  };

  return (
    <div className="organization-workspace" hidden={hidden}>
      <header className="organization-heading">
        <div>
          <p className="research-eyebrow">Research workspace</p>
          <h1>{currentPageTitle}</h1>
          <p>
            {page === 'org-dashboard'
              ? 'Overview of your research projects, sources, findings, and saved files.'
              : 'Projects, source collections, and reports saved locally in this browser.'}
          </p>
          {page === 'org-dashboard' && <h2 className="organization-dashboard-title">Dashboard</h2>}
        </div>
      </header>
      {storageError && <p className="discovery-warning" role="alert">{storageError}</p>}
      {projectError && <p className="discovery-warning" role="alert">{projectError}</p>}

      {page === 'org-dashboard' && (
        <>
          <div className="organization-summary-grid">
            <button type="button" onClick={() => onNavigateResearch('org-projects')} aria-label={`${activeProjects.length} active projects. Open project management.`}>
              <span>Active projects</span><strong>{activeProjects.length}</strong>
            </button>
            <button type="button" onClick={() => onNavigateResearch('org-monitoring')} aria-label={`${projects.reduce((total, project) => total + project.sources.length, 0)} saved collection sources. Browse source activity.`}>
              <span>Saved collection sources</span><strong>{projects.reduce((total, project) => total + project.sources.length, 0)}</strong>
            </button>
            <button type="button" onClick={() => onNavigateResearch('org-findings')} aria-label={`${dashboardFindings.length} source-backed evidence excerpts. Review evidence and findings.`}>
              <span>Evidence excerpts</span><strong>{dashboardFindings.length}</strong>
            </button>
            <button type="button" onClick={() => onNavigateResearch('saved-files')} aria-label={`${files.length} saved research files. Open saved files.`}>
              <span>Saved research files</span><strong>{files.length}</strong>
            </button>
          </div>
          <div className="organization-dashboard-grid">
            <section className="organization-panel">
              <div className="organization-panel-heading"><div><h2>Geographic context</h2><p>Scopes from the current search and active projects</p></div><button type="button" className="btn btn-ghost" onClick={() => onNavigateResearch('org-geography')}>Explore</button></div>
              {geographyEntries.length ? <ul className="organization-geography-list">{geographyEntries.slice(0, 5).map((entry) => <li key={entry.id}><strong>{entry.geography}</strong><span>{entry.title}</span></li>)}</ul> : <p className="organization-empty">Set a geographic scope in a project or run a scoped search to see context here.</p>}
              <p className="organization-muted">Scopes are user-selected. Mentioned places are not treated as verified event locations, and no geographic pattern is inferred.</p>
            </section>
            <section className="organization-panel">
              <div className="organization-panel-heading"><div><h2>Research projects</h2><p>Private collections on this browser</p></div><button type="button" className="btn btn-ghost" onClick={() => onNavigateResearch('org-projects')}>Manage</button></div>
              {activeProjects.length ? activeProjects.slice(0, 4).map((project) => {
                const projectReports = files.filter((file) => file.projectId === project.id).length;
                return (
                <button className="organization-project-row" type="button" key={project.id} onClick={() => onNavigateResearch('org-projects')}>
                  <strong>{project.name}</strong><span>{project.sources.length} saved source{project.sources.length === 1 ? '' : 's'} · {projectReports} briefing{projectReports === 1 ? '' : 's'} · Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                  {project.description && <small>{project.description}</small>}
                </button>
                );
              }) : <p className="organization-empty">Create a project to organize sources, research questions, and reports.</p>}
              <button type="button" className="btn btn-secondary" onClick={() => onNavigateResearch('org-projects')}>Create or manage projects</button>
            </section>
            <section className="organization-panel">
              <div className="organization-panel-heading"><div><h2>Monitored topics</h2><p>Keywords from active projects; no background polling is active</p></div><button type="button" className="btn btn-ghost" onClick={() => onNavigateResearch('org-projects')}>Manage topics</button></div>
              {monitoredTopics.length ? <div className="organization-chips">{monitoredTopics.map((topic) => <button type="button" key={topic} title={`Manage project keywords: ${topic}`} onClick={() => onNavigateResearch('org-projects')}>{topic}</button>)}</div> : <p className="organization-empty">Add keywords to an active project to keep its research focus visible here.</p>}
              <div className="organization-alert-note"><strong>Research alerts</strong><span>Automatic monitoring and notifications are not configured, so there are no unverified alerts. Review actual retrieved items in source activity after running a search.</span><button type="button" onClick={() => onNavigateResearch(sourceActivity.length ? 'org-monitoring' : 'new-research')}>{sourceActivity.length ? 'Review source activity' : 'Run research'}</button></div>
            </section>
            <section className="organization-panel">
              <div className="organization-panel-heading"><div><h2>Recent source activity</h2><p>Retrieved sources and saved collection items</p></div><button type="button" className="btn btn-ghost" onClick={() => onNavigateResearch('org-monitoring')}>Browse</button></div>
              {sourceActivity.length ? sourceActivity.slice(0, 5).map((source) => (
                <a className="organization-activity-row" href={source.url} target="_blank" rel="noopener noreferrer" key={source.id}>
                  <strong>{source.title}</strong><span>{source.category} · {source.date ? sourceDateLabel(source.date) : 'Publication date unavailable'} · {source.projectName || 'Current search'}</span>
                </a>
              )) : <p className="organization-empty">Run a search or save sources to a project to see source activity.</p>}
            </section>
            <section className="organization-panel">
              <div className="organization-panel-heading"><div><h2>Recent findings</h2><p>Exact excerpts from retrieved text, not verified facts</p></div><button type="button" className="btn btn-ghost" onClick={() => onNavigateResearch('org-findings')}>Review</button></div>
              {dashboardFindings.length ? dashboardFindings.slice(0, 3).map((finding) => (
                <blockquote className="organization-finding-preview" key={finding.id}>{finding.text}<cite><a href={finding.url} target="_blank" rel="noopener noreferrer">{finding.sourceTitle}</a></cite></blockquote>
              )              ) : <p className="organization-empty">No source-backed excerpts are available yet. Run research, add described sources to a project, or build a briefing from saved research.</p>}
              {files.length > 0 && <div className="organization-alert-note"><strong>Recent research file</strong><button type="button" onClick={() => { onNavigateResearch('saved-files'); openFile(files[0]); }}>Open {files[0].title}</button></div>}
            </section>
          </div>
          <section className="organization-panel organization-integration-note">
            <h2>Shared workspaces and collaboration</h2>
            <p>Projects and files are stored in this browser only. Accounts, team sharing, role-based access, scheduled monitoring, and cross-device sync are not configured.</p>
            <button type="button" className="btn btn-secondary" onClick={() => onNavigateResearch('team-workspace')}>Team workspace details</button>
          </section>
        </>
      )}

      {page === 'org-projects' && (
        <div className="organization-projects-layout">
          <section className="organization-panel">
            <div className="organization-panel-heading"><h2>Project library</h2><span>{projects.length} total</span></div>
            <label className="organization-field"><span>Search projects</span><input value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Name, description, or keyword" /></label>
            <div className="organization-filter-row">
              <label className="organization-field"><span>Status</span><select value={projectStatusFilter} onChange={(event) => setProjectStatusFilter(event.target.value)}><option value="all">All projects</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
              <label className="organization-field"><span>Sort</span><select value={projectSort} onChange={(event) => setProjectSort(event.target.value)}><option value="updated">Recently updated</option><option value="name">Name</option></select></label>
            </div>
            <form className="organization-create-form" onSubmit={createProjectFromDraft}>
              <h3>Create a project</h3>
              <label><span>Project name</span><input name="name" maxLength={100} required /></label>
              <label><span>Description</span><textarea name="description" rows="2" maxLength={1000} /></label>
              <label><span>Objectives and questions</span><textarea name="objectives" rows="2" maxLength={2000} /></label>
              <label><span>Keywords (comma-separated)</span><input name="keywords" placeholder="e.g. climate policy, adaptation" /></label>
              <label><span>Geographic scope</span><input name="geography" placeholder="Countries or regions" /></label>
              <label><span>Preferred source categories</span><input name="categories" placeholder="Academic research, official sources" /></label>
              <label><span>Owner (optional)</span><input name="owner" maxLength={100} /></label>
              <button type="submit" className="btn btn-primary">Create project</button>
            </form>
          </section>
          <section className="organization-project-list">
            {visibleProjects.length ? visibleProjects.map((project) => (
              <article className={`organization-panel organization-project-card${project.archived ? ' is-archived' : ''}`} key={project.id}>
                {editingProjectId === project.id ? (
                  <div className="organization-form-grid">
                    {[
                      ['name', 'Project name'],
                      ['description', 'Description'],
                      ['objectives', 'Objectives and questions'],
                      ['keywords', 'Keywords (comma-separated)'],
                      ['geography', 'Geographic scope'],
                      ['categories', 'Preferred source categories'],
                      ['owner', 'Owner'],
                    ].map(([field, label]) => (
                      <label className="organization-field" key={field}><span>{label}</span>
                        {['description', 'objectives'].includes(field)
                          ? <textarea rows="2" value={projectDraft[field] ?? ''} onChange={(event) => setProjectDraft({ ...projectDraft, [field]: event.target.value })} />
                          : <input value={projectDraft[field] ?? ''} onChange={(event) => setProjectDraft({ ...projectDraft, [field]: event.target.value })} />}
                      </label>
                    ))}
                    <label className="organization-checkbox"><input type="checkbox" checked={Boolean(projectDraft.archived)} onChange={(event) => setProjectDraft({ ...projectDraft, archived: event.target.checked })} /> Archive this project</label>
                    <div className="organization-actions"><button type="button" className="btn btn-primary" onClick={saveProjectDraft}>Save changes</button><button type="button" className="btn btn-ghost" onClick={() => { setEditingProjectId(null); setProjectDraft(null); }}>Cancel</button></div>
                  </div>
                ) : (
                  <>
                    <div className="organization-project-top"><div><span className={`organization-status${project.archived ? ' is-archived' : ''}`}>{project.archived ? 'Archived' : 'Active'}</span><h2>{project.name}</h2></div><button type="button" className="btn btn-ghost" onClick={() => { setEditingProjectId(project.id); setProjectDraft({ name: project.name, description: project.description ?? '', objectives: project.objectives ?? '', keywords: (project.keywords ?? []).join(', '), geography: project.geography ?? '', categories: (project.categories ?? []).join(', '), owner: project.owner ?? '', archived: Boolean(project.archived) }); }}>Edit</button></div>
                    <p>{project.description || 'Add a description to clarify this project’s purpose.'}</p>
                    <dl className="organization-project-meta">
                      <div><dt>Objectives</dt><dd>{project.objectives || 'Not specified'}</dd></div>
                      <div><dt>Geography</dt><dd>{project.geography || 'Not specified'}</dd></div>
                      <div><dt>Keywords</dt><dd>{(project.keywords ?? []).join(', ') || 'None added'}</dd></div>
                      <div><dt>Owner</dt><dd>{project.owner || 'Personal workspace'}</dd></div>
                      <div><dt>Sources</dt><dd>{project.sources.length} · Updated {new Date(project.updatedAt).toLocaleDateString()}</dd></div>
                      <div><dt>Research briefings</dt><dd>{files.filter((file) => file.projectId === project.id).length}</dd></div>
                    </dl>
                    {files.some((file) => file.projectId === project.id) && <button type="button" className="btn btn-ghost" onClick={() => onNavigateResearch('saved-files')}>View project briefings</button>}
                    <div className="organization-chips">{(project.categories ?? []).map((category) => <span key={category}>{category}</span>)}</div>
                  </>
                )}
              </article>
            )) : <p className="organization-empty">No projects match this search.</p>}
          </section>
        </div>
      )}

      {page === 'org-monitoring' && (
        <section className="organization-panel">
          <div className="organization-panel-heading"><div><h2>Source monitoring</h2><p>Browse sources already retrieved or saved to this browser.</p></div><button type="button" className="btn btn-secondary" onClick={() => research?.question ? onRunResearch(research.question) : onNavigateResearch('new-research')}>{research?.question ? 'Search again' : 'Start research'}</button></div>
          <p className="organization-callout">Search again reruns the current question against available providers. There is no background monitoring, checked-at timestamp, or verified new-item alert; publication dates come from source metadata.</p>
          <div className="organization-filter-row">
            <label className="organization-field"><span>Search sources</span><input value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} placeholder="Title, publisher, project" /></label>
            <label className="organization-field"><span>Category</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label className="organization-field"><span>Publication date</span><select value={sourceDateFilter} onChange={(event) => setSourceDateFilter(event.target.value)}><option value="any">Any date</option><option value="1">Past year</option><option value="3">Past 3 years</option><option value="5">Past 5 years</option></select></label>
            <label className="organization-field"><span>Location mention</span><input value={sourceGeographyFilter} onChange={(event) => setSourceGeographyFilter(event.target.value)} placeholder="Filter source text mentions" /></label>
          </div>
          <p className="organization-muted">Date filters use source publication dates, not retrieval time. Location filters search title and summary text only; a mention does not confirm where an event occurred.</p>
          {visibleSources.length ? <div className="organization-source-list">{visibleSources.map((source) => (
            <article className="organization-source-row" key={source.id}>
              <div><span className="organization-status">{source.category}</span><h3><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></h3><p>{source.description || 'No summary available.'}</p><small>{source.publisher || source.provider} · Published {source.date ? sourceDateLabel(source.date) : 'date unavailable'} · {source.projectName || 'Current search'}</small></div>
            </article>
          ))}</div> : <p className="organization-empty">No matching sources are available. Run research or save sources into a project first.</p>}
        </section>
      )}

      {page === 'org-findings' && (
        <section className="organization-panel">
          <div className="organization-panel-heading"><div><h2>Evidence and findings</h2><p>Sentence excerpts selected from retrieved descriptions and abstracts by wording overlap.</p></div><div className="organization-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigateResearch('claims')}>Open claim register</button><button type="button" className="btn btn-primary" onClick={() => onNavigateResearch('file-builder')}>Build a research file</button></div></div>
          <p className="organization-callout">These excerpts come from the current search, active project sources, and saved research files. They are not independently verified claims; summaries may omit context, qualifications, and contrary evidence.</p>
          <p className="organization-muted">Compare sources and record source review status or notes in Sources.</p>
          <button type="button" className="btn btn-ghost" onClick={() => onNavigateResearch('discovery')}>Review and compare sources</button>
          {dashboardFindings.length ? dashboardFindings.map((finding) => (
            <article className="organization-finding-card" key={finding.id}><blockquote>{finding.text}</blockquote><a href={finding.url} target="_blank" rel="noopener noreferrer">{finding.sourceTitle}</a><small>{finding.limitation}</small></article>
          )) : <p className="organization-empty">No traceable text excerpts are available in the current research. Open a research result and review its Claims and evidence section.</p>}
        </section>
      )}

      {page === 'org-geography' && (
        <section className="organization-panel">
          <div className="organization-panel-heading"><div><h2>Geographic explorer</h2><p>Research scope and location context</p></div></div>
          {geographyEntries.length ? (
            <>
              <ul className="organization-geography-list">{geographyEntries.map((entry) => <li key={entry.id}><strong>{entry.geography}</strong><span>{entry.title}</span></li>)}</ul>
              <p className="organization-callout">These are user-selected scopes, not locations independently verified from source text. The explorer does not infer regional patterns or generate an evidence map.</p>
              {research && <button type="button" className="btn btn-secondary" onClick={() => onNavigateResearch('research')}>Open current research</button>}
              <button type="button" className="btn btn-ghost" onClick={() => onNavigateResearch('org-projects')}>Manage project scopes</button>
            </>
          ) : <p className="organization-empty">Set a geographic scope in a project or run a scoped search to review it here. No map is generated from unverified location mentions.</p>}
        </section>
      )}

      {page === 'org-briefings' && (
        <section className="organization-panel">
          <div className="organization-panel-heading"><div><h2>Research briefings</h2><p>Assemble selected evidence into a traceable research file.</p></div><button type="button" className="btn btn-primary" onClick={() => { beginNewFile(); onNavigateResearch('file-builder'); }}>Create briefing</button></div>
          {files.length ? <ul className="organization-file-list">{files.slice(0, 10).map((file) => <li key={file.id}><button type="button" onClick={() => { openFile(file); onNavigateResearch('file-builder'); }}><strong>{file.title}</strong><span>{file.topic} · Updated {new Date(file.updatedAt).toLocaleDateString()}</span></button></li>)}</ul> : <p className="organization-empty">No briefings have been saved. Create one from retrieved evidence.</p>}
          <p className="organization-callout">Scheduled daily, weekly, or monthly briefing generation is not configured. Briefings are created manually from selected research.</p>
        </section>
      )}

      {page === 'file-builder' && (
        <div className="organization-builder">
          <section className="organization-panel organization-builder-input">
            <div className="organization-panel-heading"><div><h2>1. Choose research input</h2><p>Use retrieved evidence, a saved collection, a new topic, or a source link.</p></div></div>
            <div className="organization-mode-switch" role="group" aria-label="Research input type">
              {[['research', 'Current search'], ['project', 'Saved project'], ['topic', 'New topic'], ['url', 'URL only']].map(([mode, label]) => <button type="button" aria-pressed={builderMode === mode} key={mode} onClick={() => setBuilderMode(mode)}>{label}</button>)}
            </div>
            {builderMode === 'project' && <label className="organization-field"><span>Project collection</span><select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}><option value="">Choose a project</option><option value="all">All saved project collections</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
            {builderMode === 'topic' && <><label className="organization-field"><span>Research question or topic</span><textarea rows="3" maxLength={500} value={topicDraft} onChange={(event) => setTopicDraft(event.target.value)} placeholder="What would you like to research?" /></label><button type="button" className="btn btn-secondary" onClick={startFileResearch}>Search this topic</button><p className="organization-muted">You can return to this builder after the search; selections in the current editor remain in memory.</p></>}
            {builderMode === 'url' && <><label className="organization-field"><span>Webpage or document URL</span><input type="url" value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)} placeholder="https://example.org/report" /></label><button type="button" className="btn btn-secondary" onClick={createManualUrlSource}>Add source link</button><p className="organization-muted">The URL is recorded as a source link only; this application does not fetch arbitrary webpages for the file builder.</p>{urlError && <p className="organization-callout" role="status">{urlError}</p>}</>}
            {builderMode === 'project' && selectedProjectId && <p className="organization-muted">Showing saved sources from {selectedProjectId === 'all' ? 'all project collections' : projects.find((project) => project.id === selectedProjectId)?.name}. These collections are stored locally.</p>}
          </section>
          <div className="organization-builder-grid">
            <section className="organization-panel">
              <div className="organization-panel-heading"><div><h2>2. Select sources and evidence</h2><p>{selectedSourceIds.length} sources · {selectedFindingIds.length} evidence excerpts selected</p></div></div>
              <div className="organization-mode-switch" role="group" aria-label="Source selection method">
                <button type="button" aria-pressed={sourceSelectionMode === 'category'} onClick={() => setSourceSelectionMode('category')}>Choose by category</button>
                <button type="button" aria-pressed={sourceSelectionMode === 'manual'} onClick={() => setSourceSelectionMode('manual')}>Select manually</button>
              </div>
              {sourceSelectionMode === 'category' ? (
                <label className="organization-field">
                  <span>Source category (selects all sources in that category)</span>
                  <select
                    value={selectedSourceCategory}
                    onChange={(event) => {
                      const category = event.target.value;
                      setSelectedSourceCategory(category);
                      setSelectedSourceIds(inputSources
                        .filter((source) => source.category === category)
                        .map((source) => source.id));
                    }}
                  >
                    <option value="">Choose a category</option>
                    {inputCategories.map((category) => (
                      <option key={category} value={category}>
                        {category} ({inputSources.filter((source) => source.category === category).length})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
              <div className="organization-filter-row">
                <label className="organization-field"><span>Filter source titles and summaries</span><input value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} /></label>
                <label className="organization-field"><span>Source category</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
                <label className="organization-field"><span>Publication date</span><select value={sourceDateFilter} onChange={(event) => setSourceDateFilter(event.target.value)}><option value="any">Any date</option><option value="1">Past year</option><option value="3">Past 3 years</option><option value="5">Past 5 years</option></select></label>
                <label className="organization-field"><span>Location mention</span><input value={sourceGeographyFilter} onChange={(event) => setSourceGeographyFilter(event.target.value)} placeholder="Text mention only" /></label>
                <label className="organization-field"><span>Relevance hint</span><select value={sourceRelevanceFilter} onChange={(event) => setSourceRelevanceFilter(event.target.value)}><option value="all">All results</option><option value="topic">Topic-word overlap</option></select></label>
              </div>
              <p className="organization-muted">Relevance uses simple word overlap. Date and geography filters rely on available publication dates and text mentions.</p>
              <div className="organization-selection-list">
                {visibleSources.length ? visibleSources.map((source) => <label className="organization-select-card" key={source.id}>
                  <input type="checkbox" checked={selectedSourceIds.includes(source.id)} onChange={() => toggle(setSelectedSourceIds, source.id)} />
                  <span><strong>{source.title}</strong><small>{source.category} · {source.publisher || source.provider} · {source.date ? sourceDateLabel(source.date) : 'Date unavailable'}</small><span>{source.description || 'No retrieved summary.'}</span><a href={source.url} target="_blank" rel="noopener noreferrer">Open original source</a></span>
                </label>) : <p className="organization-empty">No sources in this input yet. Run a search, choose a saved project, or add a URL link.</p>}
              </div>
                </>
              )}
              {builderFindings.length > 0 && <div className="organization-finding-selection"><h3>Traceable text excerpts</h3>{builderFindings.map((finding) => <label className="organization-finding-select" key={finding.id}><input type="checkbox" checked={selectedFindingIds.includes(finding.id)} onChange={() => toggle(setSelectedFindingIds, finding.id)} /><span><strong>{finding.text}</strong><small>Source: {finding.sourceTitle} · Exact retrieved wording; not independently verified.</small></span></label>)}</div>}
            </section>
            <section className="organization-panel organization-outline">
              <div className="organization-panel-heading"><div><h2>3. Structure and preview</h2><p>Selected evidence retains its original source link.</p></div></div>
              <label className="organization-field"><span>Document title</span><input value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} maxLength={160} /></label>
              <label className="organization-field"><span>Topic or research question</span><textarea rows="2" value={topicDraft} onChange={(event) => setTopicDraft(event.target.value)} maxLength={500} /></label>
              <label className="organization-field"><span>Save this file to a project</span><select value={reportProjectId} onChange={(event) => setReportProjectId(event.target.value)}><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              <div className="organization-section-list"><h3>Document outline</h3>{sections.map((section, index) => <article className="organization-section-editor" key={section.id}>
                <div className="organization-section-title"><input aria-label="Section heading" value={section.title} onChange={(event) => updateSection(section.id, { title: event.target.value })} /><div><button type="button" aria-label="Move section up" disabled={index === 0} onClick={() => moveSection(index, -1)}>↑</button><button type="button" aria-label="Move section down" disabled={index === sections.length - 1} onClick={() => moveSection(index, 1)}>↓</button><button type="button" aria-label={`Remove section ${section.title}`} disabled={sections.length <= 1} onClick={() => removeSection(section.id)}>×</button></div></div>
                <textarea aria-label={`Notes for ${section.title}`} rows="2" value={section.notes} onChange={(event) => updateSection(section.id, { notes: event.target.value })} placeholder="Optional introduction or context" />
                {selectedFindings.filter((finding) => (findingSections[finding.id] || sections[0]?.id) === section.id).map((finding) => <label className="organization-finding-move" key={finding.id}><span>{finding.text.slice(0, 95)}{finding.text.length > 95 ? '…' : ''}</span><select aria-label={`Move finding from ${section.title}`} value={findingSections[finding.id] || sections[0]?.id || ''} onChange={(event) => setFindingSections((current) => ({ ...current, [finding.id]: event.target.value }))}>{sections.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}</select></label>)}
              </article>)}</div>
              <form className="organization-add-section" onSubmit={(event) => { event.preventDefault(); if (!newSectionTitle.trim()) return; setSections((current) => [...current, { id: newId('section'), title: newSectionTitle.trim(), notes: '' }]); setNewSectionTitle(''); }}><input aria-label="New section name" value={newSectionTitle} onChange={(event) => setNewSectionTitle(event.target.value)} placeholder="New section heading" /><button type="submit" className="btn btn-ghost">Add section</button></form>
              <div className="organization-actions"><button type="button" className="btn btn-primary" onClick={saveFile}>Save file</button><button type="button" className="btn btn-secondary" onClick={() => exportFile(false)}>Export HTML</button><button type="button" className="btn btn-secondary" onClick={() => exportFile(true)}>Print / Save as PDF</button></div>
              {activeFileId && files.some((file) => file.id === activeFileId) && <button type="button" className="btn btn-secondary" onClick={() => { const savedFile = saveFile(); if (savedFile) setPublishFile(savedFile); }}>Save &amp; publish / manage Community listing</button>}
              <p className="organization-muted">DOCX, XLSX, and PPTX export require document-generation services that are not installed. This builder exports a linked HTML file or a print-ready view.</p>
              {fileError && <p className="organization-callout" role="alert">{fileError}</p>}{fileNotice && <p className="organization-success" role="status">{fileNotice}</p>}
              <details className="organization-preview"><summary>Preview selected content ({selectedFindings.length} excerpts, {selectedSources.length} sources)</summary><div><h3>{titleDraft || 'Untitled research file'}</h3><p>{topicDraft}</p>{sections.map((section) => <section key={section.id}><h4>{section.title}</h4>{section.notes && <p>{section.notes}</p>}{selectedFindings.filter((finding) => (findingSections[finding.id] || sections[0]?.id) === section.id).map((finding) => <blockquote key={finding.id}>{finding.text}<cite>{finding.sourceTitle}</cite></blockquote>)}</section>)}<h4>Sources</h4><ol>{availableSources.filter((source) => selectedSourceIds.includes(source.id) || selectedFindings.some((finding) => finding.sourceId === source.id)).map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ol></div></details>
            </section>
          </div>
        </div>
      )}

      {page === 'saved-files' && (
        <section className="organization-panel">
          <div className="organization-panel-heading"><div><h2>Research file library</h2><p>Saved reports are private to this browser.</p></div><button type="button" className="btn btn-primary" onClick={() => { beginNewFile(); onNavigateResearch('file-builder'); }}>New file</button></div>
          <label className="organization-field"><span>Search saved files</span><input value={fileSearch} onChange={(event) => setFileSearch(event.target.value)} placeholder="Title or topic" /></label>
          {visibleFiles.length ? <ul className="organization-file-list">{visibleFiles.map((file) => <li key={file.id}><div><strong>{file.title}</strong><span>{file.topic || 'Topic not specified'} · {file.sources.length} sources · Updated {new Date(file.updatedAt).toLocaleString()}</span><small>{file.projectId ? projects.find((project) => project.id === file.projectId)?.name || 'Project unavailable' : 'No associated project'} · HTML / print-ready · {(file.revisions ?? []).length} saved revision{(file.revisions ?? []).length === 1 ? '' : 's'}</small>{(file.revisions ?? []).length > 0 && <details><summary>Compare saved versions</summary>{file.revisions.map((revision, index) => <p key={`${file.id}-revision-${index}`}>Previous version {index + 1}: {revision.title} · Saved {new Date(revision.savedAt).toLocaleString()} · {revision.findings.length} excerpts · {revision.sources.length} sources</p>)}</details>}</div><div className="organization-actions"><button type="button" className="btn btn-ghost" onClick={() => setPublishFile(file)}>Publish / manage</button><button type="button" className="btn btn-ghost" onClick={() => { openFile(file); onNavigateResearch('file-builder'); }}>Open / edit</button><button type="button" className="btn btn-ghost" onClick={() => { const copy = { ...file, id: newId('file'), title: `${file.title} (copy)`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revisions: [] }; persistFiles([copy, ...files]); }}>Duplicate</button><button type="button" className="btn btn-ghost" onClick={() => { if (window.confirm(`Delete “${file.title}”? This cannot be undone.`)) persistFiles(removeResearchFile(files, file.id)); }}>Delete</button></div></li>)}</ul> : <p className="organization-empty">No saved research files yet. Create a file from the current search or a saved project.</p>}
        </section>
      )}

      {page === 'team-workspace' && (
        <section className="organization-panel">
          <div className="organization-panel-heading"><div><h2>Team workspace</h2><p>Collaboration integration status</p></div></div>
          <p className="organization-callout">Community Hub publishing uses Neon when configured. Projects and reports in this workspace remain in this browser and are not shared; team roles, shared comments, and project synchronization are not enabled.</p>
          <p>Member lists, shared comments, project roles, activity synchronization, and privacy controls will need an authenticated server-side workspace before they can be safely enabled.</p>
          <button type="button" className="btn btn-secondary" onClick={() => setTeamNotice('No team service is configured. Your local project data has not been shared.')}>Check connection</button>
          {teamNotice && <p className="organization-muted" role="status">{teamNotice}</p>}
        </section>
      )}
      {publishFile && <CommunityPublishDialog file={publishFile} onClose={() => setPublishFile(null)} onSaved={() => {}} />}
    </div>
  );
}
