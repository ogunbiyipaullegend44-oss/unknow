import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseResearchFiles,
  removeResearchFile,
  saveResearchFile,
} from '../src/components/researchWorkspace.js';

const firstFile = {
  id: 'file-one',
  title: 'Education policy briefing',
  topic: 'Education policy',
  projectId: null,
  sections: [{ id: 'section-one', title: 'Findings', notes: '' }],
  findings: [{
    id: 'finding-one',
    text: 'An exact excerpt from a source.',
    sourceId: 'source-one',
    sectionId: 'section-one',
  }],
  sources: [{
    id: 'source-one',
    title: 'Source One',
    url: 'https://example.org/source',
    publisher: 'Example',
    provider: 'Web',
    date: '2025',
  }],
  createdAt: '2026-10-16T20:00:00.000Z',
  updatedAt: '2026-10-16T20:00:00.000Z',
};

test('research files validate source links and retain their selected structure', () => {
  const files = saveResearchFile([], firstFile, '2026-10-16T20:01:00.000Z');

  assert.equal(files.length, 1);
  assert.equal(files[0].updatedAt, '2026-10-16T20:01:00.000Z');
  assert.deepEqual(parseResearchFiles(JSON.stringify(files)), files);
  assert.throws(() => parseResearchFiles('{invalid'), /invalid JSON/);
  assert.throws(
    () => saveResearchFile([], { ...firstFile, sources: [{ ...firstFile.sources[0], url: 'javascript:alert(1)' }] }),
    /incomplete or unsupported/,
  );
});

test('updating a research file preserves a prior revision and removal is scoped', () => {
  const files = saveResearchFile([], firstFile, '2026-10-16T20:01:00.000Z');
  const updated = saveResearchFile(files, {
    ...files[0],
    title: 'Updated education policy briefing',
    sections: [{ id: 'section-one', title: 'New findings', notes: 'Updated context.' }],
  }, '2026-10-16T20:02:00.000Z');

  assert.equal(updated[0].revisions.length, 1);
  assert.equal(updated[0].revisions[0].title, firstFile.title);
  assert.equal(updated[0].createdAt, firstFile.createdAt);
  assert.deepEqual(removeResearchFile(updated, 'file-one'), []);
});
