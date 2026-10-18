# Quiz feedback recovery — 18 October 2026

The reported native alert, “signal is aborted without reason”, came from the
feedback timeout/retry implementation. It cancelled an HTTP attempt after 2.5
seconds and discarded socket acknowledgements after 1.2 seconds. A valid slow
reply could therefore be lost on both paths. The catch handler then passed the
browser's raw cancellation message to `alert()`.

Feedback now accepts the first valid server response across both transports.
If the socket is slow, HTTP starts after 0.9 seconds without discarding its
acknowledgement. A single HTTP backup may start after 2.5 seconds or a transport
failure, while the original HTTP request remains eligible. The whole operation
has a 15-second deadline and at most two HTTP reads. Remaining requests are
cancelled after a result, a terminal server rejection, navigation, or expiry.
Sockets that finish connecting during the wait can also return the result.

No mark is shown until the server confirms it. Grading and final submission are
unchanged on the server; final marks are still written by the existing
idempotent submission. Network failure shows a localized inline retry message
and retains the question, answer and previous thinking time. It does not open a
native alert, automatically reload, clear the input, or count the network wait
as thinking time. Authentication/quiz validation errors retain actionable
messages. Page navigation cancels pending work and releases the loading state.

Validation:

- `npm run check:quiz-navigation`: 13 browser check groups, including a valid
  3.5-second HTTP response with a held backup, a delayed valid socket response
  while HTTP is held, both paths unavailable, no native dialogs, loading cleanup,
  preserved thinking time, explicit retry, account isolation, exact grading and
  final persistence once. These are isolated fixtures, not production timings.
- JavaScript syntax checks, the static application check, and `git diff --check`.
- The retained-answer/retry screen was visually inspected. Evidence is under
  `tmp/quiz-navigation-qa/`.

This supersedes the short acknowledgement/attempt deadlines described in
`quiz-navigation-performance-20261018.md`. It addresses premature cancellation
and recovery; it does not establish the cause of each underlying network delay.
