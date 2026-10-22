import test from 'node:test';
import assert from 'node:assert/strict';
import { getRelatedTopics } from '../src/components/relatedTopics.js';

test('related topics use the current research subject and include actionable questions and categories', () => {
  const topics = getRelatedTopics({
    question: 'How does access to quality education affect employment in Nigeria?',
    analysis: {
      mainSubject: 'access to quality education affect employment in Nigeria',
    },
    scope: { region: 'Nigeria' },
  });

  assert.ok(topics.length >= 8);
  assert.ok(topics.some((topic) => topic.id === 'education-funding'));
  assert.ok(topics.some((topic) => topic.id === 'education-employment'));
  for (const topic of topics) {
    assert.ok(topic.question.includes('Nigeria'));
    assert.ok(topic.why.length > 0);
    assert.ok(topic.relationship.length > 0);
    assert.ok(topic.evidence.length > 0);
    assert.ok(topic.categories.length > 0);
  }
});

test('related topics stay specific to a non-education research question', () => {
  const topics = getRelatedTopics({
    question: 'How does urban air pollution affect asthma rates in Nairobi?',
    analysis: { mainSubject: 'urban air pollution affect asthma rates in Nairobi' },
    scope: { region: 'Nairobi' },
  });

  assert.ok(topics.some((topic) => topic.id === 'health-risk'));
  assert.ok(topics.every((topic) => !topic.title.toLowerCase().includes('education')));
  assert.ok(topics.some((topic) => topic.question.includes('urban air pollution')));
});

test('related-topic source suggestions adapt to the question domain and topic angle', () => {
  const environment = getRelatedTopics({
    question: 'How does urban air pollution affect asthma rates?',
    analysis: { mainSubject: 'urban air pollution and asthma rates' },
  });
  const technology = getRelatedTopics({
    question: 'How does artificial intelligence affect hiring decisions?',
    analysis: { mainSubject: 'artificial intelligence and hiring decisions' },
  });

  assert.ok(environment.some((topic) => topic.categories.includes('Government and Official Sources')));
  assert.ok(technology.some((topic) => topic.categories.includes('News and Journalism')));
  assert.ok(environment.find((topic) => topic.id === 'experience').categories.includes('News and Journalism'));
  assert.ok(technology.find((topic) => topic.id === 'evidence-quality').categories.includes('Books and Other Publications'));
  assert.notDeepEqual(environment[0].categories, technology[0].categories);
});

test('related topics are empty when research context is unavailable', () => {
  assert.deepEqual(getRelatedTopics(null), []);
  assert.deepEqual(getRelatedTopics({ question: 'A research topic' }), []);
});
