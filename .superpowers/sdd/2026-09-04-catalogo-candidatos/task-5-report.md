# Task 5 report — candidate read models, URL contract and database filters

## Status

Implemented only Task 5 on `codex/candidate-catalog`, starting from `0c85ac5`.
The implementation commit is `e71b67b` (`feat: query and filter election candidates`).

## RED / GREEN record

### Cycle 1 — URL and JSON wire contract

- RED: `npm test -- tests/server/candidates/search-params.test.ts tests/server/candidates/filter-contract.test.ts`
  failed because `#/server/candidates/search-params` and `#/server/candidates/filter-contract`
  did not exist.
- GREEN: the same command passed 2 files and 17 tests after the initial read-model,
  URL and strict wire implementation.
- Additional RED: canonical URL output still emitted duplicate typed values and
  `toCandidateFilterInput` silently omitted a negative/out-of-range bigint.
- Additional GREEN: the same focused command passed 2 files and 19 tests after
  canonical deduplication and explicit range rejection.

### Cycle 2 — database queries and count route

- RED: `npm test -- tests/server/candidates/queries.test.ts` failed because
  `#/server/candidates/queries` and `/api/candidates/filter-count` did not exist.
- First GREEN attempt exposed a real PostgreSQL alias error in the topic filter;
  the failing query used the base `bill_topics` name after aliasing it.
- GREEN: after correcting the alias-safe predicate, the integration suite passed
  1 file and 35 tests.
- Additional RED: `followedOnly` without a scoped user resolved to an empty list,
  but the query boundary must require authentication.
- Additional GREEN: a stable `CandidateAuthRequiredError` with code
  `AUTH_REQUIRED` is now raised before SQL construction; the authenticated path
  remains scoped to the supplied user ID.
- Additional RED/GREEN: filter options initially lacked latest-snapshot source
  metadata needed by the catalog empty/source state; `snapshots` now reports the
  latest successful run per election year.

## Files

- `src/server/candidates/read-models.ts`
- `src/server/candidates/search-params.ts`
- `src/server/candidates/filter-contract.ts`
- `src/server/candidates/queries.ts`
- `app/api/candidates/filter-count/route.ts`
- `tests/server/candidates/search-params.test.ts`
- `tests/server/candidates/filter-contract.test.ts`
- `tests/server/candidates/queries.test.ts`

## Decisions and invariants

- Current catalog scope is a correlated latest-successful-run predicate per
  election year. Cards, totals, detail, facets and legislative options all use it.
- URL filters use repeated canonical parameters, preserve false availability
  filters as `0`, cap text at 200 characters and repeated values at 20, and encode
  money as decimal reais before converting immediately to exact centavos.
- Wire money is restricted to non-negative decimal reais with at most two decimal
  places and the PostgreSQL signed-bigint ceiling. Domain money never crosses JSON.
- A declared zero-valued asset remains a declaration (`assetTotalCents: "0"`),
  while no asset rows produce `null`. A campaign-total row containing zero remains
  distinct from an absent campaign-total row.
- Every public parliamentary filter and aggregate traverses a `confirmed` link.
  Project and vote totals are correlated `count(distinct ...)` expressions, so
  assets, topics and links cannot multiply list rows or counts.
- `activeMandate=false` means a confirmed linked lawmaker with an inactive mandate;
  it does not classify a candidacy without a confirmed link as prior experience.
- Funding-kind filtering uses the normalized Task 4 revenue labels and treats a
  selected kind as predominant when it is positive and no stored revenue category
  is larger; ties can match more than one selected kind without ranking candidates.
- The count endpoint reuses the existing same-origin/session patterns, enforces the
  65,536-byte cap, accepts only strict `{ filters }`, and returns 401 only for an
  anonymous `followedOnly` preview.
- Ordering always has `externalId` as a stable final tie breaker.
- No CPF, title, personal email, address, internal process identifier, LLM output,
  score, ideology or vote recommendation is queried or exposed.

## Verification evidence

Environment for database commands:

```text
PATH=/Users/italojose/.local/share/fnm/node-versions/v26.8.1/installation/bin:$PATH
TEST_DATABASE_URL=postgres://italojose@127.0.0.1:5435/legislativo_codex_test
```

- `npm test -- tests/server/candidates` — 3 files, 54 tests, all passed.
- `npm test -- tests/server/candidates/queries.test.ts` — 1 file, 35 tests,
  all passed on two consecutive full integration runs.
- `npm run typecheck` — passed with zero TypeScript errors.
- `npm test` — 42 files, 397 tests, all passed.
- `git diff --check` and `git diff --cached --check` — no whitespace errors.
- Relevant Next.js 16 route-handler guides were read before final verification.

## Residual risks / handoff

- The funding predominance predicate intentionally depends on Task 4's four
  normalized revenue categories containing exact integer-cent strings. If that
  normalization vocabulary changes, the filter label map must change with it.
- Task 8 is expected to extend `PublicCandidateDetail` with independently paginated
  project and vote records; this task intentionally exposes only the exact summary
  aggregates and confirmed-lawmakers/topics foundation.
- No Task 6 or later UI/routing behavior was implemented here.
