const test = require('node:test');
const assert = require('node:assert/strict');
const { reserveSubmission, submissionFileExists } = require('./submission-lock');

function database(initial) {
  let record = initial;
  return {
    runTransaction: async fn => fn({
      get: async () => ({ exists: !!record, data: () => record }),
      set: (_ref, value) => { record = value; }
    })
  };
}
const driveWith = (value, error) => ({ files: { get: async () => {
  if (error) throw error;
  return { data: value };
} } });

test('completed submission is rechecked, with simultaneous retries blocked', async () => {
  const db = database({ status: 'complete', driveFileId: 'ppt' });
  assert.deepEqual(await reserveSubmission(db, 'ref', 'first'), { driveFileId: 'ppt' });
  assert.equal(await reserveSubmission(db, 'ref', 'second'), false);
  assert.equal(await submissionFileExists(driveWith({ id: 'ppt', trashed: false }), 'ppt'), true);
});

test('trash and permanent deletion allow a replacement; replacement blocks again', async () => {
  for (const drive of [driveWith({ trashed: true }), driveWith(null, { response: { status: 404 } })]) {
    const db = database({ status: 'complete', driveFileId: 'old' });
    const reservation = await reserveSubmission(db, 'ref', 'retry');
    assert.equal(await submissionFileExists(drive, reservation.driveFileId), false);
    await db.runTransaction(tx => tx.set('ref', { status: 'complete', driveFileId: 'replacement' }));
    const next = await reserveSubmission(db, 'ref', 'next');
    assert.equal(next.driveFileId, 'replacement');
    assert.equal(await submissionFileExists(driveWith({ trashed: false }), next.driveFileId), true);
  }
});

test('Drive errors fail closed', async () => {
  for (const status of [401, 403, 429, 500]) {
    const error = Object.assign(new Error('Drive unavailable'), { response: { status } });
    await assert.rejects(submissionFileExists(driveWith(null, error), 'ppt'), error);
  }
});

test('new, legacy and expired reservations can proceed to folder duplicate check', async () => {
  for (const record of [undefined, { status: 'complete' }, { status: 'uploading', leaseUntilMs: 1 }]) {
    assert.ok(await reserveSubmission(database(record), 'ref', 'retry'));
  }
  assert.equal(await submissionFileExists(null, undefined), false);
});
