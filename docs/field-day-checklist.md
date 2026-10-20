# Field day checklist — encoding real members at the coop

Goal: a small batch of real members entered **once and correctly**, verified
against the paper sheets and demonstrated to the staff. Not the highest row
count — trust in the data is the deliverable.

## Before leaving

- [ ] Live site opens and is on the latest push: https://ucms-admin.pages.dev (log in, F5).
- [ ] Test member KHS-0092 cleaned up (typed-confirmation delete; `member`/`loan` rows = 0; audit line present).
- [ ] Migrations 23, 24 and 25 run in the SQL Editor (notification delete fix, co-maker names, work email column).
- [ ] Agree who types and who verifies — or split by member-number ranges and refresh between batches.
- [ ] Bring: survey forms, consent forms, this checklist, notebooks.
- [ ] Decide who asks the money questions and who writes the answers down.

## Conventions (agree before typing)

- Names: First / Middle / Last separately. **Comma on the paper = surname first** ("Macayan, Nenita" = Last: Macayan, First: Nenita).
- Phone: exactly 11 digits (09XXXXXXXXX).
- Email: two boxes on the form.
  - **Personal email** — the app login. Only if the member actually gave
    one; **leave blank otherwise; never invent placeholders**.
  - **Work email** — the address written on the paper sheet (usually
    `@deped.gov.ph`). Record only; it is never used to sign in or send
    reset links. Leave blank if the sheet has none.
- Address: the member's **present/current** address (v1.0 holds one address).
- Birthday from the sheet (date picker), Gender + Civil Status likewise.
- Married → spouse name required by the form.
- Capital: record only what the sheet proves was paid. Unclear history → ask staff, don't guess.
- Corrections are edits with a written reason (audit line). There is no delete.

## At the coop — run of show

1. Short walkthrough for the staff — let them search a member, record a payment,
   print a data sheet. Note what confuses them.
2. Entry batch, one record at a time:
   - search the list first (not already encoded?),
   - typist reads the sheet and types,
   - verifier reads back member no., full name, birthday, contact, personal email, work email, capital.
3. Print 2–3 data sheets and compare field-by-field with the paper originals.
4. Ask the money questions below; write the answers and **who said them**.
5. Run the survey — signed, complete.
6. If a member wants app access and has a working **personal** email: Issue
   Credentials, write the one-time password on paper, and verify one real login
   works before issuing more. Never invent an email to get past this, and never
   use the DepEd address as the login.

## Money questions (they unblock the defense)

- [ ] Interest: 1.5% per month — on declining balance or original principal? Any document stating it?
- [ ] Terms: what range is actually allowed — 1 to 36 months? (The paper's old text said 2–6.)
- [ ] Penalty: exact late-payment formula (rate, per day or per month, minimum).
- [ ] Capital share: 15k new / 20k old — still the rule?
- [ ] What did staff expect the system to do that it doesn't? (Write it down for v1.1.)

## Before leaving

- [ ] Counts recorded: "N members encoded, verified by ___."
- [ ] Issue list written: every bug or confusion, with steps to reproduce.
- [ ] Audit log spot-check: today's entries show the acting admin.
- [ ] Survey forms signed and collected.
- [ ] No screenshots of member data anywhere (private PII). UI shots with test data only.
