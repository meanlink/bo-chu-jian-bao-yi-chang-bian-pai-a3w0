/** @typedef {{id:number,name:string,source:string,rows:number,checksum:string}} Dataset */
/** @typedef {{id:number,name:string,dataset_id:number,status:string,result:Object,approved:boolean,approval_state:string,revoked_by:?string,revoked_at:?number,revoked_reason:?string}} AnalysisJob */
/** @typedef {{id:number,name:string,job_id:number,destination:string,next_run:number,enabled:boolean,revoked:boolean,revoked_by:?string,revoked_at:?number,revoked_reason:?string}} ReportSchedule */
/** @typedef {{id:number,report_id:number,created_at:number,checksum:string,filename:string,destination:string,revoked:boolean,revoked_by:?string,revoked_at:?number,revoked_reason:?string}} Delivery */
export {};
