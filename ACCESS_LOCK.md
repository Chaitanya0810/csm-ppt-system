# Owner service lock

The account configured by `SUPER_ADMIN_EMAIL` can lock or unlock each CR from **App owner controls**. A lock applies to all classes managed by that CR.

The Firestore admin document records `serviceLocked`, `serviceAccessUpdatedAt`, and `serviceAccessUpdatedBy`. Unlocking preserves approval, sessions, tokens, class records, and files. Disabling or revoking an account remains separate. The owner cannot lock their own account.

Locked class APIs return HTTP 423 with `SERVICE_LOCKED`. The website and sign-in pages remain available. Student uploads, class configuration, submission listing, and CR admin operations are checked on the server. Multipart uploads check the class from the request body as well as the optional URL class.

Open student and dashboard pages check access every 15 seconds and on focus. The server blocks subsequent operations immediately; an operation already in progress may finish. Unlocking reloads locked student and dashboard pages after their next successful status check.

The lock does not change Google Drive permissions. Direct Drive URLs, external pages already opened, and downloaded copies remain outside the website's control.

This feature applies to the multi-admin application. Legacy single-admin and load-test modes do not provide owner/CR service locks.

Run `node --test service-access.test.js admin-gate.test.js` to verify authorization and route behavior with isolated storage/Drive fixtures.
