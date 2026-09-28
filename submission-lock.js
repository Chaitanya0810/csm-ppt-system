// Reserve before checking Drive so concurrent retries cannot both upload.
async function reserveSubmission(db, ref, token) {
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref), now = Date.now(), old = snap.data() || {};
    if (snap.exists && old.status === 'uploading' && Number(old.leaseUntilMs || 0) > now) return false;
    tx.set(ref, { status: 'uploading', token, driveFileId: old.driveFileId || null, leaseUntilMs: now + 30 * 60 * 1000, updatedAt: new Date(now) });
    return { driveFileId: old.driveFileId };
  });
}

async function submissionFileExists(drive, fileId) {
  if (!fileId) return false; // Older locks are checked by the folder lookup.
  try {
    const result = await drive.files.get({ fileId, fields: 'id,trashed', supportsAllDrives: true });
    return result.data.trashed !== true;
  } catch (error) {
    if (Number(error.response?.status || error.code) === 404) return false;
    throw error; // Permission, quota and network failures must not permit duplicates.
  }
}

module.exports = { reserveSubmission, submissionFileExists };
