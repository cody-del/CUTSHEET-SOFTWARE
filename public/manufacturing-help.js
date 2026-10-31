export function manufacturingMessage(message){
 return String(message).replace(/WRONG MOUNT OPTION OR FRAME(?:\s*!)*/g,'This frame is not supported with the selected mount. Review Frame style and Mount.');
}
export function manufacturingField(message){
 if(/custom setup|sill cuts|side selections/i.test(message))return 'sides';
 if(/mount|frame/i.test(message))return 'mount';
 if(/light gap|height/i.test(message))return 'height';
 if(/width/i.test(message))return 'width';
 const post=/T-post (\d+)/i.exec(message);if(post)return 'post-'+(Number(post[1])-1);
 return 'name';
}
