import * as THREE from 'three';
export const PRESETS={
 beginner:{name:'Beginner Circuit',desc:'Wide roads · gentle corners',points:[[0,0],[34,0],[52,13],[48,30],[27,36],[12,28],[8,13],[-12,10],[-26,22],[-43,12],[-42,-8],[-24,-20],[-3,-17]]},
 technical:{name:'Technical Circuit',desc:'Tighter corners · technical line',points:[[0,0],[27,0],[39,12],[25,20],[42,32],[26,40],[9,29],[-3,36],[-19,27],[-12,12],[-34,6],[-38,-12],[-18,-24],[3,-18]]},
 hairpin:{name:'Hairpin Circuit',desc:'Repeated hairpins · low speed',points:[[0,0],[40,0],[43,9],[5,11],[3,21],[45,23],[44,33],[-4,31],[-9,21],[-29,19],[-30,8],[-10,7],[-8,-8],[-30,-10],[-28,-20],[4,-20]]},
 speed:{name:'High-speed Circuit',desc:'Long straights · sweeping bends',points:[[0,0],[42,-2],[58,8],[56,24],[36,33],[10,32],[-18,27],[-39,14],[-42,-2],[-25,-17],[5,-21],[30,-15]]}
};
export function makeTrack(scene,preset='beginner',complexity=5,width=12){
  let pts;
  if(preset==='random'){
    const n=7+Math.floor(complexity/2), arr=[];
    for(let i=0;i<n;i++){let a=i/n*Math.PI*2,r=25+Math.random()*25;arr.push([Math.cos(a)*r,Math.sin(a)*r])}
    pts=arr;
  }else pts=PRESETS[preset].points;
  const curve=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(p[0],0,p[1])),true,'catmullrom',.35);
  const count=Math.max(240,pts.length*45), center=curve.getPoints(count);
  const half=width/2, outer=[],inner=[];
  for(let i=0;i<center.length-1;i++){
    const p=center[i],t=center[Math.min(i+1,center.length-1)].clone().sub(center[Math.max(0,i-1)]).normalize();
    const normal=new THREE.Vector3(-t.z,0,t.x);
    outer.push(p.clone().addScaledVector(normal,half));inner.push(p.clone().addScaledVector(normal,-half));
  }
  // Dispose previous track objects
  const old=scene.getObjectByName('trackRoot');if(old){scene.remove(old);disposeTree(old)}
  const root=new THREE.Group();root.name='trackRoot';scene.add(root);
  const roadShape=new THREE.Shape();
  const o=outer.map(p=>new THREE.Vector2(p.x,p.z)), inn=inner.map(p=>new THREE.Vector2(p.x,p.z));
  roadShape.moveTo(o[0].x,o[0].y);for(let p of o.slice(1))roadShape.lineTo(p.x,p.y);roadShape.closePath();
  const hole=new THREE.Path();hole.moveTo(inn[0].x,inn[0].y);for(let p of inn.slice(1).reverse())hole.lineTo(p.x,p.y);hole.closePath();roadShape.holes.push(hole);
  const geo=new THREE.ShapeGeometry(roadShape,2);geo.rotateX(-Math.PI/2);
  const road=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0x535a61,roughness:.92,side:THREE.DoubleSide}));road.position.y=.045;road.receiveShadow=true;root.add(road);
  // Grass infield and subtle world grid
  const grass=new THREE.Mesh(new THREE.PlaneGeometry(240,240),new THREE.MeshStandardMaterial({color:0x35523c,roughness:1}));grass.rotation.x=-Math.PI/2;grass.position.y=-.12;root.add(grass);
  const lineMat=new THREE.LineBasicMaterial({color:0xd5d9d9,transparent:true,opacity:.55});
  const centerLine=new THREE.BufferGeometry().setFromPoints(center.map(p=>new THREE.Vector3(p.x,.08,p.z)));
  root.add(new THREE.LineLoop(centerLine,lineMat));
  const curbMat=new THREE.MeshStandardMaterial({color:0xd9e0e1,roughness:.7});
  const redMat=new THREE.MeshStandardMaterial({color:0xd94b52,roughness:.8});
  for(let side of [outer,inner]){
    for(let i=0;i<side.length;i+=5){
      const p=side[i],q=side[Math.min(i+4,side.length-1)],mid=p.clone().add(q).multiplyScalar(.5);
      const tangent=q.clone().sub(p), mesh=new THREE.Mesh(new THREE.BoxGeometry(.75,.12,tangent.length()+.1),Math.floor(i/5)%2?curbMat:redMat);
      mesh.position.set(mid.x,.12,mid.z);mesh.rotation.y=-Math.atan2(tangent.z,tangent.x)+Math.PI/2;root.add(mesh);
    }
  }
  // Start line across road
  const start=center[0], tangent=center[2].clone().sub(center[center.length-2]).normalize(), normal=new THREE.Vector3(-tangent.z,0,tangent.x);
  const startGeo=new THREE.BufferGeometry(), verts=[];
  for(let i=0;i<12;i++){let off=-half+i*width/11;let p=start.clone().addScaledVector(normal,off);verts.push(p.x,.16,p.z,p.x,.16,p.z)}
  // Checker blocks
  for(let i=0;i<12;i++){let p=start.clone().addScaledVector(normal,-half+i*width/12);let box=new THREE.Mesh(new THREE.BoxGeometry(width/12,.035,.8),i%2?new THREE.MeshStandardMaterial({color:0x15191c}):new THREE.MeshStandardMaterial({color:0xf4f5f2}));box.position.set(p.x,.17,p.z);box.rotation.y=-Math.atan2(tangent.z,tangent.x);root.add(box)}
  return {curve,center,outer,inner,width,start:center[0].clone(),tangent,root};
}
function disposeTree(o){o.traverse(x=>{x.geometry?.dispose();if(Array.isArray(x.material))x.material.forEach(m=>m.dispose());else x.material?.dispose()})}
export function nearestTrackPoint(track,pos){let best=Infinity,idx=0;for(let i=0;i<track.center.length;i++){let d=track.center[i].distanceToSquared(pos);if(d<best){best=d;idx=i}}return {index:idx,distance:Math.sqrt(best),point:track.center[idx]};}
export function onRoad(track,pos){return nearestTrackPoint(track,pos).distance<track.width*.53;}