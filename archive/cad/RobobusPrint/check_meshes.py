from pathlib import Path
import json,struct,numpy as np
ROOT=Path(__file__).resolve().parents[1]/'print_v4'
def read_stl(path):
    data=path.read_bytes();n=struct.unpack_from('<I',data,80)[0]
    if len(data)!=84+50*n:raise ValueError('Not binary STL '+str(path))
    dt=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')])
    return np.frombuffer(data,dt,count=n,offset=84)['vertices'].astype(float)
def write_stl(path,tri):
    dt=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')]);records=np.zeros(len(tri),dtype=dt);records['vertices']=tri
    normals=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);lens=np.linalg.norm(normals,axis=1);normals[lens>0]/=lens[lens>0,None];records['normal']=normals
    path.write_bytes(b'APAS printable bus - millimetres'.ljust(80,b' ')+struct.pack('<I',len(tri))+records.tobytes())
def check(path):
    t=read_stl(path);v,inv=np.unique(np.round(t.reshape(-1,3),5),axis=0,return_inverse=True);f=inv.reshape(-1,3)
    edges=np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]);ordered=np.sort(edges,axis=1)
    _,idx,counts=np.unique(ordered,axis=0,return_inverse=True,return_counts=True)
    direction=np.where(edges[:,0]<edges[:,1],1,-1);balance=np.bincount(idx,weights=direction)
    volume=float(np.einsum('ij,ij->i',t[:,0],np.cross(t[:,1],t[:,2])).sum()/6)
    area=np.linalg.norm(np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]),axis=1)/2
    parent=np.arange(len(v))
    def find(x):
        while parent[x]!=x:parent[x]=parent[parent[x]];x=parent[x]
        return x
    for a,b in ordered:
        a=find(a);b=find(b)
        if a!=b:parent[b]=a
    cc=len({find(i) for i in range(len(v))})
    size=t.max(axis=(0,1))-t.min(axis=(0,1))
    report={'file':path.name,'triangles':len(t),'size_mm':size.tolist(),'min_mm':t.min(axis=(0,1)).tolist(),'volume_mm3':volume,'boundary_or_nonmanifold_edges':int(np.count_nonzero(counts!=2)),'inconsistent_edges':int(np.count_nonzero(balance)),'degenerate_triangles':int(np.count_nonzero(area<1e-8)),'connected_components':cc,'fits_reserved_envelope':bool(np.all(size<=np.array([240,210,260])+.01))}
    report['pass']=volume>0 and cc==1 and report['fits_reserved_envelope'] and not any(report[k] for k in ('boundary_or_nonmanifold_edges','inconsistent_edges','degenerate_triangles'))
    return report
if __name__=='__main__':
    reports=[check(p) for p in sorted((ROOT/'stl').glob('*.stl'))]
    (ROOT/'mesh_validation.json').write_text(json.dumps(reports,indent=2))
    print(json.dumps({'count':len(reports),'failed':[x for x in reports if not x['pass']]},indent=2))
