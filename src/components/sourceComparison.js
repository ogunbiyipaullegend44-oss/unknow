const NOT_REPORTED = 'Not reported in retrieved record.';

export const COMPARISON_FIELDS = [
  { key: 'mainArgument', label: 'Main argument', pattern: /\b(argue|argues|argued|suggest|suggests|indicate|indicates|demonstrate|demonstrates|conclude|concludes)\b/i },
  { key: 'researchQuestion', label: 'Research question', pattern: /\b(aim|objective|research question|investigat(?:e|es|ed)|examin(?:e|es|ed)|explor(?:e|es|ed)|assess(?:es|ed)?|evaluat(?:e|es|ed))\b/i },
  { key: 'population', label: 'Population', pattern: /\b(participants?|respondents?|patients?|students?|teachers?|educators?|children|adults?|households?|workers?|employees?|residents?|women|men|sample of|population of)\b/i },
  { key: 'location', label: 'Location', pattern: /\b(conducted in|based in|located in|from [A-Z][\w-]+|in [A-Z][\w-]+(?:\s+[A-Z][\w-]+){0,2})/ },
  { key: 'timePeriod', label: 'Study time period', pattern: /\b(study period|data collected|between (?:19|20)\d{2}|from (?:19|20)\d{2} to (?:19|20)\d{2}|during (?:19|20)\d{2}|(?:19|20)\d{2}[-–](?:19|20)\d{2})\b/i },
  { key: 'methodology', label: 'Methodology', pattern: /\b(methodolog(?:y|ies)|randomi[sz]ed|cross-sectional|longitudinal|cohort|case[- ]control|qualitative|quantitative|mixed[- ]methods?|survey|interviews?|focus groups?|experiment(?:al)?|regression|systematic review|meta-analysis)\b/i },
  { key: 'sampleSize', label: 'Sample size', pattern: /\b(?:n\s*=\s*\d[\d,]*|\d[\d,]*\s+(?:participants?|respondents?|patients?|students?|households?|observations?|records?|cases?))\b/i },
  { key: 'dataSource', label: 'Data source', pattern: /\b(data (?:were|was) (?:collected|obtained|drawn)|data source|administrative records?|census|database|survey data|medical records?|interview data|dataset)\b/i },
  { key: 'findings', label: 'Findings', pattern: /\b(findings?|results? (?:show|suggest|indicate|demonstrate)|we found|was associated|were associated|observed that|evidence indicates)\b/i },
  { key: 'limitations', label: 'Limitations', pattern: /\b(limitations?|limited by|limitation of|caveat|caution)\b/i },
  { key: 'conclusions', label: 'Conclusions', pattern: /\b(conclude[sd]?|in conclusion|we conclude|these results suggest|the study suggests|implications?)\b/i },
  { key: 'supportingEvidence', label: 'Supporting evidence', pattern: /\b(evidence|confidence interval|odds ratio|p\s*[=<]\s*0?\.\d|statistically significant|data support)\b/i },
  { key: 'agreementCues', label: 'Agreement wording in retrieved text', pattern: /\b(consistent with|in agreement with|corroborat\w*|supports? (?:the|these|our) findings|similar findings)\b/i },
  { key: 'disagreementCues', label: 'Disagreement wording in retrieved text', pattern: /\b(in contrast|contradict\w*|differ(?:s|ent)? from|whereas|unlike|conflict\w* with|however)\b/i },
];

function sentencesFor(item) {
  return String(item.abstract || item.description || '')
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function valueForComparison(item, field) {
  if (field.key === 'title') return item.title || NOT_REPORTED;
  if (field.key === 'category') return item.category || NOT_REPORTED;
  if (field.key === 'author') return item.author || NOT_REPORTED;
  if (field.key === 'publisher') return item.publisher || NOT_REPORTED;
  if (field.key === 'publicationDate') return item.date ? `${item.date} (publication date; not the study period)` : NOT_REPORTED;
  if (field.key === 'provider') return item.provider || NOT_REPORTED;
  if (field.key === 'originalSource') return item.url || NOT_REPORTED;

  const pattern = COMPARISON_FIELDS.find((candidate) => candidate.key === field.key)?.pattern;
  if (!pattern) return NOT_REPORTED;
  return sentencesFor(item).find((sentence) => pattern.test(sentence)) || NOT_REPORTED;
}

export function comparabilityDifferences(items) {
  return COMPARISON_FIELDS
    .filter((field) => ['population', 'location', 'timePeriod', 'methodology', 'sampleSize'].includes(field.key))
    .filter((field) => {
      const reportedValues = items
        .map((item) => valueForComparison(item, field))
        .filter((value) => value !== NOT_REPORTED)
        .map((value) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim());
      return reportedValues.length > 1 && new Set(reportedValues).size > 1;
    })
    .map((field) => field.label);
}

export { NOT_REPORTED };
