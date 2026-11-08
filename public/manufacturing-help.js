// This workbook limit is advisory for the custom shop. Keep every other
// warning blocking, including unknown warnings and light-gap failures.
export const isPanelWidthWarning=message=>/^TOO WIDE PANEL(?:\s*!)*$/.test(String(message).trim());
export const blockingWarnings=result=>(result?.warnings||[]).filter(message=>!isPanelWidthWarning(message));
export const panelWidthNotes=result=>(result?.warnings||[]).some(isPanelWidthWarning)?['Custom panel width: exceeds the workbook\'s standard panel-width limit.']:[];
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
