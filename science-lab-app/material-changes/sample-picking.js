// Only rendered surfaces and the vessel's explicit grab volume are pickable.
// Raycaster also intersects invisible descendants and gives Lines a generous
// world-space threshold, so raycasting whole sample groups selects neighbours.
export function pickSample(raycaster,models) {
  const candidates=[],owners=new Map();
  for(const [id,model] of Object.entries(models)) {
    model.group.traverseVisible(object=>{
      if(!object.isMesh)return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      const rendered=materials.some(material=>material && material.visible!==false && material.opacity>0 && material.colorWrite!==false);
      if(object!==model.pick && !rendered)return;
      candidates.push(object);owners.set(object,id);
    });
  }
  const hit=raycaster.intersectObjects(candidates,false)[0];
  return hit?{id:owners.get(hit.object),point:hit.point,distance:hit.distance}:null;
}
