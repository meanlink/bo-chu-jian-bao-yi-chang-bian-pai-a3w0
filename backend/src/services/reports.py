import time, os, csv, io, hashlib, json
from fastapi import HTTPException
from sqlalchemy import select
from src.models import Job, Report, Delivery
from src.config.settings import ARTIFACT_DIR
def create(db, data):
    j=db.get(Job,data.job_id)
    if not j or j.status!='completed' or not j.approved or j.approval_state!='approved':
        raise HTTPException(409,'请先选择已完成且获批准的分析结果')
    r=Report(name=data.name, job_id=j.id, destination=data.destination, interval_seconds=data.interval_seconds, next_run=time.time()+data.delay_seconds, enabled=True, revoked=False)
    db.add(r); db.flush()
    return r
def deliver(db, report):
    # 行锁串行化分发与撤回：撤回提交后，本事务只能看到 revoked 状态，不再发布可下载文件
    r=db.scalar(select(Report).where(Report.id==report.id).with_for_update())
    if r is None or not r.enabled or r.revoked:
        return None
    j=db.scalar(select(Job).where(Job.id==r.job_id).with_for_update())
    if not j or not j.approved or j.approval_state!='approved':
        return None
    out=io.StringIO()
    out.write('﻿')
    table=j.result.get('table',{})
    cols=table.get('columns',[])
    writer=csv.writer(out)
    def safe(v):
        if isinstance(v,(int,float)) and not isinstance(v,bool): return v
        text=str(v)
        return "'"+text if text.startswith(('=','+','-','@','\t','\r')) else text
    writer.writerow([safe(c['label']) for c in cols])
    for row in table.get('rows',[]): writer.writerow([safe(row.get(c['key'],'')) for c in cols])
    data=out.getvalue().encode('utf-8')
    delivery=Delivery(report_id=r.id, created_at=time.time(), checksum=hashlib.sha256(data).hexdigest(), filename='', destination=r.destination, revoked=False)
    db.add(delivery); db.flush()
    delivery.filename=f'report-{r.id}-delivery-{delivery.id}.csv'
    os.makedirs(ARTIFACT_DIR,exist_ok=True)
    with open(os.path.join(ARTIFACT_DIR,delivery.filename),'wb') as f:f.write(data)
    with open(os.path.join(ARTIFACT_DIR,delivery.filename+'.json'),'w') as f: json.dump({'job':j.name,'params':j.params,'result':j.result,'checksum':delivery.checksum},f,ensure_ascii=False,allow_nan=False)
    r.next_run=time.time()+r.interval_seconds
    return delivery
