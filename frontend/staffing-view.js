import { setHtml } from './render-lifecycle.js';
const labels = {APPROVED_TOP:'Approved by central command',APPROVED_ALTERNATIVE:'Approved alternative by central command',REJECTED:'Rejected',EXPIRED:'Expired',AUTO_APPROVED:'Auto-approved by policy',STALE:'Stale',SUPERSEDED:'Superseded',PENDING:'Awaiting central command'};
export function staffingMarkup(state, escape) {
  const c = state.workforceContinuity;
  if (!c || state.mode !== 'LIVE') return '<h3>Staffing</h3><p>Staffing approval is available in Live mode. Offline remains API-free.</p>';
  const recs = c.staffingRecommendations ?? [], rec = recs.find((r)=>r.status==='PENDING');
  const active = state.responders.filter((r)=>r.availability!=='UNAVAILABLE').length;
  const backlog = state.issues.filter((i)=>['PENDING','RECOMMENDATION_READY','OFFER_PENDING','ASSIGNED'].includes(i.status));
  const groups = new Map();
  for (const b of c.backlog ?? []) { const k=`Class ${b.issueClass} · ${b.priorityBand}`; groups.set(k,(groups.get(k)??0)+b.count); }
  const time = (v)=>escape(v ? v.replace('T',' ').slice(0,16)+' UTC':'—');
  const minute = (v)=>v===null?'—':Number(v).toFixed(1);
  const recent = recs.filter((r)=>r.status!=='PENDING').slice(-5).reverse().map((r)=>`<li><strong>${escape(labels[r.status]??r.status)}</strong> · ${escape(r.id)}<br>${time(r.decidedAt)} · ${escape(r.actor??'Application')}${r.selectedOptionId?` · ${escape(r.selectedOptionId)}`:''}${r.reason?`<br>${escape(r.reason)}`:''}</li>`).join('');
  let recommendation = '<p>No open staffing recommendation. Reviews run when demand exceeds active staff and lawful options exist.</p>';
  if(rec){
    const minutes=Math.max(0,(Date.parse(rec.deadline)-Date.parse(state.simulationState.simulationTime))/60000);
    const rows=rec.rankedOptions.map((r)=>{const option=rec.packet.candidates.find((c)=>c.optionId===r.optionId);return `<li><strong>${r.rank}. ${escape(option.displayName)} · ${option.kind==='EXTENSION'?'Extend shift':'Call in'}</strong><p>${escape(r.rationale)}</p><p>Duty ${minute(option.dutyHours)} h · rest ${option.restHours===null?'No prior duty recorded':minute(option.restHours)+' h'} · legal end ${time(option.legalEndsAt)}</p><div class="evidence-scroll"><table><caption>Observed backlog experience</caption><thead><tr><th>Class / symptom</th><th>Class attempts</th><th>Smoothed success</th><th>Median min</th><th>Symptom attempts / success / median</th></tr></thead><tbody>${option.experience.map((e)=>`<tr><td>${escape(e.issueClass)} / ${escape(e.symptom??'Legacy')}</td><td>${e.classEvidence.attempts}</td><td>${(e.classEvidence.smoothedSuccess*100).toFixed(1)}%${e.classEvidence.attempts<3?' · thin sample':''}</td><td>${minute(e.classEvidence.medianResolutionMinutes)}</td><td>${e.symptomEvidence.attempts} / ${(e.symptomEvidence.smoothedSuccess*100).toFixed(1)}% / ${minute(e.symptomEvidence.medianResolutionMinutes)}</td></tr>`).join('')}</tbody></table></div></li>`;}).join('');
    recommendation=`<section class="staffing-open" data-recommendation-id="${escape(rec.id)}"><h4>Staffing recommendation ready · ${escape(rec.id)}</h4><p><strong>${rec.source==='AMD_MODEL'?'AMD model':rec.source==='FIXTURE'?'Offline fixture':'Deterministic'}</strong> · ${escape(rec.rankingStatus)} · ${rec.disagreement?'Disagrees with baseline':'Agrees with baseline'} (${escape(rec.baselineOptionId)})</p><p>Deadline ${time(rec.deadline)} · ${minutes.toFixed(1)} simulated minutes left</p><p>${c.staffingApproval==='AUTO_APPROVE_TOP'?'Auto-approved by policy after deadline if still lawful.':'Central command approval required; unanswered recommendations expire.'}</p><button type="button" data-staffing-action="approve" data-option="${escape(rec.rankedOptions[0].optionId)}">Approve top option</button><label>Alternative option<select data-staffing-alternative>${rec.rankedOptions.slice(1).map((r)=>`<option value="${escape(r.optionId)}">${escape(r.optionId)}</option>`).join('')}</select></label><button type="button" data-staffing-action="alternative" ${rec.rankedOptions.length<2?'disabled':''}>Approve alternative</button><label>Rejection reason (optional)<input data-staffing-reason maxlength="360" /></label><button type="button" class="secondary-button" data-staffing-action="reject">Reject</button><details><summary>Ranked options and evidence (${rec.rankedOptions.length})</summary><ol>${rows}</ol></details></section>`;
  }
  return `<h3>Staffing</h3><p>${backlog.length} actionable issues · ${active} active staff / ${c.maximumActiveStaff} cap<br>Next handover ${time(c.nextHandoverAt)}</p><ul>${[...groups].map(([k,n])=>`<li>${escape(k)}: ${n}</li>`).join('')}</ul>${recommendation}<h4>Recent decisions</h4>${recent?`<ol class="staffing-decisions">${recent}</ol>`:'<p>No decisions yet.</p>'}<p class="staffing-feedback" role="status"></p>`;
}
export function renderStaffing(state, {escape, request, onState}) {
  const targets=[document.querySelector('#staffing-tile'),document.querySelector('#demo-staffing-outlook')].filter(Boolean);
  for(const target of targets){
    const priorId = target.querySelector('[data-recommendation-id]')?.dataset.recommendationId;
    const chosen = target.querySelector('[data-staffing-alternative]')?.value;
    const reason = target.querySelector('[data-staffing-reason]')?.value;
    const openDetails = target.querySelector('details')?.open;
    const activeElement = target.contains(document.activeElement) ? document.activeElement : null;
    const focused = activeElement?.matches('[data-staffing-reason]') ? 'reason' : activeElement?.matches('[data-staffing-alternative]') ? 'alternative' : null;
    setHtml(target,staffingMarkup(state,escape));
    if (priorId && priorId === target.querySelector('[data-recommendation-id]')?.dataset.recommendationId) {
      const select = target.querySelector('[data-staffing-alternative]');
      if (select && [...select.options].some((o)=>o.value===chosen)) select.value=chosen;
      if (reason !== undefined) target.querySelector('[data-staffing-reason]').value=reason;
      if (target.querySelector('details')) target.querySelector('details').open=Boolean(openDetails);
      if (focused) target.querySelector(`[data-staffing-${focused}]`)?.focus();
    }
    const rec=state.workforceContinuity?.staffingRecommendations?.find((r)=>r.status==='PENDING');
    for(const button of target.querySelectorAll('[data-staffing-action]'))button.onclick=async()=>{
      const decision=button.dataset.staffingAction==='reject'?'reject':'approve';
      const optionId=button.dataset.staffingAction==='alternative'?target.querySelector('[data-staffing-alternative]').value:button.dataset.option;
      target.querySelectorAll('button').forEach((b)=>b.disabled=true);
      try{
        const next=await request(`/staffing/${encodeURIComponent(rec.id)}/${decision}`,{method:'POST',body:JSON.stringify({optionId,reason:target.querySelector('[data-staffing-reason]').value,expectedRevision:rec.revision})});
        onState(next);
        const feedback=next.action?.status;target.querySelector('.staffing-feedback').textContent=feedback==='STALE'?'Option is stale; nothing applied.':labels[feedback]??feedback??'Updated';
      }catch(error){onState(await request('/state'));target.querySelector('.staffing-feedback').textContent=error.message;}
    };
  }
}
