import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasMoreResearchSources,
  mergeResearchSources,
} from '../src/components/researchSourcePagination.js';

test('unlimited source paging remains available while any catalog has a cursor', () => {
  assert.equal(hasMoreResearchSources({ openAlex: null, crossref: 'next', semanticScholar: null }), true);
  assert.equal(hasMoreResearchSources({ openAlex: null, crossref: null, semanticScholar: null }), false);
  assert.equal(hasMoreResearchSources(null), false);
});

test('merging source pages avoids duplicates by DOI or normalized title', () => {
  const existing = [
    { id: 'openalex:1', doi: '10.1234/Example', title: 'First title' },
    { id: 'crossref:2', title: 'A Shared Title!' },
  ];
  const incoming = [
    { id: 'semantic:1', doi: '10.1234/example', title: 'Duplicate DOI' },
    { id: 'openalex:2', title: 'a shared title' },
    { id: 'crossref:3', title: 'A new title' },
  ];

  assert.deepEqual(
    mergeResearchSources(existing, incoming).map((source) => source.id),
    ['openalex:1', 'crossref:2', 'crossref:3'],
  );
});
