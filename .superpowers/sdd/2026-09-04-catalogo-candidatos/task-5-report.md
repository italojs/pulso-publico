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

## Independent review — fix round 1/5

Review base: `0c85ac5`; original implementation/report: `e71b67b..a76fa1a`;
fix commit: `db5f740` (`fix: harden candidate filter consistency`).

The review raised three Important and two Minor findings. All five received a
focused failing regression before implementation:

1. **Followed-only canonical semantics.** RED showed `acompanhando=0` becoming
   `followedOnly: false`, false being serialized on URL/wire and counted as an
   active filter. It is now true-or-absent in parser, builder and strict schema;
   false availability booleans retain their real filtering meaning. Direct query
   coverage confirms a programmatic false remains a public unfiltered request.
2. **Builder bounds and range parity.** Seventeen RED cases showed the builder
   emitting invalid ages, asset counts, bigint amounts, pages and reversed ranges.
   A shared `filter-validation.ts` now owns scalar ceilings, exact reais/centavos
   conversion and paired-range checks used by URL and wire paths. Invalid
   programmatic filters raise `RangeError`; all maximum/minimum boundaries
   round-trip without mutation.
3. **Literal search.** RED showed `%` and `_` matching every candidate and a
   backslash failing to find its literal occurrence. Search now escapes `\\`, `%`
   and `_` and supplies a parameterized explicit SQL `ESCAPE` character. Normal
   case-insensitive text remains covered.
4. **Funding option/filter parity.** RED showed `private` offered merely because
   it had a positive component even though `public` predominated and the private
   filter returned zero candidates. Option discovery now calls the same
   `countCandidates(...fundingKinds)` predicate used by catalog filtering, and
   every offered option is asserted to produce a current-snapshot result.
5. **Total multi-election ordering.** Eight RED cases showed equal primary sort
   keys paging 2027 before 2026 based on external ID. Every ordering now appends
   `electionYear`, `externalId` and candidate UUID as deterministic tie breakers;
   the regression paginates equal-key candidates across 2026/2027 for all eight
   order modes.

Fresh fix-round verification under Node 26.8.1 and the documented test database:

- `npm test -- tests/server/candidates` — 3 files, 86 tests passed.
- `npm test -- tests/server/candidates/queries.test.ts` — 47 tests passed twice
  consecutively.
- `npm run typecheck` — zero errors.
- `npm test` — 42 files, 429 tests passed.
- `git diff --check` — clean before the implementation commit.

No Task 6 code was started during this fix round.

## Independent review — fix round 2/5

Review range before this round: `0c85ac5..3c5acf1`; fix commit: `778f0f4`
(`fix: canonicalize all candidate filters`).

One Important finding remained: the programmatic URL builder enforced scalar
ranges but did not validate the rest of `CandidateFilters`. As a result, invalid
years, rounds, enum members, free text and runtime boolean values could be emitted
and then silently discarded or changed by the hostile-URL parser.

RED was recorded with 16 failing cases:

- election years `2025` and `2026.5`;
- rounds `0` and `1.5`;
- region `ZZ`, office `prefeito`, funding kind `unknown`, house `congresso`,
  declared-assets `maybe` and order `best`;
- overlong query/status, empty party, 21 unique topics and a non-boolean photo
  value;
- a valid 21-element party list containing one duplicate also exposed drift:
  URL canonicalization accepted its 20 unique values while wire serialization
  rejected the raw array length.

GREEN introduced one shared, complete `canonicalizeCandidateFilters` function in
`filter-validation.ts`, used by both `buildCandidateHref` and
`toCandidateFilterInput`. It:

- validates every declared key and rejects unknown runtime keys;
- validates all repeated enum, numeric and free-text arrays;
- trims and deduplicates valid text/array values before applying the 20-unique
  value cap;
- rejects empty arrays, overlong text, unsupported enum members and wrong runtime
  primitive types;
- retains false for all availability/mandate booleans while canonicalizing
  `followedOnly: false` to absence;
- reuses the existing shared bounds/range/money checks;
- preserves the public URL parser's non-throwing behavior for hostile input.

Verification for this round under Node 26.8.1:

- `npm test -- tests/server/candidates/search-params.test.ts tests/server/candidates/filter-contract.test.ts`
  — 55 tests passed.
- `npm test -- tests/server/candidates` — 3 files, 102 tests passed.
- Query code did not change in this round, so the conditional duplicate
  integration run was not required; it ran once as part of the focused suite.
- `npm run typecheck` — zero errors.
- `npm test` — 42 files, 445 tests passed.
- `git diff --check` and staged diff check — clean.

No `abrangencia=brasil` behavior and no Task 6 code was implemented.
