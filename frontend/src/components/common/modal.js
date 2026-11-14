import {esc} from '../utils/dom.js';
/**
 * 带原因的确认弹窗：返回 Promise<string|null>，确认时 resolve 原因，取消时 resolve null。
 * 用于撤回批准/撤回分发计划，原因必填（2-500 字，与后端 Pydantic 约束一致）。
 */
export function reasonDialog(title,description){
 return new Promise(resolve=>{
  const wrap=document.createElement('div');
  wrap.className='modal-mask';
  wrap.innerHTML='<div class="modal" role="dialog" aria-modal="true"><h3>'+esc(title)+'</h3>'+
   (description?'<p class="modal-desc">'+esc(description)+'</p>':'')+
   '<label class="modal-label">撤回原因<textarea id="modal-reason" rows="4" maxlength="500" placeholder="请填写撤回原因，将留痕并展示在结果页、计划与收件箱"></textarea></label>'+
   '<p class="modal-error" id="modal-error"></p>'+
   '<div class="modal-actions"><button class="button" id="modal-cancel" type="button">取消</button><button class="primary" id="modal-ok" type="button">确认撤回</button></div></div>';
  document.body.appendChild(wrap);
  const input=wrap.querySelector('#modal-reason');
  const err=wrap.querySelector('#modal-error');
  input.focus();
  const close=value=>{wrap.remove();resolve(value);};
  wrap.querySelector('#modal-cancel').onclick=()=>close(null);
  wrap.onclick=e=>{if(e.target===wrap)close(null);};
  const submit=()=>{
   const reason=input.value.trim();
   if(reason.length<2){err.textContent='请填写至少 2 个字的撤回原因';input.focus();return;}
   close(reason);
  };
  wrap.querySelector('#modal-ok').onclick=submit;
  input.onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))submit();if(e.key==='Escape')close(null);};
 });
}
