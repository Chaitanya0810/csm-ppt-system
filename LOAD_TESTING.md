# Render capacity check

The load-test mode accepts the normal multipart upload, validates its fields,
writes the file to the same temporary upload directory, then deletes it. It
does not contact Google Drive. Enable it only on a temporary test deployment.

## Prepare a test deployment

1. Create a separate Render service from the same code, or temporarily use a
   maintenance window on the current service. Do not run load tests against
   the student-facing production service.
2. Set `LOAD_TEST_MODE=true` and `LOAD_TEST_KEY` to a long random secret in
   that service's environment. Setting the mode without the key makes startup
   fail. In this mode Google Drive initialization is skipped and uploads
   require the matching `x-load-test-key` header.
3. Deploy and confirm `/` loads. Never enable this mode on the live student
   service: it makes every accepted upload return a simulated success without
   saving it to Drive.
4. Install k6 on a machine other than the Render instance. Have a test `.ppt`
   or `.pptx` file ready. Use a small file first, then a representative file.

## Run progressively

PowerShell example (replace the URL, secret and file path):

```powershell
$env:BASE_URL = 'https://your-load-test-service.onrender.com'
$env:LOAD_TEST_KEY = 'the-same-long-random-secret'
$env:TEST_FILE = 'C:\path\to\sample.pptx'
k6 run --vus 1 --duration 1m load-test/upload.js
k6 run --vus 2 --duration 1m load-test/upload.js
k6 run --vus 3 --duration 1m load-test/upload.js
k6 run --vus 5 --duration 2m load-test/upload.js
```

Change `--vus` and `--duration` one run at a time. Let the service settle
between runs. Start with a small test file, then repeat the passing levels
with a typical presentation. Do not jump directly to a large crowd or use
100 MB files for the first run.

## Measure and decide

For each run, record k6's request rate, p95 response time, HTTP failures and
check failures. In Render, watch CPU, memory, request volume, response latency
(if available on your workspace), and logs. Also verify the upload temp files
are removed. Stop increasing load if errors appear, p95 latency rises sharply,
or CPU/memory stays near its limit. Repeat a passing level several times and
use the highest level that remains stable with headroom as your tested
capacity, rather than treating one successful run as a guarantee.

This mode isolates Render's multipart parsing, local disk writes and response
handling. It does not measure Google Drive API latency, Drive quotas, or the
full production upload path. To measure end-to-end Drive uploads, use a
separate test Drive folder and a separate endpoint/configuration that points
only to that folder; successful end-to-end tests create files there.

After testing, remove `LOAD_TEST_MODE` and `LOAD_TEST_KEY` from the test
service (or delete the service). Keep this mode disabled on production.
