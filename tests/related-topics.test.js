import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/index.js';
import {
  generateAiRelatedTopics,
  validateAiRelatedTopicsRequest,
} from '../server/aiRelatedTopics.js';

const topics = [
  { title: 'Urban planning choices', question: 'How do zoning choices influence exposure to urban air pollution?' },
  { title: 'School exposure patterns', question: 'How does air pollution exposure differ for children attending urban schools?' },
  { title: 'Indoor air quality', question: 'How does outdoor pollution affect indoor air quality in dense neighborhoods?' },
  { title: 'Public transit emissions', question: 'What role do public transit systems play in neighborhood air pollution exposure?' },
];

test('related-topic request validates question and optional research context', () => {
  assert.equal(validateAiRelatedTopicsRequest({
    question: 'How does air pollution affect urban health?',
    region: 'Nairobi',
    areas: [{ title: 'Exposure', description: 'Population exposure patterns' }],
  }), null);
  assert.match(validateAiRelatedTopicsRequest({ question: 'short' }), /between 8 and 1,000/);
  assert.match(validateAiRelatedTopicsRequest({
    question: 'How does air pollution affect urban health?',
    areas: Array.from({ length: 9 }, (_, index) => ({ title: `Area ${index}` })),
  }), /research area/i);
});

test('AI generates question-specific related topics and preserves the returned topic groups', async () => {
  let providerRequest;
  const server = createServer({
    openaiApiKey: 'test-openai-key',
    fetchImpl: async (url, options) => {
      providerRequest = { url, body: JSON.parse(options.body) };
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ topics }) } }],
      });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research/related-topics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question: 'How does air pollution affect urban health?',
        region: 'Nairobi',
        areas: [{ title: 'Exposure', description: 'Population exposure patterns' }],
      }),
    });
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(providerRequest.url, 'https://api.openai.com/v1/chat/completions');
    assert.match(providerRequest.body.messages[0].content, /spontaneous/i);
    assert.match(providerRequest.body.messages[0].content, /Do not use a fixed template/i);
    assert.match(providerRequest.body.messages[1].content, /Nairobi/);
    assert.deepEqual(result.topics, topics);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('related-topic generation rejects duplicate or invalid model topics', async () => {
  await assert.rejects(
    generateAiRelatedTopics({
      question: 'How does air pollution affect urban health?',
      apiKey: 'test-openai-key',
      fetchImpl: async () => Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
            topics: [
              ...topics.slice(0, 3),
              { ...topics[0], question: 'How do urban zoning choices change neighborhood air quality?' },
            ],
          }),
          },
        }],
      }),
    }),
    /duplicate related topics/,
  );
});

test('related-topic endpoint reports when AI generation is not configured', async () => {
  const server = createServer({ openaiApiKey: '' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research/related-topics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'How does air pollution affect urban health?' }),
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /AI related topics are not configured/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
