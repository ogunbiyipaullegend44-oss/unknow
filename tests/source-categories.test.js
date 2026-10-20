import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryFor,
  sourceDateLabel,
  SOURCE_CATEGORIES,
} from '../src/components/sourceCategories.js';

test('source categories classify returned records without implying absent sources', () => {
  const cases = [
    [{ kind: 'web', title: 'Agency notice', url: 'https://agency.gov/notice', type: '', publisher: '' }, 'Government and Official Sources'],
    [{ kind: 'academic', title: 'Study results', url: 'https://doi.org/10.1234/test', type: 'journal-article' }, 'Academic Research'],
    [{ kind: 'web', title: 'Report', url: 'https://example.org/reports/annual', type: '', publisher: '' }, 'Reports and Statistical Data'],
    [{ kind: 'web', title: 'New policy', url: 'https://www.reuters.com/article', type: '', publisher: '' }, 'News and Journalism'],
    [{ kind: 'web', title: 'Background article', url: 'https://example.org/article', type: '', publisher: '' }, 'Websites and Articles'],
    [{ kind: 'video', title: 'Public lecture', url: 'https://www.youtube.com/watch?v=abcdefghijk', type: 'Video' }, 'Videos and YouTube'],
    [{ kind: 'academic', title: 'Handbook', url: 'https://doi.org/10.1234/book', type: 'book-chapter' }, 'Books and Other Publications'],
  ];

  for (const [source, expected] of cases) {
    assert.equal(categoryFor(source), expected);
    assert.ok(SOURCE_CATEGORIES.includes(expected));
  }
});

test('publication dates remain honest when only a year is available', () => {
  assert.equal(sourceDateLabel(2024), '2024');
  assert.equal(sourceDateLabel('2024'), '2024');
  assert.match(sourceDateLabel('2024-03'), /Mar 2024/);
  assert.equal(sourceDateLabel('not a date'), 'Not available');
  assert.equal(sourceDateLabel(null), 'Not available');
});
