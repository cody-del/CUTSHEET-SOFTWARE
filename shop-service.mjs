import {waitingShopOrders,heldOrderSheet,productionName} from './order-manufacturing.mjs';
import {productId,manufacturingOpenings,hasManufacturingLines,supportsCutSheets,CUT_SHEETS_ONLY} from './public/products.js';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {calculate,ValidationError} from './calculations.mjs';
import {salesOperations,runSales,orderJob} from './sales-service.mjs';
import {progress,production,productionChecks,openingCheckStatus,openingProduction} from './public/shop-state.js';
import {workspaceOperations,runWorkspace} from './workspace-service.mjs';
import {workerResponse} from './worker-view.mjs';

const hash=s=>createHash('sha256').update(String(s)).digest('hex');
const equal=(a,b)=>timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));
const idPattern=/^[a-zA-Z0-9_-]{1,64}$/;
export class ShopError extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new ShopError(status,message);};
function text(value,label,max=120,required=true){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(400,`Enter a valid ${label}.`);return value.trim();}
function identifier(value){if(typeof value!=='string'||!idPattern.test(value)||['__proto__','constructor','prototype'].includes(value))fail(400,'Invalid identifier.');return value;}
function plan(data){
  const targetMinutes=Number(data.targetMinutes||0);if(!Number.isFinite(targetMinutes)||targetMinutes<0||targetMinutes>60000)fail(400,'Estimated cutting time must be between 0 and 60,000 minutes.');
  const due=data.due||'',date=new Date(due+'T12:00:00Z');if(due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==due))fail(400,'Enter a valid target date.');
  return {targetMinutes,due};
}
function stop(job,now){if(job.startedAt){job.elapsedMs+=Math.max(0,now-job.startedAt);job.startedAt=null;}}
function audit(job,actor,message,now){job.activity.unshift({at:now,by:actor.name,message});job.activity=job.activity.slice(0,200);job.version++;job.updatedAt=now;}
function updateCompletion(job,time){
  for(const opening of job.openings)opening.productionCompletedAt=openingProduction(job,opening).key==='complete'?(opening.productionCompletedAt||time):null;
  job.productionCompletedAt=production(job).key==='complete'?(job.productionCompletedAt||time):null;
}

function productionView(state,job){const source=state.orders?.[job.id]||state.drafts?.[job.id];return {...job,displayName:source?productionName(source):job.displayName||job.name};}
function releaseJob(state,data,a,time){
  let input=data.job;if(!input||!Array.isArray(input.openings)||!input.openings.length||input.openings.length>100)fail(400,'Add 1–100 openings before sending this job to the shop.');
  const id=identifier(input.id),previous=state.jobs[id];
  if(state.orders?.[id]){
    const order=state.orders[id];input=orderJob(order);
    if(!order.finance?.confirmedAt)fail(422,'Confirm the order sale total and payment before sending it to Production.');
  }
  else if(state.drafts?.[id]){const draft=state.drafts[id];if(draft.archived)fail(400,'Restore this draft before releasing it to the shop.');if(data.job.version!==draft.version)fail(409,'This draft changed on another device. Reload it before releasing.');input={id:draft.id,productId:'shuttersmart',name:draft.name,number:draft.number,notes:draft.notes,due:draft.due,openings:structuredClone(draft.openings)};}
  else if(state.quotes?.[id]){if(!hasManufacturingLines(state.quotes[id]))fail(422,CUT_SHEETS_ONLY);fail(422,'Mark the quote sold before sending its ShutterSmart lines to the shop.');}
  if(!input.openings.length)fail(400,'Add an opening before releasing this job.');
  if(!supportsCutSheets(input))fail(422,CUT_SHEETS_ONLY);
  if(previous)fail(409,'This job is already in the shop. Its released cut sheet is kept unchanged.');
  if(Object.keys(state.jobs).length>=500)fail(400,'This workshop has reached its 500-job capacity.');
  const seen=new Set(),openings=input.openings.map(o=>{
    identifier(o.id);if(seen.has(o.id))fail(400,'Opening IDs must be unique.');seen.add(o.id);
    text(o.name,'opening name',80);const result=calculate(o);
    if(result.warnings.length)fail(422,`${o.name}: ${result.warnings.join(' ')}`);
    if(!result.parts.length)fail(422,`${o.name} has no calculated cut lines.`);
    return {input:structuredClone(o),result,...(state.orders?.[id]?.finishingProgress?{production:structuredClone(state.orders[id].finishingProgress.openings?.[o.id]||{})}:{}),lines:result.parts.map((part,i)=>({...part,id:o.id+'-'+i,completed:0,status:'not-cut',shortage:null}))};
  });
  const job={id,productId:productId(input),name:text(input.name,'job name',100),number:text(input.number,'job number'),notes:text(input.notes||'','shop notes',1200,false),
    ...plan({targetMinutes:data.targetMinutes,due:data.due||input.due}),openings,publishedAt:time,updatedAt:time,version:1,elapsedMs:0,startedAt:null,completedAt:null,cuttingStartedAt:null,production:structuredClone(state.orders?.[id]?.finishingProgress?.production||{}),productionCompletedAt:null,activity:structuredClone(state.orders?.[id]?.finishingProgress?.activity||[])};
  audit(job,a,'Sent to shop',time);state.jobs[id]=job;return {job};
}

export function createShopService({store,local=false,publicOwnerAccess=false,password='',secret='',authenticatedActor=null,now=()=>Date.now()}) {
  // Explicit server configuration only; requests and cookies cannot enable this.
  const publicAccess=publicOwnerAccess===true;
  const setupIssues=[
    ...(!store?['The database connection is missing.']:[]),
    ...(!local&&!authenticatedActor&&password.length<12?['The owner password must contain at least 12 characters.']:[]),
    ...(!local&&!authenticatedActor&&secret.length<32?['The session signing key must contain at least 32 characters.']:[])
  ];
  const configured=setupIssues.length===0;
  const sign=value=>createHmac('sha256',secret+hash(password)).update(value).digest('base64url');
  function ownerToken(){const body=Buffer.from(JSON.stringify({expires:now()+12*3600000})).toString('base64url');return body+'.'+sign(body);}
  function validOwner(token){try{const [body,sig]=token.split('.');return equal(sig,sign(body))&&JSON.parse(Buffer.from(body,'base64url')).expires>now();}catch{return false;}}
  function actor(state,cookie={}){
    if(authenticatedActor)return authenticatedActor;
    if(publicAccess)return {role:'owner',id:'public-owner',name:'Public owner access'};
    if(cookie.shop){const d=state.devices[hash(cookie.shop)];if(d&&!d.revoked&&d.expires>now())return {role:'shop',id:d.id,name:d.name};}
    if(local||validOwner(cookie.owner||''))return {role:'owner',id:'owner',name:local?'Owner · local preview':'Owner'};
    return null;
  }
  function requireActor(state,cookie,owner=false){const a=actor(state,cookie);if(!a)fail(401,'Connect this iPad or sign in as the owner.');if(owner&&a.role!=='owner')fail(403,'Only the owner can do that.');return a;}
  function jobFor(state,data){const j=state.jobs[identifier(data.id)];if(!j)fail(404,'This shop job was not found.');if(j.version!==data.version)fail(409,'This cut sheet changed on another device. Review the latest values and try again.');return j;}
  return {
    configured,
    async run(operation,data={},cookie={}) {
      if(!configured){if(operation==='session')return {configured:false,role:null,local,setupIssues};fail(503,'Shared shop storage is not connected yet.');}
      let worker=false;
      const response=await store.transaction(async state=>{
        worker=actor(state,cookie)?.role==='shop';
        const time=now();
        // Prune expired connection codes and old rate-limit buckets.
        for(const [key,value]of Object.entries(state.pairings))if(value.expires<time)delete state.pairings[key];
        for(const [key,value]of Object.entries(state.attempts))if(value.until<time)delete state.attempts[key];
        if(operation==='session')return {configured:true,local,publicOwnerAccess:publicAccess,...(actor(state,cookie)||{role:null})};
        // Temporary public visitors must not create connections that outlive this mode.
        if(publicAccess&&['pair','pairing','revoke'].includes(operation))fail(403,'Device setup is unavailable during public access. Open the shop page directly; no connection code is needed.');
        if(operation==='login'||operation==='pair'){
          const key=operation+':'+hash(data.client||'unknown');const attempt=state.attempts[key]||{count:0,until:time+15*60000};
          // Return errors here (rather than throw) so failed attempts are committed.
          if(attempt.count>=10)return {error:'Too many attempts. Try again in 15 minutes.',status:429};
          attempt.count++;state.attempts[key]=attempt;
          if(operation==='login'){
            if(!equal(data.password||'',password)||!password)return {error:'Incorrect owner password.',status:401};
            delete state.attempts[key];return {cookie:'owner',token:ownerToken(),maxAge:43200};
          }
          const code=String(data.code||'').replace(/[^a-zA-Z0-9]/g,'').toUpperCase(),p=state.pairings[hash(code)];
          if(!p||p.expires<time)return {error:'That connection code is invalid or expired.',status:401};
          const token=randomBytes(32).toString('base64url'),deviceId=randomBytes(12).toString('hex');
          state.devices[hash(token)]={id:deviceId,name:p.name,expires:time+180*86400000,createdAt:time,revoked:false};
          delete state.pairings[hash(code)];delete state.attempts[key];
          return {cookie:'shop',token,maxAge:180*86400};
        }
        if(salesOperations.includes(operation)){const a=requireActor(state,cookie,true);return runSales(state,operation,data,time,release=>releaseJob(state,release,a,time));}
        if(workspaceOperations.includes(operation)){const a=requireActor(state,cookie,true);return runWorkspace(state,operation,data,time,release=>releaseJob(state,release,a,time));}
        const a=requireActor(state,cookie,['publish','plan','pairing','revoke','resolve','dashboard'].includes(operation));
        if(operation==='jobs'||operation==='dashboard'){
          return {jobs:Object.values(state.jobs).map(j=>productionView(state,j)).sort((x,y)=>y.publishedAt-x.publishedAt),serverTime:time,pendingOrders:waitingShopOrders(state),
            ...(operation==='dashboard'?{
              devices:Object.values(state.devices).filter(d=>!d.revoked&&d.expires>time).map(({id,name,createdAt})=>({id,name,createdAt}))}:{})};
        }
        if(operation==='job-get'){
          const id=identifier(data.id);if(state.jobs[id])return {job:productionView(state,state.jobs[id])};
          const order=state.orders?.[id];if(!order||!hasManufacturingLines(order))fail(404,'This digital cut sheet was not found.');
          return {job:heldOrderSheet(order)};
        }
        if(operation==='pairing'){
          const name=text(data.name,'iPad name',60),code=randomBytes(8).toString('hex').toUpperCase();
          state.pairings[hash(code)]={name,expires:time+10*60000};
          return {code:code.match(/.{4}/g).join('-'),expires:time+10*60000};
        }
        if(operation==='revoke'){const device=Object.values(state.devices).find(d=>d.id===data.deviceId);if(!device)fail(404,'Device not found.');device.revoked=true;return {ok:true};}
        if(operation==='publish')return releaseJob(state,data,a,time);
        const heldOrder=operation==='stage'&&!state.jobs[data.id]?state.orders?.[identifier(data.id)]:null;
        if(heldOrder&&!hasManufacturingLines(heldOrder))fail(404,'This digital cut sheet was not found.');
        if(heldOrder&&heldOrder.version!==data.version)fail(409,'This order changed on another device. Reload it before saving again.');
        const job=heldOrder?heldOrderSheet(heldOrder):jobFor(state,data);
        if(operation==='plan'){Object.assign(job,plan(data));audit(job,a,'Updated cutting estimate and target date',time);return {job};}
        if(operation==='stage'){
          // Keep the former combined Capping action compatible with older tabs.
          const stage=data.stage==='capping'?{key:'capping',label:'Capping'}:productionChecks.find(check=>check.key===data.stage);
          if(!stage||!['not-started','partial','complete'].includes(data.status))fail(400,'Choose a valid production stage and status.');
          const keys=stage.key==='capping'?['louvers-capped','stiles-capped']:[stage.key];
          const opening=data.openingId===undefined?null:job.openings.find(o=>o.input.id===identifier(data.openingId));
          if(data.openingId!==undefined&&!opening)fail(404,'This opening was not found in the job.');
          const targets=opening?[opening]:job.openings;
          if(targets.every(o=>keys.every(key=>openingCheckStatus(job,o,key)===data.status)))return {job};
          for(const target of targets){
            target.production??={};
            for(const key of keys)target.production[key]={status:data.status,updatedAt:time,completedAt:data.status==='complete'?time:null,by:a.name};
          }
          // Requests from older tabs still mean the whole job; scoped updates
          // never change another opening's saved work.
          if(!opening){job.production??={};for(const key of keys)job.production[key]={status:data.status,updatedAt:time,completedAt:data.status==='complete'?time:null,by:a.name};if(stage.key==='capping')delete job.production.capping;}
          if(!job.held&&data.status!=='not-started')job.cuttingStartedAt??=time;
          updateCompletion(job,time);
          audit(job,a,`${opening?opening.input.name+' · ':''}${stage.label}: ${data.status==='complete'?'complete':data.status==='partial'?'partial':'not started'} · ${production(job).label}`,time);
          if(heldOrder){
            heldOrder.finishingProgress={openings:Object.fromEntries(job.openings.map(o=>[o.input.id,o.production||{}])),production:job.production,activity:job.activity};
            heldOrder.version=job.version;heldOrder.updatedAt=time;
          }
          return {job};
        }
        if(operation==='timer'){
          if(!['start','pause','finish'].includes(data.action))fail(400,'Invalid timer action.');
          const p=progress(job);
          if(data.action==='start'){
            if(p.complete)fail(409,'Every line is already fully cut.');
            if(job.startedAt)fail(409,'This job timer is already running.');
            const running=Object.values(state.jobs).find(j=>j.startedAt);if(running)fail(409,`Pause ${running.number} before starting another job.`);
            job.cuttingStartedAt??=time;job.startedAt=time;audit(job,a,'Started cutting',time);
          }else{
            if(data.action==='finish'&&!p.complete)fail(409,'Mark every cut-sheet line fully cut before finishing.');
            stop(job,time);if(data.action==='finish')job.completedAt=time;
            audit(job,a,data.action==='finish'?'Finished cutting':'Paused cutting',time);
          }
          return {job};
        }
        const line=job.openings.flatMap(o=>o.lines).find(l=>l.id===data.lineId);if(!line)fail(404,'Cut line not found.');
        if(operation==='resolve'){
          if(!line.shortage||line.shortage.status==='resolved')fail(409,'This material alert is already clear.');
          if(!['acknowledged','resolved'].includes(data.status))fail(400,'Invalid material update.');
          line.shortage.status=data.status;line.shortage.updatedAt=time;
          audit(job,a,`${data.status==='resolved'?'Material ready':'Material alert acknowledged'}: ${line.name}`,time);return {job};
        }
        if(operation==='line'){
          if(!['not-cut','partial','cut'].includes(data.status))fail(400,'Choose a cut status.');
          let completed=data.status==='cut'?line.quantity:data.status==='not-cut'?0:Number(data.completed);
          if(!Number.isInteger(completed)||completed<0||completed>line.quantity||(data.status==='partial'&&completed===line.quantity))fail(400,'Enter a completed quantity below the total for a partial cut.');
          if(data.status==='partial'&&typeof data.outOfMaterial!=='boolean')fail(400,'Please answer whether you are out of material.');
          if(data.status!=='not-cut'||line.completed>0||line.status==='partial')job.cuttingStartedAt??=time;
          if(completed<line.quantity)job.productionCompletedAt=null;
          line.status=data.status;line.completed=completed;
          if(data.status==='partial'&&data.outOfMaterial){
            line.shortage={status:'open',note:text(data.note||'','material note',500,false),createdAt:time,updatedAt:time,by:a.name};
            stop(job,time);
          }else if(line.shortage&&data.status==='cut'){line.shortage.status='resolved';line.shortage.updatedAt=time;}
          job.completedAt=null;
          if(progress(job).complete){stop(job,time);job.completedAt=time;}
          updateCompletion(job,time);
          const opening=job.openings.find(o=>o.lines.includes(line));
          audit(job,a,`${opening.input.name} · ${line.name}${line.section?' · section '+line.section:''}: ${completed}/${line.quantity} cut${data.outOfMaterial?' · out of material (timer paused)':''}${progress(job).complete?' · '+production(job).label:''}`,time);
          return {job};
        }
        fail(404,'Unknown shop action.');
      });
      return worker?workerResponse(response):response;
    }
  };
}
