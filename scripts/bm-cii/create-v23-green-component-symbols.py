import json, zipfile, os, math
from pathlib import Path
import numpy as np
import trimesh
from trimesh.transformations import rotation_matrix

OUT=Path('/mnt/data/BM_CII_v23_GreenComponentSymbols')
OUT.mkdir(exist_ok=True)
SIDE_PATH=Path('/mnt/data/BM_CII_v22_PlantTopologyInline/BM_CII_Enriched_benchmark_v14_baked_profile.sidecar.json')
if SIDE_PATH.exists():
    side=json.loads(SIDE_PATH.read_text())
else:
    ZIP='/mnt/data/BM_CII_v22_plant_topology_inline_links.zip'
    SIDE='BM_CII_Enriched_benchmark_v14_baked_profile.sidecar.json'
    with zipfile.ZipFile(ZIP) as zz:
        side=json.loads(zz.read(SIDE))
SIDE='BM_CII_Enriched_benchmark_v14_baked_profile.sidecar.json'
(OUT/SIDE).write_text(json.dumps(side, indent=2))

EPS=1e-6
COLORS={
    'pipe':[184,190,200,255],
    'bend':[184,190,200,255],
    'green':[0,155,90,255],
    'green_dark':[0,105,70,255],
    'tee':[160,178,164,255],
    'cap':[130,135,142,255],
    'reducer':[160,166,174,255],
    'stem':[40,80,60,255],
}

def vec(v):
    if v is None: return None
    if isinstance(v,(list,tuple)) and len(v)>=3:
        a=np.array([float(v[0]),float(v[1]),float(v[2])],float)
        return a if np.isfinite(a).all() else None
    if isinstance(v,dict):
        vals=[v.get('x',v.get('X',v.get('east',v.get('E')))),v.get('y',v.get('Y',v.get('up',v.get('U')))),v.get('z',v.get('Z',v.get('south',v.get('S'))))]
        if all(x is not None for x in vals):
            a=np.array([float(x) for x in vals],float)
            return a if np.isfinite(a).all() else None
    return None

def cstart(c): return vec(c.get('startGlbMm') or c.get('ep1') or c.get('start') or c.get('p1') or c.get('coOrds') or c.get('centrePoint'))
def cend(c): return vec(c.get('endGlbMm') or c.get('ep2') or c.get('end') or c.get('p2') or c.get('branch1Point') or c.get('centrePoint'))
def diam(c,fallback=50):
    for k in ['diameterMm','outsideDiameterMm','outsideDiameter','bore']:
        try:
            x=float(c.get(k) or 0)
            if x>0: return x
        except Exception: pass
    for ep in ['ep1','ep2']:
        try:
            x=float((c.get(ep) or {}).get('bore') or 0)
            if x>0: return x
        except Exception: pass
    return fallback

def transform_z_to(start,end):
    start=np.asarray(start,float); end=np.asarray(end,float); d=end-start; L=np.linalg.norm(d)
    if L<EPS: return None,0
    mid=(start+end)/2
    z=np.array([0,0,1.0]); u=d/L
    axis=np.cross(z,u); dot=np.dot(z,u)
    if np.linalg.norm(axis)<EPS:
        R=np.eye(4) if dot>0 else rotation_matrix(math.pi,[1,0,0])
    else:
        R=rotation_matrix(math.acos(max(-1,min(1,dot))), axis)
    R[:3,3]=mid
    return R,L

def cyl_between(start,end,r,color,sections=32,name=None):
    if start is None or end is None: return None
    T,L=transform_z_to(start,end)
    if T is None or L<0.01: return None
    m=trimesh.creation.cylinder(radius=float(max(r,0.01)), height=float(L), sections=sections, transform=T)
    m.visual.face_colors=color
    m.metadata={'name':name or 'cylinder'}
    return m

def frustum_z(radius_bottom, radius_top, height, sections=40):
    rb=max(float(radius_bottom),0.01); rt=max(float(radius_top),0.01); h=max(float(height),0.01)
    angles=np.linspace(0,2*math.pi,sections,endpoint=False)
    bottom=np.column_stack([rb*np.cos(angles),rb*np.sin(angles),np.full(sections,-h/2)])
    top=np.column_stack([rt*np.cos(angles),rt*np.sin(angles),np.full(sections,h/2)])
    vertices=np.vstack([bottom,top,[[0,0,-h/2],[0,0,h/2]]])
    faces=[]
    for i in range(sections):
        j=(i+1)%sections
        faces.append([i,j,sections+j])
        faces.append([i,sections+j,sections+i])
        faces.append([2*sections,i,j])
        faces.append([2*sections+1,sections+j,sections+i])
    return trimesh.Trimesh(vertices=vertices, faces=faces, process=False)

def frustum_between(start,end,r_start,r_end,color,sections=40,name=None):
    if start is None or end is None: return None
    T,L=transform_z_to(start,end)
    if T is None or L<0.01: return None
    m=frustum_z(r_start,r_end,L,sections)
    m.apply_transform(T)
    m.visual.face_colors=color
    m.metadata={'name':name or 'frustum'}
    return m

def add(scene, geom, name, meta=None):
    if geom is None: return False
    if meta: geom.metadata.update(meta)
    scene.add_geometry(geom,node_name=name,geom_name=name)
    return True

def end_data(s,e):
    if s is None or e is None: return None
    d=e-s; L=np.linalg.norm(d)
    if L<EPS: return None
    return d/L,L,(s+e)/2

def axis_side(axis):
    axis=np.asarray(axis,float); axis=axis/(np.linalg.norm(axis)+EPS)
    up=np.array([0,1,0.0])
    if abs(np.dot(axis,up))<0.85:
        side=up-axis*np.dot(axis,up)
    else:
        ref=np.array([1,0,0.0]); side=ref-axis*np.dot(axis,ref)
    n=np.linalg.norm(side)
    return np.array([1,0,0.0]) if n<EPS else side/n

def render_full_cylinder(scene,name,s,e,R,color,stats_key,stats,scale=1.0,sections=32,meta=None):
    ok=add(scene,cyl_between(s,e,R*scale,color,sections,name),name,meta)
    if ok: stats[stats_key]=stats.get(stats_key,0)+1
    else: stats['skipped']=stats.get('skipped',0)+1

def render_double_cone_rigid(scene,name,s,e,R,stats,meta=None):
    dat=end_data(s,e)
    if not dat:
        stats['skipped']+=1; return
    axis,L,mid=dat
    end_radius=R*1.5
    center_radius=R*1.0
    add(scene,frustum_between(s,mid,end_radius,center_radius,COLORS['green'],40,name+'-left-cone'),name+'-left-cone',{**(meta or {}),'componentKind':'RIGID','componentSymbol':'green-double-cone-converging-to-midpoint','topologyContract':'component-span-filled-no-gap'})
    add(scene,frustum_between(mid,e,center_radius,end_radius,COLORS['green'],40,name+'-right-cone'),name+'-right-cone',{**(meta or {}),'componentKind':'RIGID','componentSymbol':'green-double-cone-converging-to-midpoint','topologyContract':'component-span-filled-no-gap'})
    add(scene,cyl_between(s,e,R*0.985,COLORS['pipe'],32,name+'-pipe-core'),name+'-pipe-core',{**(meta or {}),'componentKind':'RIGID_PIPE_CORE','componentSymbol':'continuity-core'})
    stats['rigid']+=1

def render_flange(scene,name,s,e,R,stats,flange_pair=False,meta=None):
    dat=end_data(s,e)
    if not dat:
        stats['skipped']+=1; return
    axis,L,center=dat
    add(scene,cyl_between(s,e,R*1.005,COLORS['pipe'],32,name+'-pipe-core'),name+'-pipe-core',{**(meta or {}),'componentKind':'FLANGE_PIPE_CORE','componentSymbol':'continuity-core'})
    flange_radius=R*1.4
    if flange_pair:
        mid=center
        add(scene,cyl_between(s,mid,flange_radius,COLORS['green'],48,name+'-collar-a'),name+'-collar-a',{**(meta or {}),'componentKind':'FLANGE_COLLAR','componentSymbol':'green-flange-pair-1p4d-full-source-thickness'})
        add(scene,cyl_between(mid,e,flange_radius,COLORS['green'],48,name+'-collar-b'),name+'-collar-b',{**(meta or {}),'componentKind':'FLANGE_COLLAR','componentSymbol':'green-flange-pair-1p4d-full-source-thickness'})
    else:
        add(scene,cyl_between(s,e,flange_radius,COLORS['green'],48,name+'-collar'),name+'-collar',{**(meta or {}),'componentKind':'FLANGE_COLLAR','componentSymbol':'green-flange-1p4d-source-thickness'})
    stats['flange']+=1

def render_handwheel(scene,name,center,axis,R,body_radius):
    side=axis_side(axis)
    stem_base=center+side*body_radius*0.96
    stem_tip=center+side*body_radius*1.58
    add(scene,cyl_between(stem_base,stem_tip,max(R*0.07,0.8),COLORS['stem'],12,name+'-stem'),name+'-stem',{'componentKind':'VALVE_STEM','componentSymbol':'center-stem'})
    wheel_center=stem_tip+side*max(R*0.08,1.0)
    tor=trimesh.creation.torus(major_radius=max(R*0.32,3.0), minor_radius=max(R*0.035,0.5), major_segments=36, minor_segments=8)
    z=np.array([0,0,1.0]); u=side/(np.linalg.norm(side)+EPS); ax=np.cross(z,u); dot=np.dot(z,u)
    if np.linalg.norm(ax)<EPS:
        M=np.eye(4) if dot>0 else rotation_matrix(math.pi,[1,0,0])
    else:
        M=rotation_matrix(math.acos(max(-1,min(1,dot))),ax)
    M[:3,3]=wheel_center
    tor.apply_transform(M)
    tor.visual.face_colors=COLORS['green_dark']
    tor.metadata={'name':name+'-handwheel','componentKind':'VALVE_HANDWHEEL','componentSymbol':'center-handwheel'}
    add(scene,tor,name+'-handwheel')

def render_valve(scene,name,s,e,R,stats,flanged=False,meta=None):
    dat=end_data(s,e)
    if not dat:
        stats['skipped']+=1; return
    axis,L,center=dat
    body_end_radius=R*1.03
    body_center_radius=R*1.5
    add(scene,frustum_between(s,center,body_end_radius,body_center_radius,COLORS['green'],48,name+'-body-a'),name+'-body-a',{**(meta or {}),'componentKind':'VALVE_BODY','componentSymbol':'green-tapered-valve-1p5d-centre','topologyContract':'component-span-filled-no-gap'})
    add(scene,frustum_between(center,e,body_center_radius,body_end_radius,COLORS['green'],48,name+'-body-b'),name+'-body-b',{**(meta or {}),'componentKind':'VALVE_BODY','componentSymbol':'green-tapered-valve-1p5d-centre','topologyContract':'component-span-filled-no-gap'})
    collar_thk=min(max(R*0.20,3.0), max(L*0.12,1.0))
    collar_radius=R*1.4
    for cc,label in [(s+axis*collar_thk*0.50,'start'),(e-axis*collar_thk*0.50,'end')]:
        add(scene,cyl_between(cc-axis*collar_thk/2,cc+axis*collar_thk/2,collar_radius,COLORS['green'],48,name+f'-{label}-flange'),name+f'-{label}-flange',{**(meta or {}),'componentKind':'VALVE_FLANGE_COLLAR','componentSymbol':'green-end-collar-1p4d'})
    render_handwheel(scene,name,center,axis,R,body_center_radius)
    stats['valve']+=1

def render_olet(scene,c,name,s,e,R,stats,meta=None):
    center=vec(c.get('centrePoint') or c.get('centerGlbMm'))
    if center is None and s is not None and e is not None: center=(s+e)/2
    if center is None: center=s if s is not None else e
    if center is None:
        stats['skipped']+=1; return
    if s is not None and e is not None and np.linalg.norm(e-s)>0.1:
        add(scene,cyl_between(s,e,R*0.92,COLORS['tee'],24,name+'-olet-span'),name+'-olet-span',{**(meta or {}),'componentKind':'OLET','topologyContract':'filled-source-span'})
    stats['tee']+=1

def build_scene(mode='engineering'):
    scene=trimesh.Scene()
    stats={'pipe':0,'bend':0,'valve':0,'flange':0,'rigid':0,'tee':0,'reducer':0,'cap':0,'skipped':0}
    skipped_types=[]
    for c in side.get('components',[]):
        typ=str(c.get('type','')).upper()
        if typ in {'SUPPORT','RESTRAINT','GUIDE','LINESTOP','LIMIT','REST','NODE_LABEL','MESSAGE-SQUARE','MESSAGE-CIRCLE','ANNOTATION','CALL_OUT','CALLOUT','ISONOTE'}:
            stats['skipped']+=1; skipped_types.append(typ); continue
        s=cstart(c); e=cend(c); R=max(diam(c)/2,0.5)
        name=c.get('id') or typ.lower()
        meta={'sourceComponentType':typ,'sourceId':str(c.get('id') or ''),'fromNode':str(c.get('fromNode') or ''),'toNode':str(c.get('toNode') or '')}
        if typ in {'PIPE','PIPE_TRIMMED_FOR_BEND'}:
            render_full_cylinder(scene,name,s,e,R,COLORS['pipe'],'pipe',stats,scale=1.0,sections=32,meta={**meta,'topologyContract':'straight-pipe-span'})
        elif typ in {'RIGID','RIGID_UNSPECIFIED'}:
            render_double_cone_rigid(scene,name,s,e,R,stats,meta)
        elif typ in {'VALVE','VALVE_FLANGED'}:
            render_valve(scene,name,s,e,R,stats,flanged=(typ=='VALVE_FLANGED'),meta=meta)
        elif typ in {'FLANGE','FLANGE_PAIR'}:
            render_flange(scene,name,s,e,R,stats,flange_pair=(typ=='FLANGE_PAIR'),meta=meta)
        elif typ in {'TEE','OLET'}:
            render_olet(scene,c,name,s,e,R,stats,meta)
        else:
            stats['skipped']+=1; skipped_types.append(typ)
    for idx,arc in enumerate(side.get('bendTrimArcs',[]) or []):
        pts=[vec(p) for p in (arc.get('pointsGlbMm') or arc.get('points') or [])]
        pts=[p for p in pts if p is not None]
        R=max(float(arc.get('pipeRadiusMm') or arc.get('radiusPipeMm') or 10),0.5)
        for j in range(len(pts)-1):
            ok=add(scene,cyl_between(pts[j],pts[j+1],R,COLORS['bend'],20,f'bend-{idx}-{j}'),f'bend-{idx}-{j}',{'sourceComponentType':'BEND','componentKind':'BEND','bendContract':'compact-elbow-arc-not-route-spline','bendRecordId':str(arc.get('recordId') or arc.get('id') or idx)})
            if ok: stats['bend']+=1
    scene.metadata={'schema':'BM_CII_v23_green_component_symbols','disabled':['supports','restraints','annotations','nodeLabels','callouts','debugMarkers'],'fix':'green component symbols: valve tapered 1.5D centre with handwheel; flange 1.4D collar full source thickness; rigid double-cone converging to midpoint','stats':stats,'skippedTypes':sorted(set(skipped_types))}
    return scene,stats

files=[]
for mode in ['engineering','temp1']:
    scene,stats=build_scene(mode)
    out=OUT/f'BM_CII_Enriched_v23_green_component_symbols_{mode}.glb'
    scene.export(out)
    files.append(out)
    print(out, out.stat().st_size, stats)
report=OUT/'BM_CII_Enriched_v23_green_component_symbols.md'
report.write_text('# BM_CII v23 Green component symbols\n\nTechnical fix after v22 screenshot/user component-symbol instruction:\n\n- RIGID / VALVE / FLANGE are green.\n- VALVE / VALVE_FLANGED: tapered body, centre diameter = 1.5 x pipe OD, with centre stem and handwheel.\n- FLANGE / FLANGE_PAIR: green collar(s), diameter = 1.4 x pipe OD, thickness uses the full source/InputXML element span.\n- RIGID_UNSPECIFIED: green double-cone sleeve, larger at both ends and converging at midpoint of element length.\n- REDUCER geometry remains reserved only for actual reducer source types.\n- Supports/restraints/annotations/node labels/debug markers remain OFF.\n\nVisual acceptance: pending user review.\nBaseline frozen: no.\n')
files.append(report)
zip_path='/mnt/data/BM_CII_v23_green_component_symbols_links.zip'
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as zz:
    for f in files+[OUT/SIDE]:
        zz.write(f, f.name)
print('zip',zip_path,os.path.getsize(zip_path))
