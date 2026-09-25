import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL;
const key = __ENV.LOAD_TEST_KEY;
const testFile = __ENV.TEST_FILE;

if (!baseUrl || !key || !testFile) {
  throw new Error('Set BASE_URL, LOAD_TEST_KEY, and TEST_FILE.');
}

const ppt = open(testFile, 'b');

export const options = {
  vus: Number(__ENV.VUS || 1),
  duration: __ENV.DURATION || '1m',
};

export default function () {
  const response = http.post(
    `${baseUrl}/api/upload`,
    {
      roll: '257R1A66C9',
      category: 'Lab',
      subject: 'Node-JS',
      file: http.file(ppt, 'load-test.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
    },
    {
      headers: { 'x-load-test-key': key },
      tags: { endpoint: 'upload' },
      timeout: '120s',
    },
  );

  check(response, {
    'upload returned success': (r) => r.status === 200 && r.json('ok') === true,
    'load test mode confirmed': (r) => r.status === 200 && r.json('loadTest') === true,
  });

  sleep(1);
}
