import { buildResearchSearchQuery } from './researchQuery.js';

const CURRENT_AFFAIRS_TERMS = /\b(update|updates|updated|latest|current|currently|ongoing|upcoming|recent|today|tonight|now|breaking|news|situation|developments|what(?:'s| is) happening)\b/i;
const ELECTION_TERMS = /\b(election|electoral|vote|voting|polls?|presidential|governor(?:ship)?|senatorial|campaign)\b/i;
const CURRENT_INTENT_WORDS = /\b(?:latest\s+)?updates?\b|\bupdated\b|\bcurrent(?:ly)?\b|\bongoing\b|\bupcoming\b|\brecent\b|\btoday\b|\btonight\b|\bnow\b|\bbreaking\b|\bnews\b|\bsituation\b|\bdevelopments\b|\bwhat(?:'s| is) happening\b/gi;

export function isCurrentAffairsSearch(question, {
  year = null,
  month = '',
  fromYear = null,
  toYear = null,
  now = new Date(),
} = {}) {
  if (year || month || fromYear || toYear) return false;
  const mentionedYear = String(question).match(/\b(?:19|20)\d{2}\b/);
  if (mentionedYear && Number(mentionedYear[0]) <= now.getFullYear()) return false;
  return CURRENT_AFFAIRS_TERMS.test(question);
}

export function buildCurrentAffairsSearchQuery(question, region = '') {
  const topic = String(question ?? '')
    .replace(CURRENT_INTENT_WORDS, ' ')
    .replace(/\b(?:an?|the|on|about|for|of|in|to|give|me|please)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const base = buildResearchSearchQuery(topic || question, region);
  const context = ELECTION_TERMS.test(question)
    ? 'latest election news current developments upcoming election candidates campaign electoral commission results'
    : 'latest news current developments recent updates ongoing situation';
  return `${base} ${context}`.trim();
}

export function buildCurrentAffairsVideoQuery(question, region = '') {
  const topic = String(question ?? '')
    .replace(CURRENT_INTENT_WORDS, ' ')
    .replace(/\b(?:an?|the|on|about|for|of|in|to|give|me|please)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const base = buildResearchSearchQuery(topic || question, region);
  const timing = /\bupcoming\b/i.test(question) ? 'upcoming' : 'latest';
  return `${base} ${timing} news`.trim();
}

export function currentAffairsTimeRange(question) {
  return /\bupcoming\b/i.test(question) ? 'year' : 'month';
}
