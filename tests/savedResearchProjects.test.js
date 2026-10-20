import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addSourceToProject,
  createSavedProject,
  parseSavedProjects,
  removeSavedProject,
  updateSavedProject,
} from '../src/components/savedResearchProjects.js';

test('saved projects are named, independent collections of sources', () => {
  const first = createSavedProject([], 'Climate evidence', 'project-one', '2026-10-16T20:00:00.000Z');
  const withSecond = createSavedProject(first, 'Policy sources', 'project-two', '2026-10-16T20:01:00.000Z');
  const withFirstSource = addSourceToProject(
    withSecond,
    'project-one',
    { id: 'web:one', title: 'Source One', url: 'https://example.org/one', savedFor: 'Search question' },
    '2026-10-16T20:02:00.000Z',
  );
  const withSource = addSourceToProject(
    withFirstSource,
    'project-one',
    { id: 'academic:two', title: 'Source Two', url: 'https://example.org/two', savedFor: 'Different search question' },
    '2026-10-16T20:03:00.000Z',
  );

  assert.equal(withSource.length, 2);
  assert.deepEqual(
    withSource.find((project) => project.id === 'project-one').sources.map((source) => source.savedFor),
    ['Different search question', 'Search question'],
  );
  assert.equal(withSource.find((project) => project.id === 'project-two').sources.length, 0);
  assert.equal(withSecond[0].sources.length, 0);
});

test('projects do not have an application-imposed count limit', () => {
  const projects = Array.from({ length: 120 }, (_, index) =>
    createSavedProject([], `Project ${index}`, `project-${index}`, '2026-10-16T20:00:00.000Z')[0]);

  assert.equal(projects.length, 120);
});

test('saved project parsing validates project and source records', () => {
  const projects = createSavedProject([], 'Evidence', 'project-one', '2026-10-16T20:00:00.000Z');
  assert.deepEqual(parseSavedProjects(JSON.stringify(projects)), projects);
  assert.throws(() => parseSavedProjects('{bad json'), /invalid JSON/);
  assert.throws(() => parseSavedProjects('{}'), /unsupported format/);
  assert.throws(
    () => parseSavedProjects(JSON.stringify([{ ...projects[0], sources: [{ id: 'source', title: 'Missing URL', url: 'bad' }] }])),
    /unsupported format/,
  );
});

test('sources can be updated per project and projects can be removed', () => {
  const projects = createSavedProject([], 'Evidence', 'project-one', '2026-10-16T20:00:00.000Z');
  const withSource = addSourceToProject(
    projects,
    'project-one',
    { id: 'web:one', title: 'Source One', url: 'https://example.org/one' },
  );
  const updated = addSourceToProject(withSource, 'project-one', {
    id: 'web:one',
    title: 'Updated title',
    url: 'https://example.org/one',
  });

  assert.equal(updated[0].sources.length, 1);
  assert.equal(updated[0].sources[0].title, 'Updated title');
  assert.deepEqual(removeSavedProject(updated, 'project-one'), []);
  assert.throws(() => addSourceToProject(projects, 'missing', {}), /existing project/);
});

test('project metadata can be updated while preserving sources and timestamps', () => {
  const projects = createSavedProject([], 'Evidence', 'project-one', '2026-10-16T20:00:00.000Z');
  const withSource = addSourceToProject(projects, 'project-one', {
    id: 'web:one',
    title: 'Source One',
    url: 'https://example.org/one',
  }, '2026-10-16T20:01:00.000Z');
  const updated = updateSavedProject(withSource, 'project-one', {
    name: 'Updated evidence',
    description: 'A focused project.',
    keywords: ['policy', 'evidence'],
    archived: true,
  }, '2026-10-16T20:02:00.000Z');

  assert.equal(updated[0].name, 'Updated evidence');
  assert.equal(updated[0].description, 'A focused project.');
  assert.deepEqual(updated[0].keywords, ['policy', 'evidence']);
  assert.equal(updated[0].archived, true);
  assert.equal(updated[0].sources.length, 1);
  assert.equal(updated[0].updatedAt, '2026-10-16T20:02:00.000Z');
  assert.deepEqual(parseSavedProjects(JSON.stringify(updated)), updated);
  assert.throws(() => updateSavedProject(updated, 'project-one', { name: ' ' }), /project name/);
});
