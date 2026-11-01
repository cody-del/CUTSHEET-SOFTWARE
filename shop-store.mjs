import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';

export const emptyWorkshop=()=>({schema:1,jobs:{},devices:{},pairings:{},attempts:{}});

// One local server owns this store. Atomic rename prevents half-written files;
// the queue serializes reads and writes from concurrent browser requests.
export function fileStore(path) {
  let queue=Promise.resolve();
  return {transaction(fn,{readOnly=false}={}){
    const work=queue.then(async()=>{
      let state;try{state=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state=emptyWorkshop();}
      const result=await fn(state);
      if(readOnly)return result;
      await mkdir(dirname(path),{recursive:true});
      const temporary=path+'.'+randomUUID()+'.tmp';
      await writeFile(temporary,JSON.stringify(state),{mode:0o600});await rename(temporary,path);
      return result;
    });queue=work.catch(()=>{});return work;
  }};
}

// Hosted requests share a transaction lock. Nothing is stored on the temporary
// Netlify function filesystem. A failed request rolls back the entire operation.
export function postgresStore(pool) {
  let initialized;
  async function init(){
    await pool.query('CREATE TABLE IF NOT EXISTS cutsheet_workshop (id text PRIMARY KEY, data jsonb NOT NULL)');
    await pool.query('INSERT INTO cutsheet_workshop (id,data) VALUES ($1,$2) ON CONFLICT DO NOTHING',['main',emptyWorkshop()]);
  }
  return {async transaction(fn,{readOnly=false}={}){
    if(!initialized)initialized=init().catch(e=>{initialized=null;throw e;});await initialized;
    const client=await pool.connect();
    try{
      await client.query(readOnly?'BEGIN READ ONLY':'BEGIN');
      const {rows}=await client.query('SELECT data FROM cutsheet_workshop WHERE id=$1'+(readOnly?'':' FOR UPDATE'),['main']);
      const state=rows[0].data,result=await fn(state);
      if(!readOnly)await client.query('UPDATE cutsheet_workshop SET data=$2 WHERE id=$1',['main',state]);
      await client.query('COMMIT');return result;
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }};
}
