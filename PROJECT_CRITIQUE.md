# Duodoro project critique

Assessment date: 2026-08-27  
Scope: repository documentation, client, realtime server, Supabase migrations,
tests, CI, and the tracked roadmap.

## Executive assessment

Duodoro has a real product idea, not merely a themed timer. The synchronized
walk-toward-each-other metaphor, rotating shared world, session presence, and
focus-grown pets reinforce the same emotional promise: being apart while doing
something together. The implementation has also become substantially more
careful than a typical project of this size. Server-authoritative timing,
reconnect handling, row-level security, visible data-load failures, and the
tests around deterministic visual systems are all strong work.

The main weakness is that engineering maturity is uneven. The project is very
careful about pixel geometry and several subtle database rules, while a few
more fundamental product and reliability boundaries remain open: arbitrary
Socket.IO payload shapes can reach destructured handlers, a nominally
two-person room can accept more than two players, session recording is a
two-write non-transactional best-effort operation, and several shipped flows
have never been exercised end to end in a real browser. The roadmap is also
effectively complete, but has accumulated verification notes instead of turning
them into a release gate.

My recommendation is to make the next milestone **release confidence and
activation**, not another art pass. First close the reliability and product-
truth gaps below. Then reduce the large amount of friction between “I found
Duodoro” and “I am focusing with another person.”

## What is strong

### Product strengths

- **A coherent emotional hook.** The characters physically converging during
  focus is memorable and specific to the collaborative promise. The art is not
  decorative skin pasted onto an ordinary timer.
- **A consistent progression loop.** Pet growth is earned from completed focus
  history and is visible to both participants. Deriving it from history avoids
  a second counter that can drift.
- **Solo use keeps the product from being unusable when a friend is absent.**
  This is important for a network-dependent product, even though the duo path
  still needs easier activation.
- **The rotating-world rule creates shared context.** Everyone sees the same
  current world and a live session retains its starting world. That makes the
  constraint feel intentional rather than arbitrary.
- **The interface has a recognizable identity.** The runtime-drawn pixel art,
  custom avatars, compact scenes, warm-paper palette, and pixel chrome make the
  product visually ownable.

### Engineering strengths

- **The server owns time and live phase state.** Clients render from a server
  timestamp instead of decrementing an independent clock, preventing ordinary
  client drift and making resynchronization possible.
- **Failure modes have been studied rather than hand-waved.** The repository
  records concrete lessons about RLS recursion, zero-row writes, stale presence,
  tab sleep, multiple sockets, hydration, pixel resampling, and backwards-
  compatible event changes.
- **Security decisions are generally sound.** Production sockets authenticate
  with Supabase, identity comes from the verified token, session joining is
  permission-checked, sensitive profile columns use column grants, and
  `SECURITY DEFINER` functions pin their search path and restrict execution.
- **Pure deterministic rules are isolated and pinned in both packages.** World
  rotation and pet levels have mirrored test vectors, which is a pragmatic way
  to keep independent client and server packages compatible.
- **The test baseline is substantial.** At review time, 79 server tests and 276
  client tests passed. Client TypeScript, lint, and the production build also
  passed. CI runs those checks on pushes and pull requests.
- **The code usually distinguishes “empty” from “failed.”** The stats and task
  work is especially good: the UI does not tell a returning user that their
  history is zero merely because a request failed.
- **The roadmap is unusually honest.** It documents reversions, incorrect past
  diagnoses, unverified work, real file locations, and product-owner decisions.
  That is much more useful than a celebratory changelog.

## Severity definitions

- **NEED TO HAVE** — correctness, data integrity, security, legal trust, or a
  release-confidence issue that should be addressed before pushing growth.
- **WANT TO HAVE** — meaningfully improves activation, retention,
  maintainability, accessibility, or operational quality.
- **NICE TO HAVE** — valuable polish or leverage after the core is reliable.
- **MEH** — low-value cleanup or ideas that should not displace product work.

## NEED TO HAVE

### 1. Validate every inbound Socket.IO payload before destructuring it

**Status:** Addressed in PR #48 with the shared payload boundary, contained
handler errors, and real-socket malformed-event coverage.

**Evidence:** Most handlers in `server/index.js` destructure the event argument
in the function signature, including `get_online_friends`, `send_invite`,
`create_session`, `join_session`, `start_session`, `finish_flow_focus`,
`stop_session`, and `set_pet`.

**Why it matters:** A custom authenticated client can send `null`, a primitive,
an oversized array, or an unexpected object. Destructuring `null` throws before
the existing field validation runs. Exceptions and rejected promises in event
listeners can become process-level failures, turning one malformed event into a
realtime outage for every active room.

**Recommendation:** Accept a single `payload` value, verify it is a plain object,
and parse it with a small shared schema layer before any field access. Zod,
Valibot, or focused handwritten parsers would all work. Wrap async handlers in
one error boundary that logs an event name and emits a generic client error.
Add handler-level tests for `null`, arrays, missing fields, wrong types, huge
strings, `NaN`, and repeated events. Treat protocol validation as a boundary,
not a collection of ad hoc clamps.

### 2. Enforce the product's session capacity on the server

**Status:** Addressed in PR #49 with two-seat enforcement, synchronous join
reservations, reconnect handling, and concurrent-join coverage.

**Evidence:** The product and README say “two people, one timer,” while
`join_session` never rejects a third player. The client selects only the first
entry other than the current socket as `partner`, although `playerCount` can
continue growing.

**Why it matters:** A third accepted friend or invited user can enter the room,
be counted and recorded, but be invisible to the two-person scene. Duo stats
then interpret a group session as several pairwise sessions, and different
clients may render different “first” partners. This is a product-integrity and
authorization-boundary bug, not just an odd layout.

**Recommendation:** Decide explicitly between two-person and group sessions.
For the current product, reject a new distinct user when two slots are occupied,
while still permitting an existing user to reconnect into their slot. Return a
specific `Session is full` error. Stop allowing new invites once the room is
full and add race tests for two joins arriving together. If group sessions are
the actual direction, redesign the client and stats model before allowing them.

### 3. Make completed-focus recording atomic and recoverable

**Status:** Addressed after PR #49 by migration 022 and the matching server
path: one transactional RPC, stable per-round keys, bounded transient retries,
idempotent in-memory pet credit, and shutdown draining. Applying migration 022
before deploying that server commit remains a release requirement.

**Evidence:** `recordSession()` inserts a `sessions` row and then separately
inserts `session_participants`. If the second request fails, an orphan session
row remains and every participant loses that focus from their stats and pet
progress. Both writes are best effort, have no durable retry, and are often
started without awaiting completion.

**Why it matters:** Completed focus is the user's primary durable outcome. It
feeds stats, streaks, duo history, and pet growth. A transient database error or
server termination can silently lose the result of a real session. The server
currently logs the failure, but the user has no indication and there is no
repair path.

**Recommendation:** Move “insert session plus participants” into one Supabase
RPC/transaction. Give each focus round a stable idempotency key so a retry
cannot duplicate credit. Await or durably queue the write before discarding the
round, retry transient failures with bounds, and expose a metric/error alert.
At minimum, surface a non-alarming “saving activity” / “activity could not be
saved yet” state to participants.

### 4. Turn the accumulated browser-verification debt into a release gate

**Status:** Addressed after PR #50 with a blocking production-build Playwright
smoke job plus `docs/RELEASE_CHECKLIST.md`. CI owns stable public, metadata,
realtime-health, error-overlay, and responsive-overflow checks; OAuth,
two-account, live-data, real-phone, and visual checks remain explicit manual
release requirements rather than unverified claims.

**Evidence:** The roadmap marks pet stages, the emoji purge, pixel chrome,
mobile sprite scaling, rotating-world behavior, social-card output, and older
shared-goal/reconnect/sound flows as not browser-verified. Several require two
authenticated accounts or a real phone and cannot be proven by geometry tests.

**Why it matters:** The unit suite is strong at deterministic rules but cannot
answer whether OAuth returns correctly, a real Supabase migration matches the
client, two people see the same state, a phone can reach all controls, or the
new pet silhouettes read visually. Calling an item shipped while explicitly
not exercising its user flow leaves the highest-risk integration layer open.

**Recommendation:** Create a small, repeatable smoke matrix and make it part of
every release:

1. Google and Discord sign-in/callback on the production domain.
2. First-run username, avatar save, sign-out, and sign-in restoration.
3. Two accounts: request, accept, invite, join, start, phase transition, stop,
   leave, reconnect, and tab-sleep resync.
4. Shared goal creation and partner completion with the byline persisted.
5. Premium claim against the live database, pet selection, and young/grown/full
   rendering using controlled test data.
6. Portrait and landscape phone checks, including safe areas and all exit
   controls.
7. Deployed Open Graph image inspection and a real link-preview fetch.

Automate the stable portion with browser E2E tests and keep a short manual
two-account checklist for OAuth, background-tab behavior, and visual taste.

### 5. Do not claim agreement to terms that users cannot inspect

**Status:** Addressed in PR #52 with public Terms and Privacy pages linked
before sign-in, an authenticated Privacy & account screen, reversible marketing
consent, and permanent self-service account deletion. The server derives the
account from the verified socket, hard-deletes Supabase Auth so schema cascades
remove linked application rows, and explicitly removes the email-keyed legacy
waitlist row. The published copy is a product-authored trust baseline, not a
substitute for jurisdiction-specific review by qualified counsel.

**Evidence:** The landing page says, “By signing in you agree to our terms of
service,” but the repository has no Terms of Service or Privacy Policy page or
link. The app stores identity/profile data, friendship data, tasks, focus
history, presence, and optionally an email plus marketing consent.

**Why it matters:** This is a direct trust problem and can become a compliance
problem once the project is promoted. A sentence is not meaningful consent to
an unavailable document. The `premium_grants` model also records marketing
opt-in without an in-product way to review or withdraw it.

**Recommendation:** Publish concise, accurate Terms and Privacy pages, link
both beside the sign-in actions, state retention/deletion/contact practices,
and provide account/data deletion. If marketing opt-in is retained, provide a
withdrawal mechanism and document how it is honored. Get jurisdiction-specific
legal review before treating these notes as legal advice.

### 6. Finish the “failed is not empty” rule across social data

**Evidence:** `useFriendsList` and `useOnlineFriends` still ignore Supabase read
errors and retain empty/stale arrays. `acceptRequest` does not request the
updated row, so an RLS zero-row update can look successful. These paths conflict
with the repository's own documented data-hook convention.

**Why it matters:** The collaboration loop depends on the friend list. A failed
read appears as “no friends,” and a silently refused accept can look as though
the other person disappeared. This repeats the same data-loss illusion already
fixed for stats and tasks.

**Recommendation:** Give the friend hooks `loading`, `loaded`, and `error`
states; check every read result; distinguish no friends from unavailable; and
use `.select("id")` plus a row-count check for accept. Add tests for read
failure, zero-row update, retry, and realtime recovery.

### 7. Make database migrations reproducible rather than dashboard-only

**Evidence:** Migrations are numbered and tracked well, but the documented
deployment method is manual execution in the Supabase SQL editor. The roadmap
records a period when application code reached production before its required
RPC, and the newest production round trip is still unproven.

**Why it matters:** The repository cannot establish which schema production is
actually running. Manual ordering is vulnerable to skipped files, partial
application, and app/schema deployment races—the project has already
experienced one such window.

**Recommendation:** Link a Supabase CLI project, apply migrations through a
repeatable command, and add a CI database job that starts a disposable database,
applies all migrations from zero, and runs smoke queries for functions, RLS,
and grants. Deploy schema before code that requires it, and keep a small
`schema_version`/health check so the server can fail clearly on mismatch.

## WANT TO HAVE

### 1. Reduce the path from discovery to the first duo session

**Status:** Addressed in PR #57. The implementation uses a server-held random
256-bit bearer token instead of a self-contained signed token, which keeps the
room id out of the URL and makes immediate rotation and one-time consumption
straightforward. The link survives same-tab authentication and onboarding,
then auto-joins once the profile, avatar, and socket are ready. Funnel
instrumentation remains a separate product-analytics decision.

Today the happy path asks both people to authenticate, finish a profile and
avatar, find each other by username, exchange/accept a friend request, be online
at the same time, and then send an in-app invite. That is a lot of coordination
before the core magic appears.

Add a shareable invite URL or room code that survives the recipient's auth and
onboarding redirect. Let the inviter copy it immediately after creating a room,
and land the recipient back in that exact room after setup. Preserve the private
two-person boundary with a signed, expiring, single-room invite token. Measure
the funnel: landing → auth → avatar complete → friend/invite → joined room →
first completed focus.

### 2. Resolve the “Premium, but free” product contradiction

**Status:** Addressed in PR #59. Customer-facing surfaces now call the feature
“Companions” or “companion access,” consistently describe it as free with the
signed-in account email, and state that marketing is a separate optional
choice. The paid-tier-sounding Pro badge is gone. Legacy premium names remain
internal to the database and code so product-language cleanup does not create
an unnecessary entitlement migration.

The home menu says “Unlock pets — free,” while the in-session menu says
“Upgrade to Premium.” Any authenticated user can claim it, no payment exists,
and pets are the only gated feature. That adds a conversion modal and an email
record without creating meaningful scarcity or revenue.

Until payments exist, call it “Unlock companions,” explain the email/marketing
choice plainly, or simply unlock pets automatically after a first completed
session. If monetization becomes a real near-term goal, define the paid value
and entitlement lifecycle before adding Stripe. Do not build checkout first and
invent benefits afterward.

### 3. Add observability for the realtime server and critical RPCs

**Status:** Addressed in PR #60. Direct server console calls are replaced by
privacy-safe JSON events with opaque correlation references. Critical RPC
attempts expose outcome, retry intent, latency, and safe error classification;
minute snapshots aggregate connection, room, reconnect, rejection,
persistence, presence, and protocol signals. `/health` remains liveness and a
cached, bounded `/ready` probe reports database availability separately. The
repository defines alert conditions and response steps; the external
notification destination still has to be configured in the deployment's log
platform.

The server currently relies on unstructured `console.log/error`, and several
presence writes intentionally discard their result. There is no visible error
tracking, latency metric, active-session gauge, persistence success rate, or
alert for repeated auth/database failures.

Use structured logs with event names and request/session correlation, while
avoiding display names and unnecessary user identifiers. Track connection
count, active rooms, reconnects, rejected joins, phase-record success/failure,
Supabase latency, and process restarts. Add error reporting and an alert for
focus-record failures. A health endpoint that always returns `{ok:true}` is
only a liveness check; add dependency/readiness information separately.

### 4. Fix hydration-sensitive greeting logic

**Status:** Addressed in PR #61. `HomeDashboard` supplies the neutral “Hello”
server snapshot through `useSyncExternalStore` and derives the time-specific
greeting from the browser clock after hydration. Static server markup is pinned
to contain no morning, afternoon, or evening copy, and client rendering verifies
the local-hour result.

`HomeDashboard` calls `new Date().getHours()` during render even though the
project correctly documents that clock-derived client UI should initialize
after mount. Server time zone and browser time zone can produce different
greetings and a hydration mismatch near broad portions of the day.

Initialize the greeting neutrally or as `null`, then calculate local time in an
effect. Add a static-server-render test like the existing rotating-world test.

### 5. Establish an accessibility baseline

**Status:** Addressed in PR #58. Critical controls now keep accessible names at
mobile widths, status changes use live semantics, and the main panels/modals
share Escape, focus containment, initial focus, and opener restoration. Native
focus-visible and reduced-motion behavior applies globally. Axe runs WCAG A/AA
checks on public light/dark surfaces in Playwright and semantic scans on core
authenticated components in jsdom. The release checklist still requires a
real keyboard and screen-reader pass; automation cannot certify usability.

Many controls hide their text at mobile widths without supplying an accessible
name, including Friends, Stats, Notes, and account buttons. Several overlays
are visually modal without consistent dialog semantics, focus trapping,
Escape-to-close, or focus restoration. Status toasts are not consistently live
regions. Color contrast and keyboard order have not been documented or tested.

Add accessible names to every icon-only state, semantic labels to inputs,
`aria-expanded`/`aria-controls` to menus and panels, proper dialog behavior,
visible focus styles, reduced-motion verification, and an automated axe scan of
each major screen. Test the entire critical path with only a keyboard and with
a screen reader at least once per release.

### 6. Split the largest orchestration files along behavior boundaries

**Status:** In progress across PRs #62–#63. The production entry point is a thin
environment/bootstrap layer, while `server/app.js` exports an injectable
factory that owns each instance's HTTP server, Socket.IO transport, live state,
timers, metrics, startup, and teardown. Importing it has no listener, signal,
credential, or interval side effects. Pure event-specific payload parsers now
own field validation, allowlists, defaults, and bounds without I/O or live
state. Handler services, the client hook split, and a shared typed event
contract remain follow-up work.

`server/app.js` is about 1,372 lines, `useGameSession.ts` about 743,
`DuoTimer.tsx` about 544, and `WorldDecorations.tsx` about 1,676. Some size is
legitimate, especially hand-authored art, but the realtime files mix protocol
parsing, authorization, state mutation, persistence, presence, and transport.

Define a typed event contract, extract payload parsers and handler services,
and make the server export an app factory rather than starting on import. Split
`useGameSession` into connection/resume, room events, and derived timer state.
Keep art maps data-oriented rather than splitting merely to hit a line target.

### 7. Generate database and realtime types

The client uses manual `Profile`/RPC shapes and a few explicit `any` mappings.
The CommonJS server has no static protocol types. Schema drift can therefore
pass TypeScript and appear only against production.

Generate Supabase types from the schema and share a small versioned protocol
package or generated declaration between client and server. Validate at
runtime at the socket boundary even after types exist; types do not protect
against custom clients.

### 8. Make destructive multi-row UI updates verify affected rows

Single-row writes mostly check selected rows now, but bulk `clearCompleted`
paths only check `error`. In the shared-note view, rows owned by the partner may
be rejected by RLS while the client locally removes the entire selected set.

Return deleted IDs with `.select("id")`, remove only confirmed rows locally,
and report partial failure. For shared goals, decide whether partner deletion
is allowed; if it is, expose a narrow `SECURITY DEFINER` RPC rather than
broadening table privileges.

### 9. Clean up test signal and add missing behavior coverage

The passing client suite emits multiple React `act(...)` warnings from
`PremiumModal` tests, plus environment/deprecation warnings. No tests directly
cover `useAuth`, friend hooks, most socket handlers, production migration
application, or the complete two-client lifecycle.

Treat unexpected console output as a test failure, fix async `act` handling,
add `useAuth` tests for cached/fresh/error/timeout paths, and expand real-socket
tests beyond session creation. Code coverage can be useful as a map, but the
target should be critical behavior rather than a percentage.

## NICE TO HAVE

### 1. Give the roadmap a current, compact top section

The file is valuable history but most of its 600+ lines describe completed
work. Move shipped narratives to a changelog or decision log and keep the top
of `ROADMAP.md` to active outcomes, owner decisions, verification status, and
acceptance criteria. Preserve the corrections—they are excellent institutional
memory—but do not make readers excavate the next action from old audits.

### 2. Add architecture decision records for irreversible choices

Short ADRs would suit the decisions already explained well in prose: in-memory
room state, wall-clock world rotation, server-authoritative time, direct client
Supabase access, free premium, and two-copy deterministic logic. Each should say
what would trigger reconsideration. This makes future scaling work much easier.

### 3. Prepare a scale-up path without implementing it prematurely

In-memory rooms and timers are reasonable for today's apparent usage, but one
instance restart ends every active room and horizontal scaling would split
presence/session truth. Document thresholds that justify change—for example,
material concurrent rooms, unacceptable deploy disruption, or a paid uptime
promise—and the likely path: sticky routing first, then an external room/event
store or durable coordinator.

### 4. Add product feedback and lightweight analytics

The repository has strong engineering commentary but little evidence of user
behavior. Add privacy-conscious events for funnel stages and a small feedback
entry point. The key questions are whether users complete onboarding, get a
partner into a room, finish a first focus, return within a week, and care about
pets/world rotation. Those answers should determine the next feature.

### 5. Improve offline expectations

The navigation fallback is appropriately conservative and should not cache
live session/API data. Consider making the offline page explain that the timer
will attempt to rejoin when connectivity returns, and expose last-known local
session context without pretending it is authoritative. Do not turn the app
into a cache-heavy PWA unless offline solo focus becomes a deliberate product
mode.

### 6. Add a small operational runbook

Document deploy order, rollback, environment ownership, Supabase migration
verification, OAuth redirect checks, CORS host checks, Render restart effects,
and how to repair stale presence or missing session participants. Much of this
knowledge exists across `CLAUDE.md`, `MIGRATE_TO_VERCEL.md`, and the roadmap;
one short production runbook would make incidents less improvisational.

## MEH

### 1. Do not prioritize another broad palette rewrite

Palette consistency is worthwhile, but the current visuals already have a
coherent identity and have consumed a large share of recent roadmap effort.
Change individual contrast failures after visual review; a wholesale palette
migration should not outrank reliability, activation, accessibility, or user
evidence.

### 2. Do not add more worlds yet

Eight worlds are enough to test whether rotation creates delight and return
behavior. More worlds increase art, migration, rotation, test, and contrast
surface without fixing the first-session funnel.

### 3. Do not build Stripe merely because a billing seam exists

There is no demonstrated paid package yet. Checkout, webhooks, refunds,
entitlements, taxes, support, and account recovery create real operational
weight. Validate willingness to pay and define benefits first.

### 4. Do not migrate frameworks or convert everything to a monorepo for style

The independent client/server packages work and CI understands them. A small
shared protocol package may earn its keep; a broad framework rewrite does not.

### 5. Remove starter assets and vestigial root dependencies when convenient

The unused Next starter SVGs and root package are untidy. The root lockfile also
causes Next to warn that it may have inferred the wrong workspace root, so that
part is worth a quick cleanup or explicit `turbopack.root` setting. It is still
not a user-facing problem and should be bundled with normal maintenance.

### 6. Avoid speculative social mechanics

Leaderboards, public feeds, streak pressure, currencies, and large group rooms
could undermine the calm two-person premise. Add them only in response to a
clear user need, not because focus apps commonly have them.

## Recommended next roadmap milestone

The current numbered roadmap is effectively exhausted: items 1–13 are marked
shipped. The unresolved work is mostly scattered through “not verified,” “open
decision,” and “also worth knowing” notes. The next roadmap entry should make
that work explicit.

### 14. Release confidence and first-session activation

Suggested order:

1. **Protocol hardening:** safe payload parsing, handler error boundary,
   malformed-event tests, and strict two-person capacity.
2. **Durable activity recording:** one transactional/idempotent RPC, retry and
   failure visibility.
3. **Schema delivery:** reproducible Supabase CLI migration flow and a clean-
   database CI test.
4. **Production proof:** run the premium claim once with a designated test
   account and verify its grant/profile state; complete the two-account and
   mobile browser checklist already implied by the roadmap.
5. **Trust baseline:** publish Terms, Privacy, deletion/contact information,
   and marketing-consent withdrawal.
6. **Collaboration truth:** finish friend-list error handling and accessibility
   on the critical path.
7. **Activation experiment:** add a signed shareable invite link that returns a
   newly authenticated user to the intended room, then measure completion of a
   first duo focus.

Only after those are complete should the roadmap choose between retention work
(pet rewards, reminders/scheduling, shared rituals) and monetization. Use the
activation and return data to make that choice.

## Verification performed for this critique

- Read all tracked Markdown files and the tracked roadmap.
- Inspected client, server, Supabase migrations, package/configuration files,
  and CI.
- Server: **6 test files, 79 tests passed**.
- Client: **27 test files, 276 tests passed**.
- Client TypeScript: passed.
- Client ESLint: passed.
- Client production build: passed with dummy public environment values.
- Noted non-failing warnings: React `act(...)` warnings in several premium
  modal tests, Node/localStorage deprecation/environment warnings, and Next's
  multiple-lockfile workspace-root warning.
- Did not claim production OAuth/database/two-user/browser behavior as verified;
  those require the live environment and designated accounts and are included
  above as explicit follow-up work.
