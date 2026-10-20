import test from 'node:test';
import assert from 'node:assert/strict';
import { getTimeGreeting } from '../src/components/landingGreeting.js';

test('time-based landing greeting uses local time-of-day', () => {
  assert.equal(getTimeGreeting(new Date(2026, 0, 1, 4)), 'Good Evening');
  assert.equal(getTimeGreeting(new Date(2026, 0, 1, 5)), 'Good Morning');
  assert.equal(getTimeGreeting(new Date(2026, 0, 1, 11)), 'Good Morning');
  assert.equal(getTimeGreeting(new Date(2026, 0, 1, 12)), 'Good Afternoon');
  assert.equal(getTimeGreeting(new Date(2026, 0, 1, 16)), 'Good Afternoon');
  assert.equal(getTimeGreeting(new Date(2026, 0, 1, 17)), 'Good Evening');
});
