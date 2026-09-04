# Data Protection Impact Assessment

**System:** Office Carpool — internal ride sharing
**Assessed against:** Personal Data Protection Act 2026 (Bangladesh)
**Date:** 2026-09-04 · **Status:** Draft for the data protection owner to sign
**Owner:** *(unassigned — see "Before launch")*

> This is a working DPIA prepared alongside the build. It is not legal advice and
> has not been reviewed by counsel. The organisation's data protection owner must
> review, complete the unassigned sections, and sign it before colleagues use the
> system with real data.

---

## 1. What the system does

Colleagues who drive to work publish the journey they are already making;
colleagues going the same way ask for a seat and share the fuel cost. It runs
inside Microsoft Teams, authenticated by the existing Entra ID session. There is
no separate account and no self-registration.

Roughly 150 staff, of whom perhaps 25 drive. Voluntary participation.

## 2. Why it processes personal data

| Purpose | Lawful basis |
|---|---|
| Match a rider to a driver on the same route | Legitimate interest of the organisation in reducing commuting cost and congestion, with explicit consent recorded at first launch |
| Show a driver who has asked for a seat | Necessary to perform the arrangement the colleague asked for |
| Release a phone number after a booking is confirmed | Explicit consent, given per booking by confirming |
| Record who owes whom | Legitimate interest; settled outside the system |
| Safety incidents | Legitimate interest in colleague safety; overrides the ordinary retention period |

## 3. What is processed

| Data | Source | Sensitivity | Retention |
|---|---|---|---|
| Name, email, department, office | Entra ID directory | Low | While employed |
| Photo | Directory | Low | While employed |
| Phone number | Directory, **masked by default** | **Medium** | While employed |
| Journey zone pairs and times | Entered by the colleague | **Medium** | 90 days, then aggregate only |
| Bookings, cost shares, ledger entries | Generated | Low–medium | 90 days, then aggregate |
| Counterfactual travel mode | Asked at booking | Low | 90 days, then aggregate |
| Ratings | Colleagues | **Medium** | 90 days, aggregate display only |
| Incident reports | Colleagues | **High** | 3 years |
| Audit log | Generated | Medium | 1 year |
| Consent records | Colleague | Low | While employed + 1 year |

**Not processed:** continuous location, GPS traces, home addresses, vehicle
registration beyond the last four characters, payment or bank details.

### The commute-pattern problem, stated plainly

The system does not store a home address. But a recurring commute profile that
starts in Uttara at 07:45 every working day **is** a statement about where
someone lives and when their home is empty. Zone-level granularity (a
neighbourhood, not a street) is the mitigation, and it is a real one — but it is
a reduction in precision, not an elimination. Anyone with legitimate access to
the ride list can infer a colleague's rough neighbourhood and daily pattern.

That is inherent to carpooling and cannot be designed away. It is why
participation is voluntary, why access is limited to the organisation, why
profiles can be deactivated instantly, and why this is stated in the privacy
notice in plain language rather than buried.

## 4. Risks and mitigations

| # | Risk | Severity | Mitigation | Residual |
|---|---|---|---|---|
| DP-01 | **Phone number exposed before it should be.** In the legacy workbook a colleague typed their number into the free-text *name* field, visible to every reader, with no consent and no masking. | High | Structured field, masked by default, released only after a confirmed booking, every reveal audit-logged. No free-text field accepts contact details. | Low |
| DP-02 | Commute pattern reveals neighbourhood and daily routine | Medium | Zone granularity only; voluntary; instantly deactivable; stated in the notice | **Medium** — inherent |
| DP-03 | Women-only rides are identifying at this headcount. With ~25 drivers, a women-only ride on a given route may identify the driver to anyone who knows the organisation. | Medium | Preference is opt-in and the colleague is told what it reveals before setting it | Medium |
| DP-04 | Ratings used to single someone out | Medium | Aggregate display only; never attributed; minimum count before an average shows | Low |
| DP-05 | Retention drift — data kept because nobody deleted it | Medium | Automated deletion on schedule, not a manual task; the job logs what it removed | Low |
| DP-06 | Over-broad admin access | Medium | Admin role from the directory; every admin action audit-logged | Low |
| DP-07 | **Third-party routing.** Enabling the Google Directions adapter would send journey endpoints outside the tenant. Over weeks that accumulates into a record of where staff live and when they leave home. | High | **Not enabled.** Routing is computed locally by default. Enabling requires this DPIA updated and a `routing:third-party` consent scope. See [ADR-002](ADR-002-routing.md). | **Not applicable while disabled** |
| DP-08 | Safety incident reveals a complainant to the person complained about | High | Incidents visible only to admins; declines are silent and never attributed | Low |
| DP-09 | Export leaves the tenant. The .xlsx contains names, departments and journeys. | Medium | Generated on demand by an admin, audit-logged, never scheduled or emailed automatically | Medium — depends on the handler |

## 5. Colleagues' rights

| Right | How it is served |
|---|---|
| Be informed | `PRIVACY_NOTICE.md`, in English and Bangla, shown at first launch |
| Access | Self-service export of everything held about them |
| Rectification | Directory fields at source; journey data editable in the app |
| Erasure | Self-service. Ledger entries are anonymised rather than deleted, so the counterparty's own record stays coherent |
| Withdraw consent | Any time. The profile deactivates and no further rides generate |
| Object to automated decisions | None are made. Matching ranks and suggests; a person accepts or declines |

## 6. Security

- Identity from Entra ID. No password held by this system.
- PII encrypted at rest; transport TLS throughout.
- Phone numbers masked in every view until a booking is confirmed.
- Every mutation carries an audit entry with actor, before and after.
- No secrets in the repository. Keys come from the environment.

## 7. Before launch — outstanding

These must be closed by the organisation, not by the build:

1. **Assign a data protection owner.** This document is unsigned.
2. **Legal review** against the PDPA 2026 as commenced, including whether
   legitimate interest is the right basis for matching or whether consent alone
   should carry it.
3. **Confirm the retention periods** are consistent with the organisation's
   existing schedule.
4. **Decide DP-03** — whether the women-only preference should ship at this
   headcount given what it reveals.
5. **Decide DP-09** — who may run an export and what they may do with the file.
6. **Do not enable Google routing** without returning to DP-07.
7. **Translate this document into Bangla** alongside the privacy notice.

## 8. Review

On any change to what is collected, any new third-party recipient, any retention
change, any incident, and annually regardless.
