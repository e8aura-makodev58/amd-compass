# Compass — Application Defense Guide

## 1. What Compass is

Compass is a synthetic operational-control-room application. It simulates equipment issues, responder availability, shift continuity, dispatch, repair outcomes, and operational history across independently selectable Control Rooms. Its purpose is to demonstrate a disciplined decision-support workflow:

1. The application decides which unresolved issue may receive the next available capacity.
2. Compass evaluates only the eligible responders supplied for that one issue.
3. The application validates the recommendation and owns the offer, assignment, outcome, audit, and persistence.

Compass is not an HR system, payroll system, production scheduler, real-world overtime system, predictive-maintenance system, or autonomous plant controller. All people, facilities, equipment, locations, records, and outcomes are synthetic and domain-neutral.

## 2. The two “agents”: an essential distinction

| Component | Purpose | Deterministic? | May use an LLM/provider? | May mutate canonical state? |
|---|---|---:|---:|---:|
| Synthetic Data Simulator / Event Planner | Creates bounded simulated issue opportunities and narrative descriptions; advances the synthetic operating environment. | Yes for clock, cadence, eligibility, fallback event, caps, state transitions, and outcome streams. | Optionally, only to propose one bounded event/narrative from public constrained context. | No model may mutate; validated application code does. |
| Compass Recommendation Agent | Ranks the already eligible responders for one selected issue and explains qualitative tradeoffs. | Eligibility, evidence, baselines, validation, fallback ranking, and final dispatch are deterministic. The provider’s ranking text/order may be non-deterministic. | Optionally, for a bounded structured ranking of supplied candidates. | No. The application revalidates then creates offers/assignments atomically. |
| Application / control-room runtime | Canonical source of truth. It owns simulation time, queue priority, staffing, shifts, candidate packets, RNG, state writes, validation, audit, and analytics. | Yes, given persisted state and RNG streams. | No dependency on a provider for correctness. | Yes, through serialized atomic mutations only. |

The defense point is simple: **Compass is decision support inside an application-owned safety envelope, not an autonomous decision maker.** Provider output can be unavailable, malformed, stale, or rejected; the simulator and dispatch workflow remain valid because deterministic fallbacks exist.

## 3. Trust boundary and hidden truth

Each synthetic responder has hidden `ResponderSkill` values by issue class: a true median repair duration and true success probability. They make the simulator realistic, but are never shown to operators, analytics, the event planner, Compass, audit prose, queue priority, or workforce staffing logic.

Public evidence is derived only from observed resolution history: case count, weighted median resolution time, success rate, reopen rate, and evidence strength. Small samples may disagree with hidden truth; that is intentional. It demonstrates uncertainty rather than presenting simulation internals as a human-performance score.

The public API is allowlisted. It redacts hidden skills, internal probability draws, attempt work factors, contributor weighting, credentials, and arbitrary raw event payloads. Provider credentials remain server-side.

## 4. Architecture and state model

### 4.1 Control Rooms

The directory contains **Plant #1** and **Plant #2**. Each room has independent:

- Live and Offline runtime state;
- simulation clock and persisted RNG streams;
- equipment, personnel, issues, assignments, attempts, event history, and analytics;
- workforce calendar, deferred demand, and scenario state.

Room display names can be changed from **Control Rooms**. IDs, labels, registry membership, and storage identity are stable. Multiple people may view the same room: the server is canonical, browser state polls about every 1.5 seconds, mutations are serialized, and stale revisions receive explicit conflicts rather than silently overwriting another operator.

`READY`/`FAILED` describes room boot health. `RUNNING`/`PAUSED` describes the simulation clock. One failed room is isolated and does not block another ready room.

### 4.2 Persistence and restart behavior

The application persists versioned canonical JSON state using serialized clone/mutate/validate/atomic-rename writes. The event feed is audit history, not a mechanism for reconstructing truth. A restart resumes at the stored simulated time: it does not add wall-clock catch-up events while the service was off.

Due work uses durable tokens. A scheduler claims a token in state before asynchronous activity; a retry cannot legitimately execute the same trigger twice. Startup reconciliation repairs defined derived state only; an unresolvable room is marked unavailable rather than guessed or overwritten.

## 5. Operational flow

```text
Start/resume clock
  → advance simulated time
  → claim due scheduler tokens
  → validated event opportunity (provider proposal or deterministic fallback)
  → create active issue, or deferred-demand ledger item at cap
  → deterministic queue priority selects next pending issue when capacity exists
  → build bounded eligible-candidate packet and two baselines
  → Compass structured ranking or deterministic fallback ordering
  → application validates recommendation freshness and eligibility
  → one-at-a-time offer → accept/reject/override
  → atomic assignment and event-snapshot responder movement
  → planned resolution / support / transfer / release / force resolve
  → deterministic outcome and observed history
  → resolved, reopened, or one temporary-repair recurrence
  → public audit, map, Station Status, and analytics refresh
```

Shift reviews, handovers, extension expiry, assistance, and temporary-repair obligations travel through the same durable trigger discipline.

## 6. Simulation and workforce behavior

### 6.1 Clock and event cadence

The Live simulation supports **1×, 5×, 10×, and 60×**. For real elapsed milliseconds \(\Delta t_r\) and speed multiplier \(s\):

\[
t_{sim,new} = t_{sim,old} + s\Delta t_r
\]

Paused means no time or scheduled work advances. The normal event cadence is a persisted deterministic draw from **8–25 simulated minutes**. **Trigger Next Event** bypasses waiting only; it still applies normal validation and the actionable-demand cap.

### 6.2 Issue lifecycle and demand ceiling

Active actionable statuses are `PENDING`, `RECOMMENDATION_READY`, `OFFER_PENDING`, and `ASSIGNED`. At most **10** may exist in one room. An eleventh demand opportunity creates a bounded **deferred demand** record instead of an active issue. It is visible only in **Settings → Demo**, carries a demo-cap explanation, and cannot receive a responder or appear in the normal issue/feed workflow.

Normal issue generation prevents another unresolved issue at the same station. The interface still handles multiple active records defensively: it chooses the oldest by timestamp, then ID.

Priority is application-owned:

\[
P(i)=
\begin{cases}
\text{Critical}, & risk=serious \text{ or impact}\ge80\\
\text{High}, & complexity=complex \text{ or impact}\ge45 \text{ or age}\ge8h\\
\text{High}, & age\ge20h\\
\text{Standard}, & \text{otherwise}
\end{cases}
\]

The queue sorts Critical → High → Standard, then oldest issue, then stable ID. Deferred demand is not a priority band. Models do not set priority.

### 6.3 Shift continuity

Each room models **24 synthetic responders**: four crews of six on a persisted 14-day 2-2-3 rotation. One normal six-person crew is on duty for each 08:00–20:00 or 20:00–08:00 shift. Public names use `EngrNNN`, `TechNNN`, or `OptrNNN`.

Configured operating constraints are:

- normal duty: 12 hours;
- minimum recall rest: 12 hours;
- maximum continuous duty: 16 hours;
- normal active staffing: 6;
- legal surge ceiling: 8 (at most two additional people);
- outgoing-shift extension: up to four hours.

Deterministic staffing reviews occur at 06:00 and 18:00, plus rechecks after `ISSUE_RAISED`, `ASSIGNMENT_RELEASED`, `ISSUE_ESCALATED`, and `RESPONDER_AVAILABLE`. A review prefers a lawful extension; otherwise it may select one lawful off-shift 12-hour call-in, no action, or an unmet-risk record. At 08:00/20:00 handover, lawful work is promoted/transferred where possible; otherwise an explicit replan obligation is recorded. The system never silently duplicates, drops, or fabricates resolution of work.

### 6.4 Repair outcome model

An attempt has a persisted random duration factor \(f\in[0.70,1.30)\), success draw \(u\in[0,1)\), work total \(f\), and one or two roster segments.

For responder \(r\), issue class \(c\), true hidden values \(m^*_{r,c}\) and \(p^*_{r,c}\), observed values \(\hat m,\hat p\), and effective history weight \(w=0.30\min(E/8,1)\):

\[
m_r=(1-w)m^*_{r,c}+w\hat m,\qquad p_r=(1-w)p^*_{r,c}+w\hat p
\]

For one responder, work rate is \(q=1/m_r\) and success probability is \(p_r\). For two responders, fastest rate \(q_1\) and second rate \(q_2\) use synergy \(\alpha=0.60\):

\[
q_{team}=q_1+\alpha q_2
\]

With high/low success probabilities \(p_h,p_l\), team probability is:

\[
p_{team}=\min(0.98,\ p_h+\alpha p_l(1-p_h))
\]

Work accumulates as \(W=\min(W_{remaining},\Delta t\cdot q_{team})\). Segment probability is combined as a work-weighted average. Success occurs when \(u < p_{attempt}\). **Force Resolve** completes remaining work immediately but draws from this same model; it does not guarantee success.

Successful temporary repairs have a deterministic **20%** normal likelihood, or **55%** under the Recurring Temporary Repairs scenario. They schedule exactly one linked recurrence **30–90 simulated minutes** later; they do not create a permanent “reduced MTBF” state or compound generic recurrence weighting.

## 7. Compass decision algorithm

### 7.1 Eligibility and geometry

Only `AVAILABLE` responders are candidates for a new offer. For planar distance \((x_1,y_1)\) to \((x_2,y_2)\):

\[
d=\sqrt{(x_1-x_2)^2+(y_1-y_2)^2}
\]

Travel time uses walking speed \(v=1.4\) metres/second and a 1.5-minute floor-transition cost for \(F\) floor changes:

\[
t_{travel}=\frac{d}{1.4\times60}+1.5F\quad\text{minutes}
\]

### 7.2 Observed evidence

For assisted work, a participant receives contribution share \(a_j\). Observed success/reopen rates use weighted evidence:

\[
successRate=\frac{\sum_j a_j\mathbf{1}(success_j)}{\sum_j a_j}
\]

The median is ordinary when all weights are one; otherwise it is the first sorted duration whose cumulative contribution reaches half of total contribution. Evidence labels are **None** (0), **Weak** (1–2), **Moderate** (3–5), and **Strong** (6+ effective observations).

### 7.3 Baselines and Compass role

Two deterministic comparators make the recommendation auditable:

- **Nearest available:** minimum travel time, including floor transit.
- **Naive score:**

\[
score=100\cdot successRate-2\cdot medianResolutionMinutes-3\cdot travelTimeMinutes
\]

No history defaults to success rate 0 and 60 minutes in the naive baseline. The baseline intentionally ignores evidence strength.

Compass receives only the bounded public candidate packet and may rank the supplied IDs and explain tradeoffs such as travel, observed outcomes, sample strength, uncertainty, and the meaningful alternative. It cannot add candidates, set queue priority, inspect hidden skills, call tools, or mutate data. Strict schema validation rejects invalid IDs or invented fields. After the asynchronous gap, application code checks revision and eligibility again. A provider failure falls back to deterministic candidate ordering.

Offers happen one at a time. Acceptance is an atomic assignment; rejection advances to the next ranking; an operator may override only with a currently eligible responder. Each issue permits one `PRIMARY` plus optional `SUPPORT`; no responder may hold concurrent active assignments.

## 8. Operator guide: screens, labels, and actions

### 8.1 Entry and header

| Label / element | Meaning and action |
|---|---|
| **Choose a Control Room** | Entry picker; opens Plant #1 or Plant #2. Each room is independent. |
| **Live Floor** | Main operational workstation. |
| **Control Rooms** | Directory, room health/mode/status, rename current room, and open another room. |
| **Analytics** | Read-only dashboard from the same canonical room snapshot. |
| **Settings** | Deployment-wide API settings and room-scoped Demo controls. |
| **Agents idle / agent activity** | Activity indicator for the Event Planner and Compass recommendation tasks; it does not mean a model controls the system. |
| **Live Simulation / Offline Demo** | Switches between persistent Live mode and API-free fixed Offline scenario. |

### 8.2 Live Floor controls

| Label / element | Description |
|---|---|
| **Simulation time** | Current simulated timestamp. |
| **State** | `RUNNING` or `PAUSED`. |
| **Speed** | 1×, 5×, 10×, or 60× time multiplier. |
| **Start/Pause** | Starts or pauses simulated-time advancement. |
| **Reset** | Resets the applicable simulation mode under its normal reset rules. |
| **Find in Control Room** | Opens room-local search with `/` or Cmd/Ctrl+K. |
| **Up to 5 matches per category** | Search-result presentation cap, not a search-scope cap. |
| **All / Issues / Equipment / Personnel** | Search filters. Search includes active issues, all equipment, and all personnel including off shift; it excludes resolved history and other rooms. |

### 8.3 Manufacturing Floor

The **Manufacturing Floor** is a three-floor synthetic map. Its legend distinguishes **Normal**, **Issue**, **Available**, and **Assigned**. Floor buttons select floors; **2D** is the default view and **2.5D** provides perspective. Zoom uses controls or +/- keys. Pan requires Space + primary-drag on empty map area; wheel/double-click do not zoom, protecting normal page navigation.

Equipment with active work is highlighted. On-duty people are shown; off-shift people are not placed on the floor. Assigned responders are rendered adjacent to their assigned station at deterministic offsets, not on the equipment coordinate. Personnel labels/highlights appear only on hover or selection. Screen-space bubble labels try upper lanes first, use lower lanes only when needed, and use leader lines to the correct anchor.

### 8.4 Operational work area

| Label / element | Description |
|---|---|
| **Active and waiting issues** | Open actionable issue list. Selecting an entry changes the map to its floor and focuses its station. |
| **Recent event feed** | Selectable public operational chronology: issue, offer, assignment, movement, resolution, and system events. Event detail can be closed to restore the last station context. |
| **Station Status** | Right-side context, not merely “Selected Issue.” An affected station shows issue, baselines, recommendation, offers, staffing and audit context. A healthy station shows healthy state, uptime, observed failures, last issue, and observed MTBF. |
| **Shift Personnel** | On-duty personnel list with status. Off-shift people are in the collapsed **Off shift** disclosure. A row is neutral until hover or selected; selecting focuses the person without replacing Station Status. |
| **Stations** | Affected stations first; healthy stations inside collapsed **Healthy stations**. Selecting focuses the correct floor/station and updates Station Status. |
| **Issue staffing** | Shows 1-of-2 or 2-of-2 roster, support request, release, and eligible central-transfer controls where allowed. |
| **Nearest available / Naive score / Compass** | The two deterministic comparators and bounded Compass recommendation for the selected issue. |

### 8.5 Settings

**API** is deployment-wide. It configures the AMD Token Factory model and thinking level; credentials are server-side. **Refresh available models** obtains a guarded model list; **Save settings** persists the chosen provider configuration.

**Demo** is room-scoped. It contains:

- **Agent activity**: Event Planner and Compass task state;
- **Simulation overrides**: **Trigger Next Event** and **Force Resolve**; Force Resolve is enabled only for a selected assigned issue and still follows normal outcome logic;
- scenario selector: **Normal**, **Elevated demand**, **Personnel shortage**, **Recurring temporary repairs**, and **Auto**;
- workforce outlook, staffing actions, handover records, surge legality, and deferred-demand/cap notice.

At present, Recurring Temporary Repairs changes temporary-repair likelihood. The other scenarios persist selected state but do not alter cadence, staffing, or shift behavior; Auto does not autonomously rotate scenarios.

### 8.6 Analytics

The **Operational analytics** page is a single-snapshot, drill-down dashboard. It presents:

- KPI cards: **Active issues**, **Open downtime**, **Reopen rate**, **Compass recommendations**;
- 24-hour simulated-time charts: **Issues raised**, **Issues resolved**, **Aggregate downtime**;
- **Compass vs Baselines**: agreement with nearest, disagreement with naive, disagreement with both, and evidence-strength-driven differences;
- **Observed issue classes**;
- **Equipment directory** with **Needs attention / All equipment**, search, paging, healthy/attention status, observed issues, and open downtime;
- **Responder issue-response summary** and **Issue-Class Experience** as context, explicitly not an employee ranking.

Rates show numerator/denominator and are marked insufficient below three observations. Completed downtime medians exclude open intervals; ongoing downtime remains visible separately. Analytics does not expose hidden skills or duplicate a second source of state.

## 9. Offline Demo

Offline Demo is not a degraded external service. It is a deterministic, API-free fixture with a fixed issue, candidates, Compass result, baselines, offers, acceptance/rejection, override, audit, and reset behavior. It is used to demonstrate the workflow without credentials, network, provider spend, or unpredictable model behavior.

## 10. Docker operation and health

Compass runs in one hardened Node 22 Docker container on port **3000**. It uses one named persistent volume for room state, metadata, provider settings, audit data, and application events. The image excludes secrets and local state, runs non-root with a read-only root filesystem, separate temporary writable storage, no added Linux capabilities, and no-new-privileges.

The health check calls the control-room directory and succeeds only when every configured room is `READY`. State migration is deliberate: pause if necessary, back up the prior data directory, verify an empty target volume, stop the previous writer, copy state once, start Compose, verify room health/revisions, and retain rollback material. A nonempty state volume is never automatically merged or overwritten.

## 11. Defense questions and concise answers

**Is Compass deterministic?** The application’s state, eligibility, priority, staffing, simulation clock, RNG streams, outcome process, validation, persistence, and fallbacks are deterministic from persisted state. Optional provider rankings/proposed narratives are not assumed deterministic and are never trusted without validation.

**Does Compass choose who should work next globally?** The deterministic queue chooses which actionable issue may receive available capacity. Compass then ranks responders only for that specific issue. It does not perform unconstrained global workforce optimization.

**Can the model send a responder, change a shift, or invent an issue?** No. It can only propose a bounded event or rank an application-supplied eligible list. The backend validates the result and owns all state changes.

**Why retain hidden skill?** It provides controlled synthetic ground truth for repair outcomes. It is intentionally unavailable to Compass and operators so the visible workflow uses observed evidence and uncertainty rather than privileged information.

**Can Force Resolve make the demo look artificially successful?** No. It only accelerates the due time; it uses the same attempt probability and deterministic draw, so a repair can reopen.

**Are workforce policies real labor-law advice?** No. They are configured simulation constraints for a synthetic scenario, not real employment, safety, payroll, or legal guidance.

**Can two users conflict?** They can act on the same shared state, but server serialization, revision checks, and revalidation prevent a stale browser action from silently making an invalid assignment.

## 12. Verification posture

The application is verified with hermetic backend tests (no provider/network calls and no production-data writes) plus Chromium end-to-end tests with provider failures forced. Coverage includes room isolation and failure containment, persistence/restart behavior, clock speeds and durable triggers, Live/Offline behavior, caps and queue order, workforce legality and handover, provider failure fallbacks, stale/override races, redaction, map interaction, accessibility, analytics drill-down, and Docker build/health configuration.

For a defense demonstration, show one room paused, select an active issue, compare the two baselines with Compass’s bounded recommendation, demonstrate that an operator can override, then use the event feed and Analytics to trace the outcome. Use Offline Demo to demonstrate the same workflow without any provider dependency.
