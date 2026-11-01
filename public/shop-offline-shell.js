// Saving job data and saving the page are separate operations. Only advertise
// offline reopening after the controlling worker confirms its complete cache.
export function createOfflineShell({serviceWorker=globalThis.navigator?.serviceWorker,Channel=globalThis.MessageChannel,timeoutMs=60000,probeMs=5000,notify=()=>{}}={}){
 let state='idle',running;
 const set=value=>{state=value;notify(value);};
 async function prepare(){
  if(running)return running;
  set('preparing');
  running=(async()=>{
   let timer,controlListener,channel,probeTimer,finished=false;
   try{
    if(!serviceWorker||!Channel)throw Error('Offline reopening is unavailable.');
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Offline preparation timed out.')),timeoutMs);});
    const verify=async()=>{
     const registration=serviceWorker.register('/shop-service-worker.js',{updateViaCache:'none'});
     // An already-installed worker can prove its cache while offline even if
     // the browser cannot check the server for a newer script.
     if(serviceWorker.controller)void registration.catch(()=>{});else await registration;
     if(finished)return;
     await serviceWorker.ready;
     if(finished)return;
     if(!serviceWorker.controller)await new Promise(resolve=>{
      controlListener=()=>{if(serviceWorker.controller)resolve();};
      serviceWorker.addEventListener('controllerchange',controlListener);controlListener();
     });
     if(finished)return;
     channel=new Channel();
     const result=await new Promise((resolve,reject)=>{
      probeTimer=setTimeout(()=>reject(Error('Offline page could not be verified.')),probeMs);
      channel.port1.onmessage=event=>resolve(event.data);
      serviceWorker.controller.postMessage({type:'CHECK_SHOP_OFFLINE'},[channel.port2]);
     });
     if(result?.type!=='SHOP_OFFLINE_STATUS'||result.ready!==true)throw Error('Offline files are incomplete.');
    };
    await Promise.race([verify(),timeout]);set('ready');return true;
   }catch{set('error');return false;}
   finally{finished=true;clearTimeout(timer);clearTimeout(probeTimer);if(controlListener)serviceWorker?.removeEventListener('controllerchange',controlListener);channel?.port1.close();channel?.port2.close();}
  })().finally(()=>{running=null;});return running;
 }
 return {prepare,state:()=>state};
}
