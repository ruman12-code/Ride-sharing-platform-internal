# ADR-003 — The name, and how attribution is handled

- **Status:** Accepted
- **Date:** 2026-09-04

## Context

"Office Carpool" described the category but was not a name. It gave colleagues
nothing to say to each other, and it would have read as a generic internal
utility in any pitch to management.

There was also a second, unusual requirement: the colleague who built this
wanted their name present in the product — visible, but placed so it reads as
craft rather than as a claim on something the organisation is meant to adopt.

## Decision

### The name: **Ekpothe** (একপথে)

Bangla for *"on one path"*. Three reasons it beat the alternatives:

1. **It describes the mechanism, not the category.** The product's whole job is
   working out that two people are travelling the same way. "Ekpothe" says that.
2. **It is pronounceable in both languages.** Colleagues who read no Bangla can
   still say it, which "Shohojatri" — the more precise word — makes harder.
3. **It survives a management pitch.** It sounds like a product rather than a
   spreadsheet replacement, which matters when the ask changes from "try this"
   to "adopt this".

Rejected: **Shohojatri** (সহযাত্রী, "fellow traveller") — the most accurate and
most dignified, but the hardest for non-Bangla speakers to say aloud, and a name
people cannot say is a name they do not pass on. **Rawnaa** (রওনা, "setting
off") — energetic but describes departure rather than sharing. **Seatmate** —
safe, English, and forgettable.

The wordmark pairs the name with its meaning — *Ekpothe · on one path* — so the
Bangla carries for readers who do not know it.

### Attribution: an acrostic strapline, plus a credit line

The five lines of the English strapline open with **R, U, M, A, N**:

> **R**ide together, not alone.
> **U**se one car instead of three.
> **M**eet the colleagues you never see.
> **A**rrive on time, more often.
> **N**o fares — just fuel, shared fairly.

Each line had to earn its place as product copy on its own terms. An acrostic
whose lines exist only to supply a letter is obvious, and reads as vanity rather
than craft — which would defeat the purpose. These five are the five reasons to
use the product; the initials are a consequence.

Alongside it, on the About panel and in the footer: **"Built for us, by Ruman."**

"For us" before "by" is deliberate. It frames the work as something done for
colleagues rather than something owned, which is the framing most likely to
survive the transition from a personal side project to an organisational tool.

### Accessibility

The acrostic is a visual device, so it must not cost anyone the sentence. Each
line carries the full text in a screen-reader-only span, with the split halves
marked `aria-hidden`. A screen reader hears "Ride together, not alone." — one
clean sentence, never a letter followed by a fragment.

An end-to-end test asserts both: that the initials still spell RUMAN, and that
the spoken text is the whole sentence.

### Why there is no Bangla acrostic

রুমান is র‑উ‑ম‑া‑ন. The fourth character, া, is a vowel sign that cannot begin a
word, so the device is not reproducible in Bangla script.

Rather than bend the Bangla into something awkward for a trick most readers
would never see, the Bangla strapline is simply good copy that says the same
thing: *একই পথে যাচ্ছেন? একসাথে যান, খরচ ভাগ করুন।* — "Going the same way? Go
together, share the cost."

This is the right trade. Bangla is a first-class language in this product, not a
translation layer, and treating it as a constraint to work around would
contradict that.

## Consequences

- If the organisation adopts Ekpothe formally, the credit line is a single
  string in `i18n.ts` and the strapline is one component. Neither is entangled
  with anything else, so a rebrand is a small change rather than a rewrite.
- Should the acrostic ever be edited, the E2E test fails until the initials
  still spell the name — so it cannot be broken silently by a copy tweak.
