// Serialize saves. Edits made while a request is in flight become the next save,
// and a failed/conflicting request keeps the draft dirty instead of overwriting it.
export function createAutosave({write,onState=()=>{},delay=900}){
 let revision=0,saved=0,timer=null,running=null,error=null,generation=0;
 const dirty=()=>revision!==saved;
 const state=()=>onState({dirty:dirty(),saving:!!running,error});
 async function drain(){
  const current=generation;
  while(current===generation&&dirty()){
   const target=revision;
   try{await write();if(current===generation){saved=target;error=null;}}catch(e){if(current!==generation)return;error=e;throw e;}
  }
 }
 async function flush(){
  clearTimeout(timer);timer=null;
  if(running){await running;if(!dirty())return;}
  if(!dirty())return;
  error=null;running=drain();state();
  try{await running;}finally{running=null;state();}
 }
 return {dirty,flush,
  changed(){revision++;error=null;clearTimeout(timer);timer=setTimeout(()=>{flush().catch(()=>{});},delay);state();},
  reset(){generation++;clearTimeout(timer);timer=null;saved=revision;error=null;state();}
 };
}
