Red Tape Simulator — Progression Design
Structure Overview
The game is organized into 3 Departments, each with 4 Ranks. Each rank consists of roughly 3–5 shifts before promotion eligibility unlocks. That gives you approximately 36–60 shifts of content before the Supervisor mid-game — which at 10–15 minutes per shift is 6–15 hours of pre-supervisor gameplay.

DEPARTMENT 1: DMV (Driver & Vehicle Services)

Rank 1 — Clerk Trainee
Theme: Learn the basics. Everything is handed to you cleanly.
Mechanics introduced:

2 documents per citizen (e.g., Photo ID + completed Form DL-1)
Simple binary decisions: approve or deny
No tricks, no missing docs, no bad actors
Tutorial guidance visible on screen

Request types:

New driver's license application
Address change on file

Citizen behavior: Cooperative, patient, prepared
Shift goal: Hit accuracy threshold (e.g., 80%) to pass
Promotion trigger: 3 consecutive clean shifts

Rank 2 — Clerk I
Theme: More documents, more things to cross-reference.
Mechanics introduced:

3–4 documents per citizen
Documents must be cross-referenced against each other (name on ID must match name on form, DOB must match system record)
Minor edge cases: expired documents, name typos
First appearance of the "flag for review" option

Request types:

License renewal
Vehicle registration (new)
Name change on license (requires court doc)

Citizen behavior: Mostly cooperative; occasional confused first-timer
Shift goal: Accuracy + throughput (serve N citizens per shift)
Promotion trigger: 3 shifts above performance threshold

Rank 3 — Clerk II
Theme: People start playing games. Documents go missing. Money appears on the desk.
Mechanics introduced:

Missing documents — citizen didn't bring everything; player must issue a "Return Notice" with the specific missing item listed
Bribe attempts — cash slipped under a form, gift card "left behind," verbal offer; player chooses to accept, reject, or report
Inconsistent documents — address on ID doesn't match proof of residence; player must decide if it's a typo or a red flag
First appearance of supervisor memos mid-shift changing a rule

Request types:

Out-of-state license transfer
Commercial driver's license (CDL) application
Duplicate title request

Citizen behavior: Mix of legitimate edge cases, forgetful citizens, and first bribe attempts
Shift goal: Accuracy + zero unresolved misconduct flags
Promotion trigger: Performance threshold + at least 1 correctly handled bribe situation (accept or report — just not ignore)

Rank 4 — Senior Clerk (Pre-Promotion)
Theme: Full DMV complexity. You're being evaluated for transfer.
Mechanics introduced:

Cross-department flags appear in citizen records (e.g., unpaid parking tickets blocking renewal)
Proxy requests — someone handling paperwork for another person; requires authorization form
Forged documents — subtle visual tells on fake IDs or altered forms
Time pressure increases — SLA violations start mattering more
Performance review at end of rank: supervisor reads your file aloud, comments on patterns

Request types:

Registration renewal with outstanding violations
Handicap placard application
Fleet vehicle registration (multi-doc, multi-vehicle)

Promotion event: A formal "transfer memo" arrives. You're being moved to the Building Permits department. A small ceremony. A new desk.

DEPARTMENT 2: Building Permits
Tone shift: Higher stakes, longer forms, angrier citizens. Property and money are involved.

Rank 1 — Permits Assistant
Theme: New department, back to basics. Same onboarding arc but faster.
Mechanics introduced:

2–3 documents (permit application + property deed + ID)
New document types to learn (site plans, zoning certificates)
Department-specific rulebook issued at start

Request types:

Residential fence permit
Shed/outbuilding permit

Citizen behavior: Cooperative homeowners; some confusion about which form they need
Shift goal: Accuracy (slightly higher bar than DMV Rank 1 since player is experienced)

Rank 2 — Permits Clerk
Theme: More complexity, contractors enter the picture.
Mechanics introduced:

Contractor license verification — must check license number against the system
Zoning cross-reference — permit type must match the property's zoning classification
Incomplete site plans — drawings missing required elements; player issues correction notice

Request types:

Residential addition permit
Home-based business permit
Contractor registration

Citizen behavior: Contractors who know the system (and try to exploit it), homeowners in over their heads

Rank 3 — Permits Officer
Theme: Money, politics, and pressure. Citizens are now sometimes businesses.
Mechanics introduced:

Variance requests — citizen wants an exception to zoning rules; player must escalate (cannot approve unilaterally)
Bribe attempts escalate — now includes envelopes of cash, future "favors," veiled threats about going to the city council
Interdepartmental blocks — Code Enforcement flags appear in records; can't issue permit over an active violation
Rush applications — citizen pays expedite fee, expects faster processing; creates throughput pressure

Request types:

Commercial renovation permit
Change of use application (e.g., converting retail to restaurant)
Demolition permit

Citizen behavior: Business owners, developers, and the first recurring "shady contractor" NPC type

Rank 4 — Senior Permits Officer (Pre-Promotion)
Theme: You're handling the complicated ones everyone else escalates.
Mechanics introduced:

Multi-permit projects — one citizen, multiple linked applications that must be approved in sequence
Environmental review flags — certain permits trigger mandatory review; player must identify and route correctly
Appeals — citizens return to dispute a previous denial (from your record or a predecessor); player reviews their own or others' past decisions
Performance review with interdepartmental report card

Promotion event: Transfer to Code Enforcement. The memo notes your "attention to regulatory detail." Your old DMV citizens have aged. Some are back.

DEPARTMENT 3: Code Enforcement
Tone shift: You're now the one going to citizens, not just receiving them. Reactive and investigative feel. Higher moral complexity.

Rank 1 — Code Inspector Trainee
Theme: Learn the violation types. Cases are clear-cut.
Mechanics introduced:

Case files replace walk-up citizens — you receive a complaint file, review photos and documents, and issue a finding
2–3 documents per case (complaint form + property record + photo evidence)
Simple violations: obvious junk in yard, unpermitted fence

Request types:

Neighbor complaint (noise/visual blight)
Unpermitted structure (clear-cut case)

Citizen behavior: Complainants and respondents both present their side in written statements

Rank 2 — Code Inspector I
Theme: He-said/she-said starts. Documents conflict.
Mechanics introduced:

Conflicting statements — complainant and respondent tell different stories; photos are the tiebreaker
Permit history cross-reference — was that structure ever permitted? Check Building Permits records
Correction orders — instead of fines, sometimes you issue a 30-day correction notice

Request types:

Unpermitted addition
Parking on property violations
Signage violations (business)


Rank 3 — Code Inspector II
Theme: Organized interests. Landlords. Retaliation complaints. The system starts feeling unfair.
Mechanics introduced:

Landlord/tenant dynamics — tenant files complaint against landlord who is also a frequent permit applicant; your history with them matters
Retaliatory complaint flag — system lets you tag a complaint as potentially retaliatory
Repeat violators — citizens with long violation histories; player decides between escalation or last-chance notice
Bribe attempts at peak intensity — now includes third parties ("a friend of a friend") making offers on someone's behalf

Request types:

Habitual violator review
Tenant habitability complaint
Commercial property code violation


Rank 4 — Senior Code Inspector (Pre-Promotion)
Theme: The hardest cases. Moral gray areas. Politics visible in the margins.
Mechanics introduced:

Politically sensitive cases — flagged files with a note from above suggesting "careful review"; player decides whether to apply rules equally
Joint cases — involves Building Permits AND DMV records simultaneously
Whistleblower option — player can flag internal irregularities they've noticed over their career; consequences TBD in mid-game
Final performance review — covers your entire career arc across all 3 departments

Promotion event: You're promoted to Supervisor. A plaque. A slightly nicer desk. Three employees who are already annoyed at you.

Promotion Metrics (Consistent Across All Ranks)
Each rank tracks the same core metrics, with weights that shift by department:
MetricDMV WeightPermits WeightCode WeightAccuracy50%45%40%Throughput20%20%15%Customer Sentiment30%25%20%Integrity (bribe handling)TrackedTrackedTracked + weighted 25%
Promotion requires hitting the threshold and clearing any open misconduct flags. You can be stuck at a rank if you have unresolved issues — which creates the satisfying feeling of earning it.