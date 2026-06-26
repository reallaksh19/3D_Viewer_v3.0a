function t(v){return String(v??'').trim()}
function esc(v){return t(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function n(v){const x=Number(String(v??'').replace(/,/g,'')); return Number.isFinite(x)?x:null}
function pos(v){const a=t(v).match(/-?\d+(?:\.\d+)?/g)?.map(Number)||[]; return a.length>=3?a:null}
function dist(a,b){const p=pos(a),q=pos(b); if(!p||!q)return null; const d=Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]); return Number.isFinite(d)&&d>0?d:null}
function tag(name,value){return `<${name}>${esc(value)}</${name}>`}
function val(node,branch,key,fallback=''){return t(node?.[key]||branch?.[key]||fallback)}
export function recalcCustomInputElementLengths(model){
  for(const branch of model?.branches||[]){let prev=null; const byRef=new Map();
    for(const node of branch.nodes||[]){const ref=t(node.componentRefNo); if(ref){if(!byRef.has(ref))byRef.set(ref,[]); byRef.get(ref).push(node);} }
    for(const group of byRef.values()) if(group.length>1){let best=0; for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++) best=Math.max(best,dist(group[i].position,group[j].position)||0); if(best>0) group.forEach(nd=>{nd.elementLengthMm=best.toFixed(3)});}
    for(const node of branch.nodes||[]){if(!t(node.elementLengthMm)&&prev){const d=dist(prev.position,node.position); if(d) node.elementLengthMm=d.toFixed(3);} prev=node.position?node:prev;}
  }
  return model;
}
export function dropShortCustomInputNodes(model,{enabled=true,thresholdMm=6}={}){ if(!enabled)return model; for(const b of model?.branches||[]) b.nodes=(b.nodes||[]).filter(nd=>{const len=n(nd.elementLengthMm); return len===null||len>thresholdMm;}); return model; }
function nodeXml(branch,node){
  const comp=val(node,branch,'componentType','PIPE');
  const lines=['<Node>',tag('NodeNumber',node.nodeNumber),tag('NodeName',node.nodeName||''),tag('Endpoint',node.endpoint||'1'),tag('Rigid',node.rigid||'0'),tag('ComponentType',comp),tag('Weight',node.weight||'0'),tag('ComponentRefNo',node.componentRefNo),tag('ConnectionType',''),tag('OutsideDiameter',node.outsideDiameter||''),tag('WallThickness',val(node,branch,'wallThickness','0')),tag('CorrosionAllowance',val(node,branch,'corrosionAllowance','0')),tag('InsulationThickness',val(node,branch,'insulationThickness','0')),tag('Position',node.position||'0 0 0'),tag('BendRadius',node.bendRadius||'0'),tag('SIF',node.sif||'0'),tag('PipingClass',val(node,branch,'pipingClass')),tag('Rating',val(node,branch,'rating')),tag('BoreMm',val(node,branch,'boreMm')),tag('ElementLengthMm',node.elementLengthMm||''),tag('MaterialName',val(node,branch,'materialName')),tag('MaterialCode',val(node,branch,'materialCode'))];
  if(node.dtxr) lines.push(tag('DTXR_POS',node.dtxr));
  for(const r of node.restraints||[]) lines.push(`<CustomRestraint>${tag('Type',r.type)}${tag('Direction',r.direction)}${tag('Gap',r.gap)}${tag('Stiffness',r.stiffness)}${tag('Friction',r.friction)}</CustomRestraint>`);
  lines.push('</Node>'); return lines.join('');
}
export function buildCustomInputXml(model,options={}){
  const work=JSON.parse(JSON.stringify(model||{branches:[]}));
  recalcCustomInputElementLengths(work); dropShortCustomInputNodes(work,{enabled:options.dropShortElementLengthNodes!==false,thresholdMm:Number(options.shortElementLengthDropThresholdMm||6)});
  const out=['<?xml version="1.0" encoding="UTF-8"?>','<Root>'];
  for(const b of work.branches||[]){out.push('<Branch>',tag('Branchname',b.branchName),tag('LineNo',b.lineKey||''),'<Pressure>',tag('Pressure1',b.p1||''),tag('HydroPressure',b.hydroPressure||''),'</Pressure>','<Temperature>',tag('Temperature1',b.t1||''),tag('Temperature2',b.t2||''),tag('Temperature3',b.t3||''),'</Temperature>',tag('FluidDensity',b.fluidDensity||'')); for(const nd of b.nodes||[]) out.push(nodeXml(b,nd)); out.push('</Branch>');}
  out.push('</Root>'); return out.join('\n');
}
