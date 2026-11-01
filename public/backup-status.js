import {accountFetch} from './account-storage.js';
export async function showBackupStatus(){
 const box=document.querySelector('[data-backup-status]');if(!box)return;
 try{
  const response=await accountFetch('/api/backup/status',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error();const info=await response.json();
  const stale=!info.lastSuccess||Date.now()-info.lastSuccess>2*3600000;
  box.replaceChildren();box.className=stale||info.lastError?'backup-status needs-attention':'backup-status';
  const message=document.createElement('p');message.textContent=info.lastError?'Backup needs attention. The last attempt failed.':stale?'Backup needs attention. No verified backup in the past two hours.':'Automatic backup verified · '+new Date(info.lastSuccess).toLocaleString();box.append(message);
  if(info.lastSuccess){const detail=document.createElement('small');detail.textContent=`Last verified: ${new Date(info.lastSuccess).toLocaleString()} · ${Math.ceil(info.bytes/1024)} KB. Hourly copies for 48 hours; daily copies for 30 days.`;box.append(detail);}
  if(info.copies?.length){const label=document.createElement('label');label.textContent='Saved backups';const select=document.createElement('select');select.setAttribute('aria-label','Saved backups');for(const key of info.copies){const option=document.createElement('option');option.value=key;option.textContent=new Date(Number(key.slice(0,13))).toLocaleString();select.append(option);}label.append(select);box.append(label);const button=document.createElement('button');button.className='btn';button.textContent='Download saved backup';button.onclick=async()=>{button.disabled=true;try{const r=await accountFetch('/api/backup/download?copy='+encodeURIComponent(select.value),{cache:'no-store'});if(!r.ok)throw Error();const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download='5-day-company-backup-'+select.value;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch{message.textContent='Download failed. Try again or download a current company backup below.';}finally{button.disabled=false;}};box.append(button);}
 }catch{box.className='backup-status needs-attention';box.textContent='Automatic backup status could not be checked. Use Download company backup to keep a current copy.';}
}

export async function showBackupAlert(){
 const box=document.querySelector('[data-backup-alert]');if(!box)return;
 try{const r=await accountFetch('/api/backup/status',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();const info=await r.json();
  if(info.lastSuccess&&!info.lastError&&Date.now()-info.lastSuccess<=2*3600000){box.hidden=true;return;}
  box.textContent='Company backup needs attention. ';const link=document.createElement('a');link.href='/settings.html';link.textContent='Review backups →';box.append(link);
 }catch{box.textContent='Could not check company backups. Check Settings when connected.';}
 box.className='backup-status needs-attention';box.hidden=false;
}
