const test = require('node:test');
const assert = require('node:assert/strict');
const { parseProjectTeam } = require('./project-team');
const roster = ['A', 'B', 'C', 'D'];
test('three and four member teams include the submitting student', () => {
  for (const size of [3, 4]) {
    const team = parseProjectTeam('Project', JSON.stringify({ size, members: roster.slice(1, size) }), 'A', roster);
    assert.deepEqual(team, { size, members: roster.slice(0, size) });
  }
});
test('rejects missing, duplicate, self, unknown and incorrectly sized teams', () => {
  for (const value of [undefined, 'bad JSON', 'null', {}, { size: 2, members: ['B'] }, { size: 3, members: ['A', 'B'] }, { size: 3, members: ['B', 'B'] }, { size: 3, members: ['B', 'X'] }, { size: 4, members: ['B', 'C'] }]) {
    assert.throws(() => parseProjectTeam('Project', typeof value === 'object' ? JSON.stringify(value) : value, 'A', roster), { statusCode: 400 });
  }
});
test('Lab and Theory uploads do not need team information', () => {
  for (const category of ['Lab', 'Theory']) assert.equal(parseProjectTeam(category, undefined, 'A', roster), null);
});
