// Keep navigation snapshots current without replacing a form someone is editing.
export const sameSnapshot=(a,b)=>JSON.stringify(a,(key,value)=>key==='serverTime'?undefined:value)===JSON.stringify(b,(key,value)=>key==='serverTime'?undefined:value);
export function startWorkspaceSync(refresh,{canRefresh=()=>true,interval=30000,connected=true}={}){
  let running=false,lastAttempt=Date.now(),message='';
  function status(text){message=text;document.querySelectorAll('[data-workspace-sync]').forEach(el=>el.textContent=text);}
  const synced=()=>status('Synced '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}));
  async function run(force=false){
    if(running||document.hidden||!canRefresh()||(!force&&Date.now()-lastAttempt<interval))return;
    running=true;lastAttempt=Date.now();status('Checking for updates…');
    try{await refresh();synced();}catch{status('Connection interrupted · retrying');}finally{running=false;}
  }
  if(connected)synced();else status('Waiting for connection…');
  const tick=()=>{document.querySelectorAll('[data-workspace-sync]').forEach(el=>el.textContent=message);run();};
  let timer=setInterval(tick,1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)run();});
  window.addEventListener('focus',()=>run());
  window.addEventListener('online',()=>run(true));
  window.addEventListener('offline',()=>status('Offline · showing last loaded view'));
  window.addEventListener('shop-invalidate',()=>{lastAttempt=0;});
  window.addEventListener('pagehide',()=>clearInterval(timer));
  window.addEventListener('pageshow',e=>{if(e.persisted){clearInterval(timer);timer=setInterval(tick,1000);run(true);}});
  return {refresh:()=>run(true)};
}
