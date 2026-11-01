import {accountAPI} from '../../account-runtime.mjs';
import {backupStorage} from '../../backup-runtime.mjs';
export const config={path:'/api/backup/*'};
const json=(status,data,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
export default request=>accountAPI.protect(request,async(_request,identity)=>{
 if(request.method!=='GET')return json(405,{error:'GET required.'});
 const url=new URL(request.url),backups=backupStorage(),id=identity.ownerId;
 try{
  if(url.pathname.endsWith('/status'))return json(200,{...await backups.status(id),copies:await backups.list(id)});
  if(url.pathname.endsWith('/download'))return json(200,await backups.download(id,url.searchParams.get('copy')),{'Content-Disposition':'attachment; filename="company-backup.json"'});
  return json(404,{error:'Unknown backup action.'});
 }catch{return json(503,{error:'Backup status is unavailable. Your manual company backup is still available.'});}
});
