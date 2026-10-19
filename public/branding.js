import {accountStorage} from './account-storage.js';
const BRANDING_KEY='cut-sheet-branding-v1';
const MAX_DATA_LENGTH=1200000;
export function loadLogo(storage=accountStorage){
  try{const logo=JSON.parse(storage.getItem(BRANDING_KEY));return logo&&typeof logo.name==='string'&&typeof logo.data==='string'&&logo.data.length<=MAX_DATA_LENGTH&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(logo.data)?logo:null;}catch{return null;}
}
export function saveLogo(logo,storage=accountStorage){
  if(logo)storage.setItem(BRANDING_KEY,JSON.stringify(logo));else storage.removeItem(BRANDING_KEY);
}
export async function readLogoFile(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose a PNG, JPG, or WebP image.');
  if(file.size>5*1024*1024)throw new Error('Choose an image smaller than 5 MB.');
  let bitmap;
  try{bitmap=await createImageBitmap(file);}catch{throw new Error('This image could not be opened. Try another PNG, JPG, or WebP file.');}
  try{
    const scale=Math.min(1,640/bitmap.width,240/bitmap.height),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext('2d');context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const data=canvas.toDataURL('image/png');
    if(data.length>MAX_DATA_LENGTH)throw new Error('This logo is too detailed to save. Try a smaller image.');
    return {data,name:file.name.slice(0,160)};
  }finally{bitmap.close();}
}
