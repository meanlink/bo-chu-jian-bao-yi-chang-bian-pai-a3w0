import {jobs} from '../api/entities.js';
import {workspace} from '../stores/workspace.js';
import {session} from '../stores/session.js';
import {heading} from '../components/common/shell.js';
import {chart} from '../components/common/chart.js';
import {table} from '../components/common/table.js';
import {status} from '../components/common/status.js';
import {reasonDialog} from '../components/common/modal.js';
import {esc,fmt,date,notify} from '../utils/dom.js';
function approvalBadge(j){
 if(j.approval_state==='revoked')return '<span class="approval revoked">已撤回</span>';
 if(j.approval_state==='approved')return '<span class="approval">已获业务批准</span>';
 return '<span class="approval pending">待负责人复核</span>';
}
function revokeCard(j){
 if(j.approval_state!=='revoked')return '';
 return '<section class="panel revoke-banner"><div class="section-title"><h2>批准撤回留痕</h2><span class="revoked-tag">已停发 · 归档禁下</span></div>'+
  '<dl class="revoke-meta"><dt>撤回人</dt><dd>'+esc(j.revoked_by||'—')+'</dd><dt>撤回时间</dt><dd>'+date(j.revoked_at)+'</dd><dt>撤回原因</dt><dd>'+esc(j.revoked_reason||'—')+'</dd></dl>'+
  '<p class="hint">关联分发计划已停发，既有归档保留 SHA256 校验值但拒绝下载。重新批准后仅新建计划可分发，旧计划与旧归档不恢复。</p></section>';
}
export async function results(id){
 workspace.jobs=await jobs.list();const j=id?await jobs.get(id):(workspace.jobs.find(j=>j.id===workspace.selectedJob)||workspace.jobs[0]);
 if(j&&!workspace.jobs.some(x=>x.id===j.id))workspace.jobs.push(j);
 if(!j)return heading('04 / REVIEW','结果复核','尚无分析结果。')+'<div class="empty">先到分析工作台，选择批次并提交一次计算。<a href="#/workbench">前往工作台 ↗</a></div>';
 workspace.selectedJob=j.id;const r=j.result||{};
 const isAdmin=session.user.role==='admin';
 const actionButtons=j.approval_state==='revoked'
   ?(isAdmin?'<button class="primary" id="approve-job">重新批准此结论</button><p class="hint">重新批准后，仅新建分发计划可分发；旧计划与旧归档不恢复。</p>':'')
   :(j.approval_state==='pending'&&isAdmin?'<button class="primary" id="approve-job">批准此业务结论</button>':'')+(isAdmin&&j.approval_state==='approved'?'<button class="button danger" id="revoke-job">撤回批准并停发</button>':'');
 return heading('04 / REVIEW','结果复核与业务解释',j.name,'<button class="button" id="refresh-results">刷新结果 ↻</button>')+
  '<div class="result-selector"><label>分析记录<select id="select-job">'+workspace.jobs.map(x=>'<option value="'+x.id+'" '+(x.id===j.id?'selected':'')+'>'+esc(x.name)+' · '+esc(x.status)+'</option>').join('')+'</select></label>'+status(j.status)+'<span>'+date(j.created_at)+'</span>'+approvalBadge(j)+'</div>'+
  (j.approval_state==='revoked'?'<div class="revoke-alert">该业务结论的批准已于 '+date(j.revoked_at)+' 由 '+esc(j.revoked_by)+' 撤回：'+esc(j.revoked_reason)+'</div>':'')+
  (j.status==='completed'?'<section class="result-lead"><p class="eyebrow">COMPUTED FINDING</p><h2>'+esc(r.summary)+'</h2><div class="metrics">'+(r.metrics||[]).map(m=>'<div><span>'+esc(m.label)+'</span><strong>'+esc(fmt(m.value))+'<small>'+esc(m.unit||'')+'</small></strong></div>').join('')+'</div></section><section class="panel">'+chart(r.chart)+'</section>'+revokeCard(j)+'<div class="two-columns"><section class="panel"><div class="section-title"><h2>业务解释</h2><span>由计算结果生成</span></div><ol class="questions">'+(r.findings||[]).map(v=>'<li>'+esc(v)+'</li>').join('')+'</ol>'+(r.warnings||[]).map(v=>'<p class="warning">'+esc(v)+'</p>').join('')+'</section><section class="method-sheet compact"><p class="eyebrow">REPRODUCIBILITY</p><h3>计算口径与参数</h3><p>'+esc(r.method)+'</p><pre>'+esc(JSON.stringify(j.params,null,2))+'</pre>'+actionButtons+'<p class="hint">仅批准结果可进入定时分发档案；撤回需填写原因并将留痕。</p></section></div><section class="panel"><div class="section-title"><h2>结果明细</h2><span>'+(r.table?.rows?.length||0)+' 行</span></div>'+table(r.table?.columns||[],r.table?.rows||[])+'</section>':'<section class="panel empty">'+(j.status==='failed'?'计算失败：'+esc(j.error)+'。请返回工作台调整参数或数据。':'后台正在执行计算。点击刷新结果查看最新进展。')+'<a href="#/workbench">返回工作台 ↗</a></section>');
}
export function bindResults(refresh){
 document.querySelector('#refresh-results')?.addEventListener('click',refresh);
 document.querySelector('#select-job')?.addEventListener('change',e=>{workspace.selectedJob=Number(e.target.value);location.hash='#/results/'+e.target.value;});
 document.querySelector('#approve-job')?.addEventListener('click',async()=>{try{await jobs.approve(workspace.selectedJob);notify('已批准，可基于此结论新建分发计划');await refresh();}catch(e){notify(e.message,true);}});
 document.querySelector('#revoke-job')?.addEventListener('click',async()=>{
  const reason=await reasonDialog('撤回业务批准','撤回后关联分发计划立即停发，既有归档保留校验值但拒绝下载；撤回操作将留痕。');
  if(!reason)return;
  try{await jobs.revoke(workspace.selectedJob,reason);notify('已撤回批准并停发关联计划');await refresh();}catch(e){notify(e.message,true);}
 });
}
