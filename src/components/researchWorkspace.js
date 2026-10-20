export const RESEARCH_FILES_KEY = 'osint-mapping-tool.research-files.v1';

function isValidHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isValidSource(source) {
  return Boolean(
    source &&
    typeof source.id === 'string' &&
    typeof source.title === 'string' &&
    typeof source.url === 'string' &&
    isValidHttpUrl(source.url),
  );
}

function isValidSection(section) {
  return Boolean(
    section &&
    typeof section.id === 'string' &&
    typeof section.title === 'string' &&
    typeof section.notes === 'string',
  );
}

function isValidFinding(finding) {
  return Boolean(
    finding &&
    typeof finding.id === 'string' &&
    typeof finding.text === 'string' &&
    typeof finding.sourceId === 'string'
  );
}

function isValidFile(file) {
  return Boolean(
    file &&
    typeof file.id === 'string' &&
    typeof file.title === 'string' &&
    typeof file.topic === 'string' &&
    typeof file.createdAt === 'string' &&
    Number.isFinite(Date.parse(file.createdAt)) &&
    typeof file.updatedAt === 'string' &&
    Number.isFinite(Date.parse(file.updatedAt)) &&
    (file.projectId === null || typeof file.projectId === 'string') &&
    Array.isArray(file.sections) &&
    file.sections.every(isValidSection) &&
    Array.isArray(file.findings) &&
    file.findings.every(isValidFinding) &&
    Array.isArray(file.sources) &&
    file.sources.every(isValidSource) &&
    Array.isArray(file.revisions ?? []),
  );
}

export function parseResearchFiles(serialized) {
  if (!serialized) return [];
  let files;
  try {
    files = JSON.parse(serialized);
  } catch {
    throw new Error('Saved research files contain invalid JSON.');
  }
  if (!Array.isArray(files) || files.some((file) => !isValidFile(file))) {
    throw new Error('Saved research files have an unsupported format.');
  }
  return files;
}

export function saveResearchFile(files, draft, savedAt = new Date().toISOString()) {
  if (!draft || typeof draft.id !== 'string' || !draft.id || typeof draft.title !== 'string' || !draft.title.trim()) {
    throw new Error('Enter a title for this research file.');
  }
  const nextFile = {
    ...draft,
    title: draft.title.trim(),
    createdAt: draft.createdAt || savedAt,
    updatedAt: savedAt,
    revisions: Array.isArray(draft.revisions) ? draft.revisions : [],
  };
  if (!isValidFile(nextFile)) {
    throw new Error('Research file details are incomplete or unsupported.');
  }

  const existing = files.find((file) => file.id === nextFile.id);
  if (!existing) return [nextFile, ...files];
  const priorRevision = {
    savedAt: existing.updatedAt,
    title: existing.title,
    topic: existing.topic,
    projectId: existing.projectId,
    sections: existing.sections,
    findings: existing.findings,
    sources: existing.sources,
  };
  const revisions = JSON.stringify(priorRevision) === JSON.stringify({
    savedAt: existing.updatedAt,
    title: nextFile.title,
    topic: nextFile.topic,
    projectId: nextFile.projectId,
    sections: nextFile.sections,
    findings: nextFile.findings,
    sources: nextFile.sources,
  })
    ? existing.revisions ?? []
    : [priorRevision, ...(existing.revisions ?? [])].slice(0, 20);

  return files.map((file) => file.id === nextFile.id
    ? { ...nextFile, createdAt: existing.createdAt, revisions }
    : file);
}

export function removeResearchFile(files, fileId) {
  return files.filter((file) => file.id !== fileId);
}
