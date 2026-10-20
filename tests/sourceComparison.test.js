import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPARISON_FIELDS,
  comparabilityDifferences,
  NOT_REPORTED,
  valueForComparison,
} from '../src/components/sourceComparison.js';

test('comparison extracts only relevant, explicit source-text passages', () => {
  const source = {
    abstract: 'We surveyed 120 students in Kenya between 2019 and 2021. The findings suggest access improved.',
  };

  assert.match(valueForComparison(source, { key: 'population' }), /120 students/);
  assert.match(valueForComparison(source, { key: 'location' }), /in Kenya/);
  assert.match(valueForComparison(source, { key: 'timePeriod' }), /between 2019 and 2021/);
  assert.equal(valueForComparison(source, { key: 'limitations' }), NOT_REPORTED);
});

test('comparison does not treat shared topic text as agreement or disagreement', () => {
  const source = { description: 'Both records discuss education funding.' };

  assert.equal(valueForComparison(source, COMPARISON_FIELDS.find(({ key }) => key === 'agreementCues')), NOT_REPORTED);
  assert.equal(valueForComparison(source, COMPARISON_FIELDS.find(({ key }) => key === 'disagreementCues')), NOT_REPORTED);
});

test('comparability warnings flag differing reported study details, not missing values', () => {
  const sources = [
    { abstract: 'We surveyed 120 students in Kenya.' },
    { abstract: 'We interviewed 45 teachers in Ghana.' },
    { abstract: 'A report about education.' },
  ];

  assert.deepEqual(comparabilityDifferences(sources), ['Population', 'Location']);
});

test('publication date is kept distinct from study time period', () => {
  assert.equal(
    valueForComparison({ date: '2023' }, { key: 'publicationDate' }),
    '2023 (publication date; not the study period)',
  );
});
