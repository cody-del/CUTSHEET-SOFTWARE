import supabaseCA from './source/supabase-ca.json' with {type:'json'};

export function databaseOptions(env=process.env){
  const connectionString=env.CUTSHEET_DATABASE_URL||env.NETLIFY_DB_URL;
  if(!connectionString)return null;
  let url;
  try{
    url=new URL(connectionString);
    if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname)throw new Error();
  }catch{
    throw new Error('The workshop database URL is invalid. Check the server configuration.');
  }
  // Encode the raw password once so punctuation cannot change the connection URL.
  if(env.CUTSHEET_DATABASE_PASSWORD){
    url.password=encodeURIComponent(env.CUTSHEET_DATABASE_PASSWORD);
    url.searchParams.delete('password');
  }
  const options={max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:8000};
  const ca=env.CUTSHEET_DATABASE_CA||(/\.pooler\.supabase\.com$/.test(url.hostname)?supabaseCA.certificate:null);
  if(ca){
    // pg lets URL SSL parameters replace the entire ssl object, including the CA.
    for(const key of ['ssl','sslmode','sslcert','sslkey','sslrootcert','uselibpqcompat'])url.searchParams.delete(key);
    options.ssl={ca:ca.replace(/\\n/g,'\n'),rejectUnauthorized:true};
  }
  return {...options,connectionString:url.toString()};
}
