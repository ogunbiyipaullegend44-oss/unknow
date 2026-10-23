import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesResearchMonths } from '../src/components/researchMonthFilters.js';

test('research month filters match any selected month within the selected year', () => {
  const scope = {
    fromYear: 2025,
    toYear: 2025,
    months: ['February', 'October'],
  };

  assert.equal(matchesResearchMonths('2025-02-20T00:00:00Z', scope), true);
  assert.equal(matchesResearchMonths('2025-10-20T00:00:00Z', scope), true);
  assert.equal(matchesResearchMonths('2025-03-20T00:00:00Z', scope), false);
  assert.equal(matchesResearchMonths('2024-10-20T00:00:00Z', scope), false);
});

test('research month filters preserve unrestricted and legacy single-month scopes', () => {
  assert.equal(matchesResearchMonths('2025-06-20T00:00:00Z', {}), true);
  assert.equal(
    matchesResearchMonths('2025-06-20T00:00:00Z', {
      fromYear: 2025,
      toYear: 2025,
      month: 'June',
    }),
    true,
  );
  assert.equal(
    matchesResearchMonths('2025-07-20T00:00:00Z', {
      fromYear: 2025,
      toYear: 2025,
      month: 'June',
    }),
    false,
  );
});
