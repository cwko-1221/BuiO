import * as THREE from 'three';
import { charcoalGeometry,charcoalPoint,ashMoundGeometry,ashPoint } from './charcoal-geometry.js';

// The same authored geometry supplies the experiment and its transparent
// thumbnail. No photograph of wax or downloaded model is reused as charcoal.
export function buildCharcoalVisual() {
  const group=new THREE.Group(), fuel=new THREE.Group(), ash=new THREE.Group();group.add(fuel,ash);fuel.position.y=ash.position.y=.14;ash.visible=false;
  let seed=4731;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#898989';ctx.fillRect(0,0,128,128);
  for(let i=0;i<1800;i++){const shade=20+Math.floor(random()*210);ctx.fillStyle=`rgb(${shade},${shade},${shade})`;ctx.beginPath();ctx.ellipse(random()*128,random()*128,.6+random()*2,.5+random(),random()*3,0,Math.PI*2);ctx.fill();}
  const pores=new THREE.CanvasTexture(canvas), materials=[],cracks=[];
  [[-.23,.34,-.15,.25],[.2,.34,.1,.26],[-.1,.51,.12,.22]].forEach(([x,y,z,size],i)=>{
    const geometry=charcoalGeometry(size,i);
    const material=new THREE.MeshStandardMaterial({color:i===1?'#30363b':'#22272b',roughness:.97,bumpMap:pores,bumpScale:.012,emissive:'#e94317',emissiveIntensity:0});materials.push(material);
    const chunk=new THREE.Mesh(geometry,material);chunk.castShadow=chunk.receiveShadow=true;chunk.position.set(x,y-.14,z);chunk.rotation.set(i*.5,i*.8,.15);fuel.add(chunk);
    for(let j=0;j<4;j++){
      const points=Array.from({length:14},(_,k)=>{
        const t=k/13,theta=.88+j*.37+Math.sin(t*5+j)*.025,phi=.48+t*1.9;
        const point=charcoalPoint(Math.cos(theta)*Math.sin(phi),Math.cos(phi),Math.sin(theta)*Math.sin(phi),size*1.003,i);
        return new THREE.Vector3(point.x,point.y,point.z);
      });
      const crack=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#070a0c'}));chunk.add(crack);cracks.push(crack.material);
    }
  });
  const bed=new THREE.Mesh(ashMoundGeometry(),new THREE.MeshStandardMaterial({color:'#77766f',roughness:1,bumpMap:pores,bumpScale:.006}));bed.receiveShadow=true;ash.add(bed);
  for(let i=0;i<85;i++){
    const point=ashPoint(Math.sqrt(random())*1.12,random()*Math.PI*2);
    const geometry=new THREE.CircleGeometry(.004+random()*.01,5);
    const flake=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(.1,.025,.18+random()*.17),roughness:1,side:THREE.DoubleSide}));
    flake.scale.set(1,.45+random()*.6,1);flake.rotation.set(-Math.PI/2+(random()-.5)*.55,0,random()*Math.PI*2);flake.position.set(point.x,point.y+.002,point.z);flake.castShadow=true;ash.add(flake);
  }
  const powder=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.003,0),new THREE.MeshStandardMaterial({roughness:1,color:'#7c7b73'}),900);
  const grain=new THREE.Object3D();
  for(let i=0;i<900;i++){
    const point=ashPoint(Math.sqrt(random())*1.25,random()*Math.PI*2);
    grain.position.set(point.x,point.y+.001,point.z);grain.scale.setScalar(.45+random());grain.scale.y*=.4;grain.updateMatrix();powder.setMatrixAt(i,grain.matrix);
    powder.setColorAt(i,new THREE.Color().setScalar(.45+random()*.5));
  }
  ash.add(powder);
  const glow=new THREE.PointLight('#ff5827',0,1.7,2);glow.position.set(0,.6,0);group.add(glow);
  return {group,fuel,ash,materials,cracks,glow};
}

export function charcoalThumbnail() {
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(192,192);renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(),visual=buildCharcoalVisual();scene.add(visual.group,new THREE.HemisphereLight('#f7fbff','#8b9298',3));
  const light=new THREE.DirectionalLight('#fff7eb',4);light.position.set(-2,4,3);scene.add(light);
  const camera=new THREE.OrthographicCamera(-.62,.62,.62,-.62,.1,10);camera.position.set(1.5,1.6,2.4);camera.lookAt(0,.36,0);
  renderer.render(scene,camera);const url=renderer.domElement.toDataURL('image/png');
  scene.traverse(object=>{object.geometry?.dispose();const material=object.material;if(material){material.bumpMap?.dispose();material.dispose();}});renderer.dispose();
  return url;
}
