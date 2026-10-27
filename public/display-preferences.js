// Text size is a personal device preference, separate from shared job data.
const KEY='cutsheet-text-size-v1',DEFAULT=1;
export const textSizeOptions=[{value:0,label:'Standard'},{value:1,label:'+1 pt'},{value:2,label:'+2 pt'}];
const valid=value=>['0','1','2'].includes(String(value));
function read(){try{const saved=localStorage.getItem(KEY);return saved!==null&&valid(saved)?Number(saved):DEFAULT;}catch{return DEFAULT;}}
let size=read();
export const getTextSize=()=>size;
function apply(value){
 size=value;
 if(!globalThis.document)return;
 document.documentElement.dataset.textSize=String(value);
 document.querySelectorAll('input[name="text-size"]').forEach(input=>{input.checked=Number(input.value)===value;});
}
export function saveTextSize(value){
 if(!valid(value))throw new Error('Choose Standard, +1 pt, or +2 pt.');
 apply(Number(value));
 try{localStorage.setItem(KEY,String(value));return true;}catch{return false;}
}
globalThis.addEventListener?.('storage',event=>{if(event.key===KEY||event.key===null)apply(read());});
apply(size);
