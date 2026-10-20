export function parseSavedProjects(serialized) {
  if (!serialized) return [];

  let projects;
  try {
    projects = JSON.parse(serialized);
  } catch {
    throw new Error('Saved projects contain invalid JSON.');
  }
  const isHttpUrl = (value) => {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  };

  if (!Array.isArray(projects) || projects.some((project) =>
    !project ||
    typeof project.id !== 'string' ||
    !project.id ||
    typeof project.name !== 'string' ||
    !project.name.trim() ||
    typeof project.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(project.createdAt)) ||
    typeof project.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(project.updatedAt)) ||
    !Array.isArray(project.sources) ||
    (project.description !== undefined && typeof project.description !== 'string') ||
    (project.objectives !== undefined && typeof project.objectives !== 'string') ||
    (project.geography !== undefined && typeof project.geography !== 'string') ||
    (project.owner !== undefined && typeof project.owner !== 'string') ||
    (project.archived !== undefined && typeof project.archived !== 'boolean') ||
    ['keywords', 'categories'].some((field) =>
      project[field] !== undefined &&
      (!Array.isArray(project[field]) || project[field].some((value) => typeof value !== 'string')),
    ) ||
    project.sources.some((source) =>
      !source ||
      typeof source.id !== 'string' ||
      typeof source.title !== 'string' ||
      typeof source.url !== 'string' ||
      !isHttpUrl(source.url),
    )
  )) {
    throw new Error('Saved projects have an unsupported format.');
  }
  return projects;
}

export function createSavedProject(projects, name, id, createdAt = new Date().toISOString()) {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Enter a name for this project.');
  if (!id || projects.some((project) => project.id === id)) {
    throw new Error('A unique project identifier is required.');
  }

  return [
    {
      id,
      name: trimmedName,
      createdAt,
      updatedAt: createdAt,
      sources: [],
      description: '',
      objectives: '',
      keywords: [],
      geography: '',
      categories: [],
      owner: '',
      archived: false,
    },
    ...projects,
  ];
}

export function updateSavedProject(projects, projectId, changes, updatedAt = new Date().toISOString()) {
  const project = projects.find((entry) => entry.id === projectId);
  if (!project) throw new Error('Choose an existing project.');
  const allowedFields = ['name', 'description', 'objectives', 'keywords', 'geography', 'categories', 'owner', 'archived'];
  const patch = Object.fromEntries(
    Object.entries(changes).filter(([field]) => allowedFields.includes(field)),
  );

  if (patch.name !== undefined && (typeof patch.name !== 'string' || !patch.name.trim())) {
    throw new Error('Enter a project name.');
  }
  for (const field of ['description', 'objectives', 'geography', 'owner']) {
    if (patch[field] !== undefined && typeof patch[field] !== 'string') {
      throw new Error(`Project ${field} must be text.`);
    }
  }
  for (const field of ['keywords', 'categories']) {
    if (patch[field] !== undefined &&
      (!Array.isArray(patch[field]) || patch[field].some((value) => typeof value !== 'string'))) {
      throw new Error(`Project ${field} must be a list of text values.`);
    }
  }
  if (patch.archived !== undefined && typeof patch.archived !== 'boolean') {
    throw new Error('Project archive status must be true or false.');
  }

  return projects.map((entry) => entry.id !== projectId
    ? entry
    : {
      ...entry,
      ...patch,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      updatedAt,
    });
}

export function addSourceToProject(projects, projectId, source, savedAt = new Date().toISOString()) {
  const project = projects.find((entry) => entry.id === projectId);
  if (!project) throw new Error('Choose an existing project.');
  if (!source || typeof source.id !== 'string' || typeof source.title !== 'string' || typeof source.url !== 'string') {
    throw new Error('The source is missing required details.');
  }

  return projects.map((entry) => entry.id !== projectId
    ? entry
    : {
      ...entry,
      updatedAt: savedAt,
      sources: [
        { ...source, savedAt },
        ...entry.sources.filter((saved) => saved.id !== source.id),
      ],
    });
}

export function removeSavedProject(projects, projectId) {
  return projects.filter((project) => project.id !== projectId);
}

export function removeSourceFromProject(projects, projectId, sourceId) {
  return projects.map((project) => project.id !== projectId
    ? project
    : {
      ...project,
      updatedAt: new Date().toISOString(),
      sources: project.sources.filter((source) => source.id !== sourceId),
    });
}
