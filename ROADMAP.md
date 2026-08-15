# Duodoro — what to work on next

The prioritised backlog. Tick items off as they ship; update this in the PR
that does the work, not afterwards. Ordered by value; each line names the real
files. Was `ROADMAP.local.md` and gitignored until PR #38 — it is tracked now,
so the file:line references land in diffs and want keeping honest.

Last updated: 2026-08-15. PRs #35–#40 merged.
Item 4 is on `art/character-outline-shadow`, pushed, PR pending review by eye.
Migrations 016–020 are applied to Supabase. **020 verified in production**
2026-08-15: RLS on, one SELECT-only policy, zero client write grants, EXECUTE
limited to authenticated/service_role, SECURITY DEFINER with a pinned
search_path. It went in *after* #40 reached main, so there was a window where
the unlock button called a function that did not exist — it failed soft and
nobody had claimed, so the window cost nothing. Nothing has claimed since
either: `premium_grants` is empty, so the round trip is still unproven against
the live database.

~~Open infra issue: `ALLOWED_ORIGIN` missing the www host~~ — **fixed
2026-08-12.** Verified: both `https://duodoro.live` and
`https://www.duodoro.live` now get a matching ACAO from Render.

---

## Done

- [x] **5. Mobile game screen** — PR #31, merged
- [x] **6. Silent failures read as data loss** — PR #32, merged
- [x] **7a. Sprite geometry** — PR #33, merged. The objectively-checkable half of 7.
- [x] **1. De-blur** — PR #35, **merged** (rebase, 7 commits on main).
      Whole-pixel transforms everywhere; the rule is in CLAUDE.md and enforced
      by `app/pixelMotion.test.ts`. Confirmed by eye on localhost: characters
      no longer float, walk reads clean.
- [x] **3b. GROUND + ART_PX** — PR #36, **merged** (rebase, 5 commits).
      The mechanical half. The density collapse moved into 7b — see below.

## Next up (recommended order)

- [x] **7b-bg. Backgrounds** — PR #37, **merged** (rebase, 12 commits).
      All eight worlds redrawn; every one renders at exactly one art pixel and
      the "known backlog" guard now asserts an empty list. Root cause was not
      draughtsmanship: the hill bands were `preserveAspectRatio="none"` on a
      `w-full` SVG, i.e. *stretched* to ~45x10 per pixel, and MountainDecor
      drew one map at scale 5/6/7/8 in one frame. lofi retired for grocery
      (migration 019). Owner reviewed on localhost: "acceptable".
- [x] **11. Server-set rotating themes** — PR #38, 6 commits. Hourly on the
      :30, derived from the clock in `server/rotation.js` +
      `client/src/lib/rotation.ts`, order reshuffled every 8 slots. The open
      question below is **answered**: kept at one hour (the owner's spec) and
      fixed the daily repeat with the per-cycle shuffle instead of changing the
      interval. Home's picker is now `WorldNowCard`.
- [x] **7b-char. Characters + pets onto `PixelSprite`** — PR #39, 6 commits.
      Owner reviewed on localhost: pets, walk and sitting all approved.
      Both sprites are layered string maps now (`lib/characterMaps.ts`,
      `lib/petMaps.ts`) composited by `lib/pixelMap.ts`. The avatar blinks;
      pets went 10×11 → 9×7 (0.46× a person → 0.29×). `darken()` is gone —
      see below. Outlines were one prop away but not turned on; item 4 turned
      them on.
- [x] **2. Premium button on home is a no-op** — PR #40. Wired through, and
      premium is now *grantable at all*: `claim_premium` (migration 020) turns
      it on free in exchange for the OAuth-confirmed email. Feature list is
      down to what exists. Stripe seam is `client/src/lib/billing.ts`.
      **Migration 020 must be applied before the deploy**, or the button
      raises `function claim_premium does not exist`.
- [x] **4. Contact shadow** — branch `art/character-outline-shadow`.
      `PixelSprite` has had an outline pass and `Grounded` a contact shadow
      since #37; what was missing is that `GameWorld` draws the characters
      itself and passed neither, so the two things the scene is about were the
      only two hovering. Shadow extracted to `components/ContactShadow.tsx` so
      the scenery and the characters share one recipe.
      **Outlines were tried on the characters and taken back off** at the
      owner's call, 2026-08-15 — see below.
- [ ] **12. Pets level up and grow** — owner's idea, 2026-08-13. Written up
      below. Mostly drawing: growth has to be maps with more cells, never a
      bigger `size`. Levels want deriving from focus history, not storing.

## ⚠️ Corrections to this file

Three "defects" originally listed under item 7 were checked against the source
and are **not real**. They have been struck out below. Verify before fixing:

- **Eye centring** — claimed `anime`/`sleepy` centre on 7.5. They don't: the head
  spans columns 3–12, so the axis is 8, and all three styles sit on it. **Now
  enforced** rather than argued — `characterMaps.test.ts` asserts the eye
  midpoint is 8 and that rows 3–11 are shape-symmetric, for every style.
- **"long" hair identical to "bob"** — the *front* layer is identical, but the
  back layer draws side drapes for `long` only (`lib/characterMaps.ts`,
  `HAIR_BACK`). Same fringe, longer sides: reasonable design, not a bug. Also
  enforced now — `characterMaps.test.ts` asserts the two share a fringe and
  differ overall.
- **PALM crown misaligned** — the crown and the trunk's *top* are both centred on
  column 7. The trunk then leans right by design over rows 5–10, which is what
  palm trunks do. Comparing the crown to the trunk's base and calling the
  difference an error mistakes the curve for a defect.

Partially true: **MOON** has **2** always-empty trailing columns, not 3. Cosmetic
bounding-box looseness — `right-[8%]` is off by ~10px at `scale={5}`. Left alone
deliberately; trimming moves the moon and there's no way to check the result
without looking. MOON's *two different palettes* are two different worlds' moon
tints (warm yellow vs lavender) — intentional, not a duplication bug.

---

## 1. De-blur the pixel art  ·  ~30 lines, mechanical, one sitting

Non-integer rotation and sub-pixel positioning resample hard edges into grey
fringe. This is why sprites look blurry **despite** `shapeRendering: crispEdges`
— the renderer is fine, the transforms aren't.

- `client/src/app/globals.css:112-133` — remove the ±1° `rotate()` from the
  character keyframes and the fractional `scaleY(1.05 / 0.92 / 0.96)`. Replace
  squash-and-stretch with integer `translateY` steps.
- `client/src/components/GameWorld.tsx:87` — the ±10° controller swing. Use a
  1-pixel horizontal shuffle or `scaleX(-1)` instead.
- `client/src/hooks/useCharacterPosition.ts:31` — returns
  `calc(${focusProgress * 42}% + 8px)`, animated on `left`, so the sprite sits
  on a fractional pixel and shimmers for the whole focus phase. Move to
  `transform: translateX()` on rounded integer px.
- `client/src/components/GameWorld.tsx:216,249` — `bottom: "calc(19% - 4px)"`,
  also fractional.
- Delete the dead `.pixel-sprite` class (`globals.css:93-96`, zero usages) and
  the no-op `imageRendering: "pixelated"` on `<svg>` elements
  (`PixelCharacter.tsx:220`, `PetCharacter.tsx:179` — it only affects rasters).

**Highest visual-impact-per-line in the codebase.** Do this first.

---

## 2. Premium button on the home screen is a no-op  ·  SHIPPED — PR #40

- `client/src/components/HomeDashboard.tsx:212-219` —
  `onClick={() => setProfileMenuOpen(false)}`. Closes the menu, does nothing
  else. `HomeDashboard`'s props (`:23-40`) have no premium callback at all;
  `DuoTimer` never passes one.
- `client/src/components/SessionTopBar.tsx:43,152-159` — wires it correctly.
  So the in-session path works and the *home* path silently dies. Home is the
  primary monetization surface.
- `client/src/components/PremiumModal.tsx` — the feature list is still mostly
  fiction. "Unlock all world themes" was removed in PR #38 (the rotation left
  nothing to gate). Remaining: "Focus stats & session history" while
  `StatsPanel`/`StatsScreen` are open to all; "Friend session notifications"
  while the Notification API appears nowhere in the codebase; "Exclusive
  premium character skins" while there are none. Only pets are actually gated
  (`PetPicker.tsx:20,34`).

**Shipped in #40.** `onOpenPremium` threaded through, list trimmed to the one
true item, and the bigger thing the audit missed: premium was not merely
unsold, it was **ungrantable**. `is_premium` defaults false, migration 010
revoked the client's write, and nothing else ever set it — so it was false for
all 10 users and pets had never been reachable by anyone, premium or not.

The owner's call was to give it away for a confirmed email address until there
are enough users for Stripe. No confirmation email is sent: all 10 users signed
in with Google or Discord, so `email_confirmed_at` is already set, and our own
link would re-verify something already verified while needing an email provider
this project doesn't have. `claim_premium` reads the address from `auth.users`
inside a `SECURITY DEFINER` function, so the client can't assert it.

Worth being explicit: **this is not a paywall.** Any authenticated user can call
the RPC and get premium. That is the intent until Stripe lands — see
`client/src/lib/billing.ts` for what that will need.

---

## 3. One palette + one pixel unit  ·  mechanical, one taste call

**146 hardcoded hex literals** in `client/src` against 17 theme tokens, drawn
from three different published design systems:

- ~~`PetCharacter.tsx:23-37` — the most-copied Coolors palette, verbatim~~ —
  **gone in PR #39.** Pet colours are one base per animal with `shade()`
  deriving the rest, in `lib/petMaps.ts`. Characters likewise: `palette.ts`
  now owns every shadow either sprite uses.
- `lib/uiSprites.ts:16,25` — a *different* Coolors set.
- `WorldDecorations.tsx` — 77 of the 146. Tailwind defaults (`#c084fc`
  purple-400 `:92`, `#f1f5f9` slate-100 `:121`) mixed with Material Design 800s
  for the bookshelf (`:226-231`) and Material browns (`:224,245`).
- `client/src/app/globals.css:10-49` — the app's own 17 warm-paper/charcoal
  tokens, used by **none** of the art.

**3a (mechanical):** create `client/src/lib/palette.ts` from a published Lospec
ramp — Sweetie-16 (forgiving) or Apollo (46 colours, richer for 8 worlds) — as
named ramps (`SKIN[0..5]`, `FOLIAGE`, `STONE`, `NIGHT`, `WARM`, `METAL`), then
migrate component palettes onto it.

*Caveat:* existing users have literal hexes in `profiles.avatar_config`, so
changing `SKIN_COLORS`/`HAIR_COLORS`/`OUTFIT_COLORS` leaves them permanently
off-palette without a nearest-colour snap on load or a one-time SQL update.

**3b — DONE in PR #36, but only half of what this said.** `lib/scene.ts` now
exports `GROUND` and `ART_PX`; characters and pets are on `ART_PX`; `GROUND`
was six literals across three files, not two.

**The density collapse is not mechanical and has moved to 7b.** A sprite's
apparent pixel size *is* its scale, so a 16-cell map at `ART_PX` is a 48px
mountain, not a small-pixelled 128px one. Collapsing the scenery onto one unit
either shrinks it by half to two-thirds, or means redrawing every map at more
cells. Cost table is at the top of `WorldDecorations.tsx`; the worst is
`MOUNTAIN` at 43×27 cells instead of 16×10.

Also corrected while doing it: the `calc(19% - 4px)` was not "people stand 4px
into the dirt". `bottom` positions the wrapper, and the wrapper's bottom edge
was the *name tag* — so characters floated a label's height **above** the
horizon while trees stood on it. Fixed by taking the tag out of flow. This is
part of item 4's "everyone appears to hover"; the contact shadow, since done,
was the rest.

---

## 4. Contact shadow  ·  SHIPPED (outline reverted)

**Shipped:** every grounded sprite, characters and pets included, now has a
one-art-pixel contact shadow from the shared `ContactShadow` component. That
half of this item was the "everyone appears to hover" complaint and it is done.

**Reverted:** character outlines. They were turned on across all eight worlds
and the owner didn't like the look. Taken back off 2026-08-15; `keylineOn()`
went with them. The scenery keeps its own keylines — those shipped in #37 and
were reviewed and accepted then.

Worth being straight about where this came from: **the owner never asked for
outlines.** It was written into this file by an earlier audit and got built
because the file said to. That is the failure mode the corrections section at
the top exists for — except here the *diagnosis* was right and the
*prescription* was too broad.

**The problem the outline was for is real and is now unsolved.** Contrast of
the worst-case hair colour against the sky at head height, measured:

| world | sky at head | worst hair | contrast |
|---|---|---|---|
| space | `#130840` | Black `#1A1A1A` | **1.06** |
| city | `#16213e` | Black | **1.09** |
| library | `#5d4037` | Brown `#5C3317` | **1.16** |
| grocery | `#cdd4cc` | Blonde | 1.47 |
| beach | `#FFD166` | Blonde | 1.54 |
| cafe | `#e8d5b7` | Blonde | 1.55 |
| forest | `#AEE5D8` | Blonde | 1.59 |
| mountain | `#E0F0FF` | Blonde | 1.91 |

1.00 is invisible. On Space a black-haired avatar's head is at 1.06 against the
air behind it — not a matter of taste, the head is genuinely not there.

Options if it is worth fixing later, cheapest first:

- **Outline on the three dark worlds only.** The five light worlds sit at
  1.47–1.91, low but readable; the outline bought nothing there and cost the
  look everywhere. `keylineOn()` is in this branch's git history.
- **Lift the sky's bottom stop** on space/city/library so the air behind a head
  is lighter. Changes the mood of worlds the owner already approved.
- **Rim-light the head only** — one lighter row along the top of the hair.
  More drawing, no border.
- **Leave it.** Three of eight worlds, two of six hair colours. Real, narrow.

---

## 5. Mobile game screen  ·  SHIPPED — PR #31

- `client/src/components/DuoTimer.tsx:339` — game screen is `h-screen` +
  `overflow-hidden`. On iOS Safari `100vh` exceeds the visible viewport, so the
  bottom of the HUD — including **end session** and **leave session**
  (`SessionHUD.tsx:269-282`) — sits under the browser toolbar, and
  `overflow-hidden` means you cannot scroll to reach it.
- `client/src/app/layout.tsx:48` — `viewportFit: "cover"` is set but there is
  **not one** `env(safe-area-inset-*)` anywhere in `client/src`. Top bar runs
  under the notch, bottom under the home indicator.
- In landscape the HUD card is taller than the viewport and covers the scene
  entirely.
- `client/src/components/GameWorld.tsx` — zero responsive breakpoints, sprites
  at fixed CSS px, so characters are the same 48px on a 360px phone as on a 27"
  monitor. The responsive-sprite half wants item 3b done first.
- `client/src/components/HomeDashboard.tsx:297` — 8 worlds in `grid-cols-4`
  gives 48px-tall thumbnails on a phone.

`Button.tsx` and `AvatarCreator.tsx` already show the touch-target pattern
(`w-11 h-11 sm:w-7 sm:h-7`) — extend it to the HUD.

---

## 6. Silent failures read as data loss

- `client/src/lib/useStats.ts:118-120` — catches every RPC failure into
  `console.error` and leaves the snapshot `EMPTY`.
  `HomeDashboard.tsx:264-270` then renders "Total 0m / This Week 0m / Streak 0d"
  — pixel-identical to a brand-new account. A returning user with a 40-day
  streak and one failed request sees their whole history apparently erased, with
  no error anywhere. `fetchStats(true)` already supports forcing, so a retry is
  cheap.
- `client/src/hooks/useAuth.ts:201-209` — `saveAvatar` never checks the update
  result, yet still calls `setMyAvatar`, caches to localStorage and advances to
  home. A failed write looks like success until you open another device.
- `client/src/components/DuoTimer.tsx:245-248` — the `display_name` update
  ignores `error` entirely. Contrast `:225-241`, which handles `claim_username`
  errors properly — the pattern is known, just not applied.
- `client/public/sw.js:1-16` — a deliberate no-op passthrough with no app-shell
  cache. An **installed** PWA with no network shows the browser's offline error
  page rather than a Duodoro screen. Cache a minimal shell; never cache socket
  or RPC responses.

Related convention already in CLAUDE.md as of #29: check `error` on reads, not
just writes. This item is the rest of that sweep.

---

## 7. Redraw the scale hierarchy + characters onto `PixelSprite`

The genuine art labour. Deliberately last so it lands on a finished system.

**Scale (judgment):** 3b did not enforce one density on the scenery — it could
not, see above — so 7b now owns both the redraw *and* the collapse. Depth has
to come from sprite *dimensions in art pixels*, not px-per-pixel. Character is
16×24 at `ART_PX` = 48×72px, therefore today:

- a pine tree (`PINE` 12×14 @ scale 4, `WorldDecorations.tsx:463`) is 56px —
  **shorter than a person**, with 33% bigger pixels
- a skyscraper (`BUILDING_TALL` 9×16 @ scale 3, `:597`) is 48px — two-thirds a
  person's height
- a mountain (`MOUNTAIN` 16×10 @ scale 8, `:635`) is 80px — **11% taller than a
  human**
- ~~pets are 20px with pixels ⅔ the character's~~ — **density fixed in PR #36**,
  ~~but they are now 30×33, i.e. a cat 0.46× a person's height~~ — **size fixed
  in PR #39**: redrawn at 9×7, so 27×21 px, 0.29× a person. `size` stayed at
  `ART_PX`

A 16-px-tall person needs a ~28px tree, ~60px tower, ~40px mountain range, plus
explicit far/mid/near variants differing by *value*, not scale.

**Characters (judgment):** `PixelCharacter.tsx` (338 lines) and
`PetCharacter.tsx` (187 lines) are ~90 literal `<rect x= y=>` elements with
inline coordinates — they do **not** use `PixelSprite`. So the two sprites users
look at most can't be palette-swapped, outlined, blinked or given a second idle
frame without editing numbers by hand. Rewrite as layered string maps (`base`,
`hair-back`, `hair-front`, `eyes-open`, `eyes-shut`, `outfit`).

Latent bugs to fix while redrawing:

- ~~`PetCharacter.tsx` cat/rabbit clipped foot~~ — **fixed in PR #33.** Both drew
  a leg at row 10 inside a 10-row viewBox, so each walked on one leg, alternating
  which. All four pets now share an 11-row grid.
- ~~eye centring~~ — **not a real defect.** See corrections at the top.
- ~~`long` hair identical to `bob`~~ — **not a real defect.** See corrections.
- ~~`darken(skinColor, 0.08)` is a naive RGB multiply~~ — **fixed in PR #39.**
  Confirmed: it shifted the deepest skin by 0.016 lightness against 0.071 for
  the palest. `shade()` in `palette.ts` drops lightness by a fixed amount while
  holding chroma; `flush()` derives blush from the skin. Two earlier
  implementations each fixed half of it — blending toward a fixed dark tone
  leaves near-black hair *lighter* than its shadow, and holding HSL saturation
  turns pale skin pink. Both are regression tests now.
- ~~`CUP_PALETTE` H identical to C~~ — **fixed in PR #33**, handle now uses the
  saucer shade.
- ~~`PALM` crown misaligned~~ — **not a real defect.** See corrections.
- `MOON` — 2 always-empty trailing columns. Cosmetic; see corrections.

~~Then add a blink frame every 4–6s and a 2-frame idle.~~ **Blink shipped in
PR #39** (4–6.5s, jittered, 130ms, off under `prefers-reduced-motion`). The
2-frame idle did *not*: `pixel-idle` still carries the whole motion, and a
second body frame on top of it looked busy in the static dump. Worth trying
once someone has watched the current version move.

Also still open from this item: `PixelCharacter` accepts an `outline` prop and
nothing passes one. Turning it on is the remaining half of item 4, and it is a
visual call — the dump shows a fairly heavy keyline at `ART_PX`.

---

## 8. Emoji purge  ·  ~20 lines, disproportionately visible

`lib/uiSprites.ts:3` says sprites exist for "anywhere an emoji would break the
pixel-art look" and `Icons.tsx:1` says the set "replaces emoji in UI chrome" —
yet:

- `PetPicker.tsx:40` renders 🐱🐶🐉🐰/🔒 while `PetCharacter` can draw the pets
- `FriendsPanel.tsx:56` and `FriendsOnlineSection.tsx:59` render world emoji
  while `WorldThumbnail` (`WorldDecorations.tsx:787`) exists
- `PremiumModal.tsx:12-16,72` is all emoji

The replacements already exist and are simply unused in these spots.

---

## 9. Pixel-ify the chrome  ·  after 3

The app loads the pixel typeface Pixelify Sans (`app/layout.tsx:17`) and then
renders **the timer — the largest element in the product — in Geist Mono**
(`SessionHUD.tsx:144`). Elsewhere: `rounded-2xl backdrop-blur shadow-xl`
(`SessionHUD.tsx:133`), `rounded-full` status dots, Feather-style stroke icons
with `strokeLinecap: "round"` (`Icons.tsx:8-16`), and a waiting slot that is a
dashed **circle** with a text "?" (`GameWorld.tsx:313-322`). Soft-SaaS chrome
wrapped around a game.

`Button.tsx:29-33` already gestures at the right idiom with `border-b-4`.

---

## 10. Launch surface  ·  cheap, do before showing anyone

- no `openGraph.images` and no `metadataBase` → every shared link renders a
  blank card
- `app/layout.tsx:40` — typo: `"Focus together, anywhere.."`
- `public/icon.svg` is a placeholder: two white circles on emerald `#10b981`, a
  colour that appears nowhere else in the app
- `manifest.webmanifest` sets `theme_color: "#111827"`, matching neither theme
  (`#f3ede1` / `#171411`), so the install splash flashes the wrong colour

---

## 11. Server-set rotating themes  ·  SHIPPED — PR #38

The owner's call, 2026-08-12: model the theme the way PEAK models its mountain
— one world, chosen by the server, the same for everybody, rotating on a clock.
Home loses its world picker entirely; you press **Focus** and the theme is
whatever the world is currently on.

**Rotation:** every hour, on the **:30**. Not on the hour — the offset is the
point, so the change doesn't land at the same moment as everyone's o'clock
pomodoro boundary.

**Derive it, don't store it.** The active world must be a pure function of wall
clock, so every server instance, every client and every late joiner agree
without coordination and without a round trip:

    index = floor((Date.now() - THIRTY_MIN) / ONE_HOUR) % VALID_WORLDS.length

No DB row, no timer, no broadcast needed to *know* the theme. Nothing to drift,
nothing to resync after a restart — which matters because all session state is
already in memory and dies with the process.

**A session keeps the theme it started with.** Rotation applies to *new*
sessions only. Swapping the scene under two people 20 minutes into a focus
block is a worse experience than a slightly stale theme, and it would also make
`sessions.world_id` ambiguous for the history rows.

Changes this needs:

- `server/index.js:463,492` — `create_session` currently takes `world` from the
  client and validates it against `VALID_WORLDS`. It should stop accepting the
  field and assign the derived one. The validation disappears with the input.
- `client/src/components/HomeDashboard.tsx:297-315` — the 8-world `grid-cols-4`
  picker goes. Replaced by one Focus button; showing "next theme in MM:SS"
  is free, since the client can derive it with the same function.
- Put the derivation in one shared place. It cannot be imported across the two
  packages (`client/` and `server/` are independent npm packages with their own
  lockfiles) so it will be duplicated — keep both copies next to a comment
  naming the other, and cover both with the same table of timestamps.
- `sessions.world_id` and `sessions_world_check` (migration 008) are unaffected;
  the value is still one of the eight. `profiles.current_world_id` likewise.
- Item 2's `PremiumModal` copy must lose "unlock all world themes" — with
  server-set themes there is no per-user world choice left to gate.

~~**Open question for the owner:** eight worlds at one hour each is an
eight-hour cycle, so someone who always focuses at 9am sees the same world
every day.~~ **Answered in #38.** Kept the hour and the :30 as specified, and
shuffled the *order* per cycle instead of changing the interval. A cycle is
still all eight worlds, so the "see everything in eight hours" property holds,
but which eight-hour permutation you get depends on the cycle number — so 9am
moves. A fix-up stops a cycle opening on the world the last one closed with.
Verified uniform across positions over 80k cycles (±2% of 1/8) with zero
boundary repeats.

**What actually shipped, beyond the design above:**

- The shuffle uses an integer hash (`Math.imul` + xor-shift), *not* the
  `Math.sin` seeding in `lib/terrain.ts`. ECMA-262 doesn't require
  transcendentals to be bit-identical across engines; a 1-ULP difference moves
  a rock in the scenery but would put the client and server in different
  worlds.
- `send_invite` also stopped trusting a client-sent `worldId` — the server
  reads it off the session. It was relaying an attacker-controlled world label
  into a full-screen popup on someone else's machine.
- `VALID_WORLDS` is gone from `server/index.js`; `ROTATION_WORLDS` is the one
  list.
- `server/createSession.test.js` is the package's first handler-level test —
  boots the real server on an ephemeral port over a real socket. `PORT=0` works
  now because the boot log prints the *bound* port.

**Not verified:** nothing here has been looked at in a browser. Worth checking
by eye — the countdown ticking on home, and that a session left open across a
:30 keeps its own world rather than swapping under you.

---

## 12. Pets level up and grow  ·  owner's idea, 2026-08-13, not started

The owner's call after previewing #39: pets earn levels and get **bigger** as
they level. A companion that visibly changes because of hours you actually put
in is the first thing in the product that rewards returning, and it lands on a
pet system that is now cheap to extend.

**Growth is redrawn maps, not a scale multiplier.** This is the whole design
constraint and it is not negotiable — it is the same lesson as the density
collapse in 3b/7b. A sprite's apparent pixel size *is* its scale, so rendering
the 9×7 cat at `size={4}` is not a bigger cat, it is the same cat with bigger
pixels next to a person whose pixels didn't change. Growth means a map with
*more cells* at the same `ART_PX`. Budget three sizes:

| stage | cells | px at ART_PX | vs. a person |
|---|---|---|---|
| young | 7×5 | 21×15 | 0.21× |
| grown (today's art) | 9×7 | 27×21 | 0.29× |
| full | 11×9 | 33×27 | 0.38× |

Three maps per pet × four pets = twelve, plus two walk frames each. That is the
real cost of this feature and it is mostly drawing. Stop at 0.38×: a companion
taller than half its owner stops reading as a pet.

**Derive the level, don't store it.** Same instinct as the rotation (item 11)
and for the same reason — a stored counter is a thing to migrate, resync and
reconcile, and it can disagree with the history it is supposed to summarise.
Total focus minutes already exist in `sessions`/`session_participants`, and
`lib/useStats.ts` already reads them. `level = f(totalFocusMinutes)` needs no
new column, cannot drift, and is automatically right for existing users on the
day it ships — everyone's back catalogue counts.

Open questions worth settling before drawing anything:

- **Per user or per pet type?** Per user is one number and reuses the stats
  that exist. Per pet type means a real table and makes switching pets cost
  progress, which is either the point or a punishment depending on taste.
- **Does your partner see your pet's level?** They see the pet already
  (`pet_changed` relays the type). If growth is only local, two people in the
  same room see different animals, which is the same class of bug the world
  rotation exists to prevent. So the level has to travel with the pet in
  session state, which means the server derives it too — and the server has the
  service key and the same rows, so that is cheap.
- **What are the thresholds?** Wants to be slow enough to mean something and
  fast enough that a new user sees one change. First growth inside a week of
  ordinary use is a reasonable target.
- **Does it interact with premium?** Pets are the one thing actually gated
  today (`PetPicker.tsx:20,34`), so levelling is currently a premium-only
  feature by accident. Worth deciding deliberately — see item 2.

Prerequisite: none. #39 put both sprites on string maps, so adding sizes is
adding maps to `lib/petMaps.ts` and a selector, not touching a component.

---

## Also worth knowing

- **Free assets:** palettes yes, sprites no. A Lospec ramp is zero bytes, no
  licence risk (CC0 needs no attribution), and hands you the hardest thing to do
  without training. CC0 sprite tilesets are cheap and tiny too, but the avatar
  recolours at runtime from user-chosen hex, which a flat PNG can't do without
  canvas tinting — and dropping an asset artist's characters next to hand-coded
  scenery trades "inconsistent within one style" for "two styles".
- **There are no image assets at all.** `client/public/` holds six SVGs, five of
  which are untouched Next.js starter files (`file.svg`, `globe.svg`,
  `next.svg`, `vercel.svg`, `window.svg`). Every pixel is generated at runtime.
  Nothing mangled the art — there was never an art *system*.
- **Accessibility:** 12 `aria-*` attributes total across ~85 buttons, with
  icon-only controls unlabelled.
- **Test coverage:** `useAuth.ts` is 234 lines gating every screen transition
  and has no tests.
- **Unverified in the browser:** everything from PRs #26–#30. #35/#36 were
  checked by hand on localhost 2026-08-12 — characters no longer float, walk
  reads clean; pets and the jump/float/controller keyframes were *not* looked
  at (pets are premium-locked, the rest need a two-account session). Still
  worth checking: tick a partner's shared goal and confirm the "✓ by" byline
  sticks; mute mid-jingle then reload; background a session tab 90s and
  confirm you're still in it.
