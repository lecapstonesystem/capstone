# Panel revisions → what's built (as of Oct 29, 2026)

Every item the panel wrote down, where it lives now, and how to show it
in 30 seconds during the re-demo.

## System items

### "Provide validation for each module"
| Module | Validation (where it runs) |
|---|---|
| Applications | API checks member exists, amount/term sane (`POST /applications` → 422 on bad input); eligibility engine enforces coop rules (max 2 simultaneous loans,Regular ≤ 2× capital share, new members wait 2 months / 80% first loan,emergency ≤ 20k alongside a regular) |
| Review (approve/reject) | Status transitions are guarded — only PENDING→APPROVED/REJECTED and APPROVED→RELEASED are allowed; anything else is refused, history can't be corrupted |
| Eligibility | `POST /eligibility` returns eligible + human-readable reasons — the same engine the form uses |
| Payments/receipts | `POST /receipts/parse` cross-checks an OCR'd receipt against the expected amortization amount (tolerance ±₱1) before crediting |
| Analytics inputs | Every payload reports `n_loans_analyzed` + `caveats[]` — thin data is labelled, never silently trusted |

**Show:** submit a bogus application (unknown member / amount 0 / term 0)
→ clear error, nothing filed.

### "Transactions should not be duplicated easily"
- **Duplicate-application guard (NEW):** same member + amount + term,
  same day, first application still PENDING or APPROVED → the API returns
  the FIRST application's id. Idempotent: double-clicked Submit files one
  application, not two. (`submit_application` in `scripts/ucms_analytics.py`)
- Review transitions are one-way (guarded above) — an approved loan can't
  be re-approved.
- Every loan carries a canonical `loan_key` (member|amount|term|date) —
  double-imported rows collapse to one in all analytics.

**Show:** submit the same application twice → same `app_id` returned,
`GET /portal/applications` shows one row.

### "Provide more data visualization" + "Data Analysis & Forecasting
must be present"
Both answered by the **Analytics Lab** (Reports page), now live on the
real register:
- Interactive charts — hover (or tap, on phones) for exact numbers:
  forecast with trusted range, guess-vs-reality backtest, year × month
  heatmap, member borrowing cycles.
- Backtest scorecard (4 models, honestly scored on hidden months),
  forecast with empirical 95% band, seasonality indices, member cycles,
  propensity ranking, reliability buckets, probability-weighted
  collections, auto-insights.
- All of it served by the deployed Python API
  (https://capstone-fipk.onrender.com/docs) — data analysis AND
  forecasting, not just charts.

**Show:** Reports → Analytics Lab → hover the forecast chart → "the
number on the card is the winner of a backtest, not a guess."

## Thesis-document items

### "Use appropriate symbols for the diagrams (flowchart)"
Cheat-sheet to apply on every flowchart page:
- **Oval** = start / end
- **Rectangle** = process / action ("Release loan")
- **Parallelogram** = input / output ("Display member list")
- **Diamond** = decision — exactly TWO exits, labelled (Yes/No or
  Approved/Rejected). If more than two outcomes, chain diamonds — never
  add a third arrow to one diamond.
- **On-page connector** (small circle, lettered) = flow continues
  elsewhere on the SAME page.
- **Off-page connector** (banner/tag shape, lettered) = flow continues
  on ANOTHER page. Use this between "Member Portal" and "Admin Portal"
  diagrams instead of a long wrapping arrow.
- Keep arrows single-direction, left-to-right / top-to-bottom where
  possible; label every decision exit at the arrow, not inside the box.

### "Follow correct spacing & alignment"
- One grid: every shape on a page shares the same column center-line;
  equal vertical gaps (e.g. 1.2 cm) between consecutive shapes.
- Connectors leave shapes from edge midpoints (top/bottom for vertical
  flow, left/right for horizontal) — never from corners.
- Same-size shapes for the same symbol type across the whole paper.
- Labels centered inside shapes; arrow labels outside, above the line.
- Page numbers / continuation letters on every on-page and off-page
  connector pair (A→A, B→B).

### "Clarify the policy of the Cooperative, then apply to Types of
Borrowers"
Draft text (from the client interview rules encoded in
`check_eligibility` + the actual register):

> **Cooperative lending policy.** Membership is a prerequisite for any
> loan. A member must complete two (2) months of active membership before
> their first release, and may hold at most two (2) simultaneous loans.
> Loanable amounts are anchored to the member's capital share: Regular
> loans are capped at twice (2×) the capital share, or 100% of it when
> the share is below the cooperative's threshold. Emergency loans are
> capped at ₱20,000 and may be released alongside an existing Regular
> loan. All loans follow a diminishing-balance amortization schedule
> with terms of 1–24 months.
>
> **Types of borrowers observed in the register (147 loans).**
> *Regular borrowers* (127 loans, 86%) — members financing everyday
> needs or business capital under the standard terms above; terms range
> from 1 to 24 months, most commonly 6–12 months. *Emergency borrowers*
> (20 loans, 14%) — members in urgent need (medical, calamity) availing
> of the capped, faster-release emergency line. By repayment behaviour,
> 96% of recorded loans are marked fully repaid; completion is highest
> among short-term loans (98.3%) and slightly lower for long-term ones
> (92.7%) — consistent with the policy's tighter caps on longer exposure.

Adjust wording to match the coop's official manual if the panel has one.
