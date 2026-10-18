# Pitch deck

Slide-by-slide content for the required PDF deck, 16:9. Built by `build/build-deck.py`
(one spec renders `ResponseCompass-deck.pptx` and `ResponseCompass-deck.pdf`; see
`build/README.md`). Revised 2026-10-18 (user direction): the interface is presented as
command-center monitoring and control of a system that runs autonomously, with people
approving or overriding the decisions that matter.

Style: the app's light theme (Inter, dark navy text, teal accent, amber for people and
alerts, off-white background). No company logos. Diagrams are native PowerPoint shapes
with connectors glued to their nodes.

| # | Slide | On slide | Status |
|---|---|---|---|
| 1 | Cover | ResponseCompass · "The right responder. The right fix." · "Learned from every past repair." · "Runs autonomously. Supervised by your control room." · floor-map wall screen | built |
| 2 | The problem | Closest ≠ best; the first fix tried is often a guess; backlogs force overtime decisions; knowledge lives in heads and old tickets | built |
| 3 | One agent, many screens | Six live wall screens, one panel per monitor: floor map, issues, dispatch, event feed, Issue Pareto, analytics | built (screens from 3200) |
| 4 | Autonomous by default, human in command | Native loop diagram: issue → Compass ranks responders → offer → responder → Compass ranks fixes → repair attempt → observed history → back to ranking; central command overrides; backlog review → Compass ranks overtime → central command approves or rejects | built |
| 5 | Code owns the facts. Models only rank. | Architecture diagram (native connectors) | built |
| 6 | Honest by design | Hidden responder skill and hidden fault cause; baselines incl. most common fix; denominators; excluded inputs | built |
| 7 | The right responder | A live MiMo responder ranking, end to end, vs nearest and naive baselines | needs the new 3200 capture |
| 8 | The right fix | A live MiMo fix ranking: symptom, ranked procedures, evidence table, baseline, applied fix and outcome | needs the new 3200 capture |
| 9 | Overtime, approved by people | Backlog review → lawful options → Compass ranking → central command approves/rejects; nothing applied without a decision | needs codex round 9 |
| 10 | Where the downtime comes from | Issue Pareto screen: bars + cumulative line + 80% marker + donut; class → symptom → applied fix | built |
| 11 | A month of operations | 3,512 issues, 1 Sep–6 Oct; September 2,966 raised / 2,985 resolved; first-time fix 73.5% (1,858/2,527); weekly 67.1 / 74.9 / 76.5 / 75.6% (not a steady climb) | built |
| 12 | Built on AMD Token Factory | MiMo-V2.6-Flash ranks responders, fixes and overtime; provider controls; recorded validity checks; lane keeps the clock moving | built |
| 13 | Engineering quality | Test counts after round 9 | counts updated at build |
| 14 | What's next | Real CMMS / ticketing / rostering integration; learn from approvals; longer live measurement; long-run storage | built |

## Speaker notes (key points)

- **3:** each panel is a URL (`/rooms/<room>/display/<screen>`) that updates live; the
  operator console, with override and approval controls, is the seventh screen.
- **4:** code runs the loop; AMD models only rank what code supplies; amber steps are
  human decisions. Overtime is never applied without central command (or an explicit,
  audited room policy).
- **7–8:** one good outcome is not proof of better performance; disagreements with the
  baselines are recorded for review. Report the capture's valid/fallback counts.
- **10:** the Pareto describes recorded work; it does not rank people or claim causation.
- **11:** generated offline with the app's own engine and deterministic fallbacks; not an
  AMD-only benchmark or a controlled comparison.
- **13:** a live AMD check found a defect the hermetic tests could not (the fix ranking
  never reached the provider); it is fixed and covered by a test.
