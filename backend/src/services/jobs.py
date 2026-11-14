import time
from fastapi import HTTPException
from sqlalchemy import select
from redis import Redis
from src.config.settings import REDIS_URL
from src.models import Dataset, Job, Report, Delivery
from src.services.business import metadata
from src.services.audit import record
def create(db, data, user):
    if not db.get(Dataset,data.dataset_id): raise HTTPException(404,'数据批次不存在')
    allowed={p['key']:p for p in metadata().get('parameters',[])}
    if set(data.params)-set(allowed): raise HTTPException(422,'包含未知分析参数')
    params={k:p['default'] for k,p in allowed.items()}
    params.update(data.params)
    for key,p in allowed.items():
        v=params[key]
        if p['type']=='number':
            try:
                v=float(v)
                if not (p.get('min',-1e9)<=v<=p.get('max',1e9)): raise ValueError()
                params[key]=v
            except (ValueError,TypeError): raise HTTPException(422, f'{p["label"]} 超出范围或非数值')
        elif str(v) not in [str(o['value']) for o in p.get('options',[])]:
            raise HTTPException(422,f'{p["label"]} 不是有效选项')
    j=Job(name=data.name, dataset_id=data.dataset_id, params=params, created_by=user.id, created_at=time.time(), status='queued', approval_state='pending')
    db.add(j); db.flush()
    return j
def enqueue(job_id):
    try:
        r=Redis.from_url(REDIS_URL); r.rpush('analysis:queue',job_id); r.close()
    except Exception:
        pass # SQL queued status is the durable fallback
def approve(db, job_id, user):
    """重新批准仅恢复审批态；旧计划与旧归档不恢复。返回 (job, changed)。"""
    j=db.get(Job,job_id)
    if not j: raise HTTPException(404,'分析任务不存在')
    if j.status!='completed': raise HTTPException(409,'仅已完成结果可以批准')
    if j.approval_state=='approved':
        return j, False  # 重复批准不重复留痕
    j.approval_state='approved'; j.approved=True
    j.revoked_by=None; j.revoked_at=None; j.revoked_reason=None
    record(db,user.email,'job.approve',{'id':j.id})
    return j, True
def revoke(db, job_id, reason, user):
    """带原因撤回批准。返回 (job, changed)；重试幂等，changed=False 时不重复留痕。"""
    j=db.scalar(select(Job).where(Job.id==job_id).with_for_update())
    if not j: raise HTTPException(404,'分析任务不存在')
    if j.approval_state=='revoked':
        # 撤回重试：同一结论已撤回，直接返回且不再写审计/不重复留痕
        return j, False
    if not j.approved or j.approval_state!='approved':
        raise HTTPException(409,'该结论尚未批准，无需撤回')
    now=time.time()
    j.approval_state='revoked'; j.approved=False
    j.revoked_by=user.email; j.revoked_at=now; j.revoked_reason=reason
    # 关联分发计划停发（永久停用，重新批准后也不恢复）
    plans=list(db.scalars(select(Report).where(Report.job_id==j.id).with_for_update()))
    for r in plans:
        if not r.revoked:
            r.enabled=False; r.revoked=True
            r.revoked_by=user.email; r.revoked_at=now; r.revoked_reason=reason
    # 既有归档保留校验值但拒绝下载
    deliveries=list(db.scalars(select(Delivery).join(Report,Delivery.report_id==Report.id)
                               .where(Report.job_id==j.id).with_for_update()))
    for d in deliveries:
        if not d.revoked:
            d.revoked=True; d.revoked_by=user.email; d.revoked_at=now; d.revoked_reason=reason
    record(db,user.email,'job.revoke',{'id':j.id,'reason':reason,
            'plans':[r.id for r in plans],'deliveries':[d.id for d in deliveries]})
    return j, True
