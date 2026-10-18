import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {calculate,ValidationError,SCOPE,VERSION} from './calculations.mjs';
import {createPDF} from './pdf.mjs';
import {fileStore} from './shop-store.mjs';
import {createShopService} from './shop-service.mjs';
import {shopHandler} from './shop-api.mjs';
const root=resolve(fileURLToPath(new URL('./public/',import.meta.url))),port=Number(process.env.PORT||4190);
const handleShop=shopHandler(createShopService({store:fileStore(process.env.WORKSHOP_DATA_FILE||fileURLToPath(new URL('./.data/workshop.json',import.meta.url))),local:true}));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
    const url=new URL(req.url,`http://127.0.0.1:${port}`);
    if(!['127.0.0.1','localhost'].includes(url.hostname))return json(403,{error:'Local access only.'});
    if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`)return json(403,{error:'Local access only.'});
    if(url.pathname.startsWith('/api/shop/')){
      const request=new Request(new URL(url.pathname+url.search,`http://${req.headers.host}`),{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
      const response=await handleShop(request);
      for(const cookie of response.headers.getSetCookie())res.appendHeader('Set-Cookie',cookie);
      res.writeHead(response.status,Object.fromEntries([...response.headers].filter(([key])=>key!=='set-cookie')));
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    if(url.pathname.startsWith('/api/')){
      if(url.pathname==='/api/info'&&req.method==='GET')return json(200,{scope:SCOPE,version:VERSION});
      if(req.method!=='POST')return json(405,{error:'POST required.'});
      if(req.headers.origin&&!new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`]).has(req.headers.origin))return json(403,{error:'Invalid origin.'});
      if(!req.headers['content-type']?.startsWith('application/json'))return json(415,{error:'Expected JSON.'});
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>512000)return json(413,{error:'Job is too large.'});chunks.push(chunk);}
      let data;try{data=JSON.parse(Buffer.concat(chunks).toString());}catch{return json(400,{error:'Invalid JSON.'});}
      if(url.pathname==='/api/calculate')return json(200,calculate(data));
      if(url.pathname==='/api/pdf'){
        if(data.units!==undefined&&!['mm','in'].includes(data.units))return json(400,{error:'Invalid output unit.'});
        for(const key of ['number','customer'])if(typeof data.job?.[key]!=='string'||data.job[key].length>120)return json(400,{error:`Invalid job ${key}.`});
        const pdf=await createPDF(data.job,{combined:!!data.combined,units:data.units||'mm'});
        res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="shutter-cut-sheets.pdf"','Cache-Control':'no-store'});return res.end(Buffer.from(pdf));
      }
      return json(404,{error:'Unknown endpoint.'});
    }
    if(!['GET','HEAD'].includes(req.method))return json(405,{error:'GET required.'});
    const pathname=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname),path=resolve(root,'.'+pathname);
    if(!path.startsWith(root+sep))return json(403,{error:'Not allowed.'});
    const content=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:content);
  }catch(e){if(e instanceof ValidationError)return json(422,{error:e.message});if(e.code==='ENOENT')return json(404,{error:'Not found.'});console.error(e.message);json(422,{error:'A workbook rule could not be resolved. Check this configuration against the original workbook.'});}
});
server.listen(port,'127.0.0.1',()=>console.log(`Cut sheet: http://127.0.0.1:${port}`));
