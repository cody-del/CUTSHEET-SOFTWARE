// Supabase can fall back to the site's home URL (including for links sent from
// its dashboard). Handle those links before an existing session opens the app.
export function authCallbackURL(value){
 const url=new URL(value),fragment=new URLSearchParams(url.hash.slice(1));
 if(url.pathname==='/auth.html')return null;
 const recovery=fragment.get('type')==='recovery';
 if(!recovery&&!['access_token','refresh_token','error','error_code'].some(key=>fragment.has(key)))return null;
 const target=new URL('/auth.html',url.origin);
 if(recovery)target.searchParams.set('mode','reset');
 // Keep credentials in the fragment, never in a server-visible query string.
 target.hash=url.hash;
 return target.href;
}
