// Independently transcribed from the four user-supplied printouts on 2026-10-16.
// Customer names are intentionally excluded from public test data.
// SHUTTER FRM means S. Blank mount cells do not identify inside/outside;
// Inside is the comparison setting. ST FRAME identifies two-piece posts.
// Lengths/machining/gap are printed to 0.1 mm; hinge positions to 1 mm.
const base={name:'Printed reference',quantity:1,left:1,right:1,frame:'TR',louver:4,
  mount:'I',sizeMethod:'S',sides:'4W',color:'W',tilt:'Back',stile:'Flat',divider:0,notes:''};
const posts=position=>({construction:'two-piece',positions:[position],sections:[{left:1,right:0},{left:0,right:1}]});
// Each part: name, section (null for a shared part), printed mm, quantity, profile.
export const printedReferences=[
  {id:'standard-22.125x21.5',source:'PRINT SHEET - 2026-09-07T085438.543 (1).pdf',
    opening:{...base,width:22.125,height:21.5,louver:3,right:0},
    parts:[['Louvers',null,415.2,4,'3 INCH BACK'],['Stile · flat',null,496.1,2,'3 INCH FLAT'],
      ['Top rail',null,417.2,1,'LARGE L'],['Bottom rail',null,417.2,1,'MEDIUM M'],
      ['Top frame',null,562,1,'TOP TRF'],['Bottom frame',null,562,1,'BOTTOM TRF'],
      ['Left frame',null,546.1,1,'LEFT TRF'],['Right frame',null,546.1,1,'RIGHT TRF'],['Tiltrod',null,255.5,1,'Back']],
    hinges:[46,450],machining:{'First louver hole from stile top':353.2,'Louver midpoint':207.6},gap:6.8,louversPerPanel:4},
  {id:'standard-47x37.5',source:'PRINT SHEET (87) (1).pdf',
    opening:{...base,width:47,height:37.5,frame:'ST'},
    parts:[['Louvers',null,470.6,16,'4 INCH BACK'],['Stile · regular',null,902.5,2,'4 INCH REG'],
      ['Stile · flat',null,902.5,2,'4 INCH FLAT'],['Top rail',null,472.6,2,'MEDIUM M'],['Bottom rail',null,472.6,2,'MEDIUM M'],
      ['Top frame',null,1193.8,1,'TOP STD'],['Bottom frame',null,1193.8,1,'BOTTOM STD'],
      ['Left frame',null,952.5,1,'LEFT STD'],['Right frame',null,952.5,1,'RIGHT STD'],['Tiltrod',null,665,2,'Back']],
    hinges:[46,451,857],machining:{'First louver hole from stile top':323.8,'Legacy louver midpoint - verify':332.6},gap:4.9,louversPerPanel:8},
  {id:'tpost-72.625x49',source:'T Post Cutsheet (23) (1).pdf',
    opening:{...base,width:72.625,height:49,tposts:posts(35.75)},
    parts:[['Louvers',1,761.3,11,'4 INCH WITH ALUMINUM BACK'],['Top rail',1,763.3,1,'LARGE'],['Bottom rail',1,763.3,1,'LARGE'],
      ['Louvers',2,789.8,11,'4 INCH WITH ALUMINUM BACK'],['Top rail',2,791.8,1,'LARGE'],['Bottom rail',2,791.8,1,'LARGE'],
      ['Stile · flat',null,1194.6,4,'4 INCH FLAT'],['Top frame',null,1844.7,1,'TOP TRF'],['Bottom frame',null,1844.7,1,'BOTTOM TRF'],
      ['Left frame',null,1244.6,1,'LEFT TRF'],['Right frame',null,1244.6,1,'RIGHT TRF'],['T-post assembly',null,1198.6,1,'ST FRAME'],['Tiltrod',null,920,2,'Back']],
    hinges:[46,597,1149],machining:{'First louver hole from stile top':342.3,'Section 1 louver midpoint':380.6,'Section 2 louver midpoint':394.9},gap:6.7,louversPerPanel:11},
  {id:'tpost-72.75x61.5',source:'T Post Cutsheet (21).pdf',
    // Split mode is inferred: H15=2 exactly reproduces the printed 1242 mm rod.
    // The PDF does not print that input. H15=1 returns 1260 mm. Do not infer it by height.
    inferredInput:'divisionMode=split; original setting needs operator confirmation',
    opening:{...base,width:72.75,height:61.5,tposts:posts(36.5),divisionMode:'split'},
    parts:[['Louvers',1,780.3,15,'4 INCH WITH ALUMINUM BACK'],['Top rail',1,782.3,1,'LARGE'],['Bottom rail',1,782.3,1,'MEDIUM'],
      ['Louvers',2,774,15,'4 INCH WITH ALUMINUM BACK'],['Top rail',2,776,1,'LARGE'],['Bottom rail',2,776,1,'MEDIUM'],
      ['Stile · flat',null,1512.1,4,'4 INCH FLAT'],['Top frame',null,1847.9,1,'TOP TRF'],['Bottom frame',null,1847.9,1,'BOTTOM TRF'],
      ['Left frame',null,1562.1,1,'LEFT TRF'],['Right frame',null,1562.1,1,'RIGHT TRF'],['T-post assembly',null,1516.1,1,'ST FRAME'],['Tiltrod',null,1242,2,'Back']],
    hinges:[46,519,993,1466],machining:{'First louver hole from stile top':339.5,'Section 1 louver midpoint':390.2,'Section 2 louver midpoint':387},gap:3.8,louversPerPanel:15}
];
// User-supplied custom example: Trim left/right; Standard top/bottom.
// The source print header says 4W despite the mixed frame rows; the explicit
// side inputs are CW. Keep this case last so older indexed fixtures stay stable.
printedReferences.push({id:'custom-trim-sides-standard-top-bottom',source:'PRINT SHEET - 2026-10-31T094231.621.pdf',
  opening:{...base,width:34.75,height:65.125,right:0,frameStyle:'TR',sides:'CW',frameSides:{top:'ST',bottom:'ST',left:'TR',right:'TR'}},
  parts:[['Louvers',null,735.9,16,'WITH ALUMINUM 4 INCH BACK'],['Aluminum insert',null,713.9,16,''],
    ['Stile · flat',null,1604.2,2,'4 INCH FLAT'],['Top rail',null,737.9,1,'LARGE L'],['Bottom rail',null,737.9,1,'MEDIUM M'],
    ['Top frame',null,882.7,1,'TOP STD'],['Bottom frame',null,882.7,1,'BOTTOM STD'],
    ['Left frame',null,1654.2,1,'LEFT TRF'],['Right frame',null,1654.2,1,'RIGHT TRF'],['Tiltrod',null,1345,1,'Back']],
  hinges:[46,550,1054,1558],machining:{'First louver hole from stile top':343,'Louver midpoint':367.9,'PUSHNUT POS. FROM BOTTOM':752.2},gap:7.4,louversPerPanel:16});
