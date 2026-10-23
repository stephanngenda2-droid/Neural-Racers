import * as THREE from 'three';
import {NeuralNetwork} from './neural.js';
import {nearestTrackPoint,onRoad} from './track.js';
const SENSOR_ANGLES=[0,-.32,.32,-.72,.72,-1.12,1.12],RANGE=18;
const COLORS=[0xff9955,0x5ddfea,0x9c8cff,0xffcf5b,0xff668b,0x75e3a1,0x8cb7ff,0xf2a5ff];
export class RacerSimulation{
 constructor(scene,track,pop=36){this.scene=scene;this.track=track;this.population=pop;this.generation=1;this.agents=[];this.history=[];this.running=false;this.elapsed=0;this.bestLap=null;this.collisions=true;this.selectedId=0;this.trails=true;this.sensorsVisible=false;this.labels=true;this.spawn();}
 setTrack(track){this.track=track;this.spawn()}
 spawn(networks=null){this.clear();this.elapsed=0;this.agents=[];for(let i=0;i<this.population;i++){const net=networks?.[i]||new NeuralNetwork();const a=this.makeAgent(i+1,net);this.agents.push(a)}this.selectedId=1;}
 makeAgent(id,brain){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.BoxGeometry(1.2,.38,2.05),new THREE.MeshStandardMaterial({color:COLORS[(id-1)%COLORS.length],roughness:.4,metalness:.2}));body.position.y=.48;body.castShadow=true;g.add(body);const cockpit=new THREE.Mesh(new THREE.BoxGeometry(.68,.28,.7),new THREE.MeshStandardMaterial({color:0x18242a,metalness:.3,roughness:.3}));cockpit.position.set(0,.78,-.1);g.add(cockpit);for(let x of [-.66,.66])for(let z of [-.62,.62]){const wheel=new THREE.Mesh(new THREE.BoxGeometry(.18,.27,.45),new THREE.MeshStandardMaterial({color:0x17191c}));wheel.position.set(x,.31,z);g.add(wheel)}this.scene.add(g);
 const start=this.track.start, t=this.track.tangent, normal=new THREE.Vector3(-t.z,0,t.x),lane=((id%6)-2.5)*1.3,row=Math.floor((id-1)/6)*2.5;
 const pos=start.clone().addScaledVector(t,-row-2).addScaledVector(normal,lane);pos.y=.1;g.position.copy(pos);g.rotation.y=Math.atan2(t.x,t.z);
 const trailGeom=new THREE.BufferGeometry();const trailMat=new THREE.LineBasicMaterial({color:COLORS[(id-1)%COLORS.length],transparent:true,opacity:.38});const trail=new THREE.Line(trailGeom,trailMat);this.scene.add(trail);
 const sensorLines=new THREE.Group();this.scene.add(sensorLines);
 return {id,brain,mesh:g,trail,trailPoints:[],sensorLines,velocity:0,steer:0,throttle:0,brake:0,fitness:0,progress:0,lastProgress:0,checkpoint:0,laps:0,collisions:0,alive:true,stuck:0,age:0,lapTime:0,outputs:[0,0,0],sensorValues:Array(7).fill(1),bestProgress:0};
 }
 clear(){for(const a of this.agents||[]){this.scene.remove(a.mesh);this.scene.remove(a.trail);this.scene.remove(a.sensorLines);a.mesh.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose()});a.trail.geometry.dispose();a.trail.material.dispose()}}
 update(dt){
  if(!this.running)return;
  this.elapsed+=dt;
  for(const a of this.agents){if(!a.alive)continue;a.age+=dt;a.lapTime+=dt;
   a.sensorValues=this.sense(a);
   const out=a.brain.forward(a.sensorValues);a.steer=out[0];a.throttle=(out[1]+1)/2;a.brake=(out[2]+1)/2;a.outputs=[a.steer,a.throttle,a.brake];
   const speedNorm=Math.min(1,a.velocity/17);
   a.velocity+=((a.throttle*13)-(a.brake*16)-a.velocity*.45)*dt;
   a.velocity=THREE.MathUtils.clamp(a.velocity,0,18);
   const turnFactor=.45+Math.min(1,a.velocity/7)*.9;
   a.mesh.rotation.y+=a.steer*turnFactor*a.velocity*.095*dt;
   const forward=new THREE.Vector3(Math.sin(a.mesh.rotation.y),0,Math.cos(a.mesh.rotation.y));
   a.mesh.position.addScaledVector(forward,a.velocity*dt);a.mesh.position.y=.1;
   const road=onRoad(this.track,a.mesh.position);
   if(!road){a.velocity*=Math.max(0,1-3.8*dt);a.fitness-=.12; if(a.velocity<.45)a.stuck+=dt;else a.stuck=0;}
   const near=nearestTrackPoint(this.track,a.mesh.position);const routeProgress=near.index/this.track.center.length;
   // checkpoint progress wraps only when moving forward around the route
   const delta=(routeProgress-a.progress+1)%1;
   if(delta<.12 && delta>.00005){a.progress=routeProgress;a.checkpoint=Math.floor(routeProgress*12);a.fitness+=delta*20+Math.min(a.velocity,10)*dt*.08;}
   if(a.progress>.88&&routeProgress<.12&&a.age>5&&a.bestProgress>.75){a.laps++;a.fitness+=150;a.lapTime=0;if(!this.bestLap||a.lapTime<this.bestLap)this.bestLap=a.lapTime;}
   a.bestProgress=Math.max(a.bestProgress,routeProgress);a.fitness+=Math.max(0,a.velocity)*dt*.015;
   if(a.stuck>5||a.age>95){a.alive=false;a.velocity=0;}
   if(this.sensorsVisible)this.drawSensors(a);else a.sensorLines.visible=false;
   a.mesh.visible=true;
   if(this.trails){a.trailPoints.push(a.mesh.position.clone().setY(.12));if(a.trailPoints.length>100)a.trailPoints.shift();a.trail.geometry.setFromPoints(a.trailPoints);a.trail.visible=true}else a.trail.visible=false;
  }
  if(this.collisions)this.carCollisions();
  if(this.agents.every(a=>!a.alive))this.nextGeneration();
 }
 sense(a){
  const pos=a.mesh.position,angle=a.mesh.rotation.y;
  return SENSOR_ANGLES.map(off=>{const rayAngle=angle+off;const dir=new THREE.Vector3(Math.sin(rayAngle),0,Math.cos(rayAngle));let d=RANGE;
   for(let k=1;k<=36;k++){const p=pos.clone().addScaledVector(dir,k*RANGE/36);if(!onRoad(this.track,p)){d=k*RANGE/36;break}}
   return Math.max(0,Math.min(1,d/RANGE));});
 }
 drawSensors(a){a.sensorLines.clear();const origin=a.mesh.position.clone().setY(.65);SENSOR_ANGLES.forEach((off,i)=>{const d=a.sensorValues[i]*RANGE,ang=a.mesh.rotation.y+off,end=origin.clone().add(new THREE.Vector3(Math.sin(ang)*d,0,Math.cos(ang)*d));const geo=new THREE.BufferGeometry().setFromPoints([origin,end]);const mat=new THREE.LineBasicMaterial({color:a.sensorValues[i]<.3?0xff5f65:0x54e4ed,transparent:true,opacity:.6});a.sensorLines.add(new THREE.Line(geo,mat))});a.sensorLines.visible=true;}
 carCollisions(){for(let i=0;i<this.agents.length;i++){const a=this.agents[i];if(!a.alive)continue;for(let j=i+1;j<this.agents.length;j++){const b=this.agents[j];if(!b.alive)continue;if(a.mesh.position.distanceTo(b.mesh.position)<1.05){a.velocity*=.72;b.velocity*=.72;a.collisions++;b.collisions++;a.fitness-=.8;b.fitness-=.8;const push=a.mesh.position.clone().sub(b.mesh.position).normalize().multiplyScalar(.15);a.mesh.position.add(push);b.mesh.position.sub(push)}}}}
 nextGeneration(){const scores=this.agents.map(a=>a.fitness).sort((a,b)=>b-a),best=scores[0]||0,mean=scores.reduce((s,v)=>s+v,0)/scores.length,median=scores[Math.floor(scores.length/2)]||0;this.history.push({generation:this.generation,best,mean,median,completed:this.agents.reduce((s,a)=>s+a.laps,0),crashes:this.agents.reduce((s,a)=>s+a.collisions,0)});const sorted=[...this.agents].sort((a,b)=>b.fitness-a.fitness),eliteCount=Math.max(2,Math.floor(this.population*.12)),parents=sorted.slice(0,Math.max(eliteCount,Math.floor(this.population*.45)));const nets=[];for(let i=0;i<eliteCount;i++)nets.push(sorted[i].brain.clone());while(nets.length<this.population){const parent=parents[Math.floor(Math.random()*parents.length)];const child=parent.brain.clone();child.mutate(.13,.32);nets.push(child)}this.generation++;this.spawn(nets);}
 resetGeneration(){this.spawn();} resetExperiment(){this.generation=1;this.history=[];this.bestLap=null;this.spawn();}
 select(id){this.selectedId=id;}
 get selected(){return this.agents.find(a=>a.id===this.selectedId)||this.agents[0]}
 get best(){return [...this.agents].sort((a,b)=>b.fitness-a.fitness)[0]}
 get leader(){return [...this.agents].sort((a,b)=>b.progress-a.progress||b.fitness-a.fitness)[0]}
 get stats(){const a=this.agents;return {active:a.filter(x=>x.alive).length,crashed:a.filter(x=>!x.alive).length,laps:a.reduce((s,x)=>s+x.laps,0),checkpoints:a.reduce((s,x)=>s+x.checkpoint,0),best:Math.max(0,...a.map(x=>x.fitness)),mean:a.reduce((s,x)=>s+x.fitness,0)/Math.max(1,a.length)}}
 exportModel(){const a=this.best;return {name:'Neural Racers model',generation:this.generation,agentId:a.id,fitness:a.fitness,architecture:a.brain.toJSON(),savedAt:new Date().toISOString()}}
 loadModel(obj){const n=NeuralNetwork.fromJSON(obj.architecture||obj);this.spawn(Array.from({length:this.population},(_,i)=>{let b=n.clone();if(i)b.mutate(.2,.3);return b}));}
}