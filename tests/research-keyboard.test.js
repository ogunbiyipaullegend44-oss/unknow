import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSubmitResearchOnEnter } from '../src/utils/researchKeyboard.js';

test('desktop Enter submits research unless newline or composition is intended', () => {
  assert.equal(shouldSubmitResearchOnEnter({ key: 'Enter', isDesktop: true }), true);
  assert.equal(shouldSubmitResearchOnEnter({ key: 'Enter', shiftKey: true, isDesktop: true }), false);
  assert.equal(shouldSubmitResearchOnEnter({ key: 'Enter', isComposing: true, isDesktop: true }), false);
  assert.equal(shouldSubmitResearchOnEnter({ key: 'a', isDesktop: true }), false);
});

test('mobile Enter keeps the textarea newline behavior', () => {
  assert.equal(shouldSubmitResearchOnEnter({ key: 'Enter', isDesktop: false }), false);
});
