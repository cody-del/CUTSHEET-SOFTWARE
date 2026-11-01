import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';

const derive=promisify(scrypt);
export const shopAccessStatus=state=>({enabled:!!state.shopAccess?.hash,updatedAt:state.shopAccess?.updatedAt||null});
export async function saveShopCode(state,{code,confirmCode},time){
 if(typeof code!=='string'||code.length<12||code.length>128)throw Object.assign(Error('Use a shop code with 12–128 characters. A short phrase is easy to remember.'),{status:400});
 if(code!==confirmCode)throw Object.assign(Error('The two shop codes do not match.'),{status:400});
 const salt=randomBytes(16).toString('hex'),hash=(await derive(code,salt,64)).toString('hex');
 state.shopAccess={salt,hash,updatedAt:time};
 // A changed code invalidates sessions that used the previous shared code.
 for(const device of Object.values(state.devices))if(device.source==='shop-code')device.revoked=true;
 return shopAccessStatus(state);
}
export async function verifyShopCode(state,code){
 if(typeof code!=='string'||code.length<12||code.length>128)return false;
 const saved=state.shopAccess,actual=await derive(code,saved?.salt||'unconfigured-shop-access',64);
 const expected=Buffer.from(saved?.hash||'00'.repeat(64),'hex');
 return expected.length===actual.length&&timingSafeEqual(actual,expected)&&!!saved?.hash;
}
