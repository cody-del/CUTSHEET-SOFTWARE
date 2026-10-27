import {PDFDocument} from 'pdf-lib';

export const emptyCompanyProfile=()=>({name:'',address:'',phone:'',email:'',website:'',terms:'',logo:null,version:0});
export async function validateCompanyProfile(fields={}){
 if(!fields||typeof fields!=='object'||Array.isArray(fields))throw new Error('Enter your company details.');
 const profile={};
 for(const [key,max] of Object.entries({name:120,address:650,phone:80,email:254,website:200,terms:12000})){
  const value=fields[key]??'';
  if(typeof value!=='string'||value.length>max)throw new Error(`Enter valid company ${key} (up to ${max.toLocaleString()} characters).`);
  profile[key]=value.trim();
 }
 if(!profile.name)throw new Error('Enter your company name.');
 if(profile.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))throw new Error('Enter a valid company email.');
 profile.logo=null;
 if(fields.logo!=null){
  const {name,data}=fields.logo;
  if(typeof name!=='string'||name.length>160||typeof data!=='string'||data.length>350000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data))throw new Error('Choose a PNG, JPG, or WebP logo using Upload logo.');
  const bytes=Buffer.from(data.split(',')[1],'base64');
  if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)>1600||bytes.readUInt32BE(20)>600)throw new Error('Choose a smaller logo image.');
  try{const doc=await PDFDocument.create();await doc.embedPng(bytes);}catch{throw new Error('This logo could not be opened. Upload a different image.');}
  profile.logo={name,data};
 }
 return profile;
}
