import {jobs,reports} from '../api/entities.js';
import {download} from '../api/client.js';
import {workspace} from '../stores/workspace.js';
import {session} from '../stores/session.js';
import {heading} from '../components/common/shell.js';
import {reasonDialog} from '../components/common/modal.js';
import {esc,date,notify} from '../utils/dom.js';
import {submit} from '../hooks/forms.js';
function planArticle(r,isAdmin){
 const state=r.revoked
  ?'<small class="plan-state revoked">已随撤回永久停发 · '+date(r.revoked_at)+' · '+esc(r.revoked_by)+'</small><small class="plan-reason">原因：'+esc(r.revoked_reason||'—')+'</small>'
  :'<small>下次 '+date(r.next_run)+' · 周期 '+r.interval_seconds+' 秒 · '+(r.enabled?'启用中':'已暂停')+'</small>';
 const button=r.revoked
  ?'<button class="button small" disabled>已停发</button>'
  :'<div class="row-actions"><button class="button small" data-toggle="'+r.id+'" '+(isAdmin?'':'disabled')+'>'+(r.enabled?'暂停':'启用')+'</button><button class="button small danger" data-plan-revoke="'+r.id+'" '+(isAdmin?'':'disabled')+'>撤回</button></div>';
 return '<article class="'+(r.revoked?'is-revoked':'')+'"><div><strong>'+esc(r.name)+'</strong><p>'+esc(r.destination)+'</p>'+state+'</div>'+button+'</article>';
}
function deliveryItem(d){
 const meta=d.revoked
  ?'<p>'+esc(d.destination)+' · '+date(d.created_at)+'</p><small class="revoked-tag">已撤回 · 禁下 · '+date(d.revoked_at)+' · '+esc(d.revoked_by)+'</small><small class="plan-reason">原因：'+esc(d.revoked_reason||'—')+'</small><small>SHA256 '+esc(d.checksum.slice(0,24))+'…（校验值保留）</small>'
  :'<p>'+esc(d.destination)+' · '+date(d.created_at)+'</p><small>SHA256 '+esc(d.checksum.slice(0,24))+'…</small>';
 const actions=d.revoked
  ?'<span class="download-blocked">下载已关闭</span>'
  :'<div><button class="text-button" data-download="'+d.id+'" data-format="csv">CSV ↓</button><button class="text-button" data-download="'+d.id+'" data-format="json">JSON ↓</button></div>';
 return '<div class="delivery '+(d.revoked?'is-revoked':'')+'"><div><strong>'+esc(d.filename)+'</strong>'+meta+'</div>'+actions+'</div>';
}
export async function reportPage(){
 const [list,deliveries,allJobs]=await Promise.all([reports.list(),reports.deliveries(),jobs.list()]);workspace.reports=list;
 const approved=allJobs.filter(j=>j.approval_state==='approved'&&j.status==='completed');
 const isAdmin=session.user.role==='admin';
 return heading('05 / DISTRIBUTION','定时分发与归档','把批准后的结果交付到本地业务收件箱。每份 CSV 与 JSON 留有时间、目标组和校验指纹；撤回后计划停发、归档拒下且全程留痕。','<button class="button" id="refresh-reports">刷新收件箱 ↻</button>')+'<div class="report-grid"><section class="panel"><div class="section-title"><h2>创建分发计划</h2></div><form id="report-form"><label>简报名称<input name="name" required minlength="2" value="日间业务复核简报"></label><label>已批准分析<select name="job_id" required>'+(approved.length?approved.map(j=>'<option value="'+j.id+'">'+esc(j.name)+'</option>').join(''):'<option value="">暂无处于有效批准状态的结论</option>')+'</select></label><label>业务接收组<input name="destination" value="业务复核组 · 本地收件箱" required></label><div class="parameter-grid"><label>分发周期<select name="interval_seconds"><option value="86400">每日</option><option value="604800">每周</option><option value="60">每分钟（验收）</option></select></label><label>首次执行<select name="delay_seconds"><option value="0">立即</option><option value="60">1 分钟后</option><option value="3600">1 小时后</option></select></label></div><button type="submit" class="primary" '+(isAdmin&&approved.length?'':'disabled')+'>保存分发计划</button></form><p class="hint">由后台 worker 按到期时间生成文件。仅负责人可创建、暂停或撤回；撤回后的计划不随重新批准恢复，需新建计划。</p></section><section><div class="section-title"><h2>分发计划</h2><span>'+list.filter(r=>r.enabled&&!r.revoked).length+' 条启用中 · '+list.filter(r=>r.revoked).length+' 条已撤回</span></div><div class="schedule-list">'+list.map(r=>planArticle(r,isAdmin)).join('')+'</div><section class="panel inbox"><div class="section-title"><h2>本地收件箱</h2><span>'+deliveries.length+' 份归档 · '+deliveries.filter(d=>d.revoked).length+' 份已撤回</span></div>'+deliveries.map(deliveryItem).join('')+(!deliveries.length?'<p class="empty">计划执行后，文件会出现在此处。等待片刻后刷新。</p>':'')+'</section></section></div>';
}
export function bindReports(refresh){
 document.querySelector('#refresh-reports').onclick=refresh;
 submit(document.querySelector('#report-form'),async f=>{await reports.create({name:f.get('name'),job_id:Number(f.get('job_id')),destination:f.get('destination'),interval_seconds:Number(f.get('interval_seconds')),delay_seconds:Number(f.get('delay_seconds'))});notify('计划已保存，后台将按到期时间归档');await refresh();});
 document.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{try{await reports.toggle(b.dataset.toggle);await refresh();}catch(e){notify(e.message,true);}});
 document.querySelectorAll('[data-plan-revoke]').forEach(b=>b.onclick=async()=>{
  const reason=await reasonDialog('撤回分发计划','撤回后该计划永久停发，其既有归档保留校验值但拒绝下载。');
  if(!reason)return;
  try{await reports.revoke(b.dataset.planRevoke,reason);notify('计划已撤回，相关归档停止下载');await refresh();}catch(e){notify(e.message,true);}
 });
 document.querySelectorAll('[data-download]').forEach(b=>b.onclick=()=>download(b.dataset.download,b.dataset.format).catch(e=>notify(e.message,true)));
}
