import test from 'node:test';
import assert from 'node:assert/strict';
import { FixtureNavigation } from '../ci/fixture-navigation.mjs';

test('stale fixture pages cannot consume the next page navigation', () => {
  const navigation = new FixtureNavigation();
  navigation.issue('/science-lab', '/pet');
  assert.equal(navigation.read('/'), null);
  assert.equal(navigation.read('/homework'), null);
  assert.equal(navigation.read('/science-lab'), '/pet');
  // An interrupted response can be retried without losing the command.
  assert.equal(navigation.read('/science-lab'), '/pet');
  navigation.acknowledge('/science-lab');
  assert.equal(navigation.read('/science-lab'), '/pet');
  navigation.acknowledge('/pet');
  assert.equal(navigation.read('/science-lab'), null);
  navigation.issue('/pet', '/pet?battle=1');
  navigation.acknowledge('/pet');
  assert.equal(navigation.read('/science-lab'), null);
  assert.equal(navigation.read('/pet'), '/pet?battle=1');
});

test('export dismissal runs once and device boundaries clear pending navigation', () => {
  const navigation = new FixtureNavigation();
  navigation.issue('/export-probe', { dismissExport: true });
  assert.equal(navigation.read('/?return=1'), null);
  assert.deepEqual(navigation.read('/export-probe'), { dismissExport: true });
  assert.equal(navigation.read('/export-probe'), null);
  navigation.issue('/pet', '/game/'); navigation.clear();
  assert.equal(navigation.read('/pet'), null);
});
