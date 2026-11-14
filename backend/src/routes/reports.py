import os
import time
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from src.config.database import get_db
from src.config.settings import ARTIFACT_DIR
from src.models import Report, Delivery
from src.schemas.report import ReportInput, ReportRevokeInput
from src.middlewares.auth import current_user, admin_only
from src.services import reports
from src.services.audit import record
from src.utils.serialization import report_dict, delivery_dict
router=APIRouter()
@router.get('/reports')
def listing(db=Depends(get_db),u=Depends(current_user)):
    return [report_dict(r) for r in db.scalars(select(Report).order_by(Report.id.desc()))]
@router.post('/reports',status_code=201)
def create(data:ReportInput,db=Depends(get_db),u=Depends(admin_only)):
    r=reports.create(db,data); record(db,u.email,'report.schedule',{'id':r.id,'destination':r.destination}); db.commit()
    return report_dict(r)
@router.post('/reports/{id}/toggle')
def toggle(id:int,db=Depends(get_db),u=Depends(admin_only)):
    r=db.get(Report,id)
    if not r:raise HTTPException(404,'分发计划不存在')
    if r.revoked:
        raise HTTPException(409,'计划已随批准撤回而永久停发，不能重新启用；请基于重新批准的结论新建计划')
    r.enabled=not r.enabled;record(db,u.email,'report.toggle',{'id':id,'enabled':r.enabled});db.commit()
    return report_dict(r)
@router.post('/reports/{id}/revoke')
def revoke_report(id:int,data:ReportRevokeInput,db=Depends(get_db),u=Depends(admin_only)):
    """单独撤回计划：停用该计划并封停其既有归档，不影响分析结论本身。"""
    r=db.scalar(select(Report).where(Report.id==id).with_for_update())
    if not r:raise HTTPException(404,'分发计划不存在')
    if r.revoked:
        # 幂等重试，不重复留痕
        return report_dict(r)
    now=time.time()
    r.enabled=False; r.revoked=True
    r.revoked_by=u.email; r.revoked_at=now; r.revoked_reason=data.reason
    deliveries=list(db.scalars(select(Delivery).where(Delivery.report_id==id).with_for_update()))
    for d in deliveries:
        if not d.revoked:
            d.revoked=True; d.revoked_by=u.email; d.revoked_at=now; d.revoked_reason=data.reason
    record(db,u.email,'report.revoke',{'id':id,'reason':data.reason,'deliveries':[d.id for d in deliveries]})
    db.commit()
    return report_dict(r)
@router.get('/deliveries')
def deliveries(db=Depends(get_db),u=Depends(current_user)):
    return [delivery_dict(d) for d in db.scalars(select(Delivery).order_by(Delivery.id.desc()).limit(100))]
@router.get('/deliveries/{id}/download')
def download(id:int,format:str='csv',db=Depends(get_db),u=Depends(current_user)):
    d=db.get(Delivery,id)
    if not d:raise HTTPException(404,'归档不存在')
    if format not in ('csv','json'):raise HTTPException(422,'支持 CSV 或 JSON')
    # 服务端强制校验：已撤回归档保留记录与校验值，但任何直接访问下载地址都拒绝
    if d.revoked:
        raise HTTPException(410,'该归档已随批准撤回停止下载，校验值仍可在收件箱核验')
    filename=d.filename+('.json' if format=='json' else '')
    p=os.path.join(ARTIFACT_DIR,filename)
    if not os.path.exists(p):raise HTTPException(404,'归档文件不存在，请重新安排分发')
    return FileResponse(p,filename=filename,media_type='application/json' if format=='json' else 'text/csv; charset=utf-8')
