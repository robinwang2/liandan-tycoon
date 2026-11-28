import * as THREE from 'three';
import { createDelivery } from '../../src/scene3a/delivery.js';
import { FOUNDER_OUTFITS, lookOf } from '../../src/scene/looks.js';

// Record the actual delivery state machine, including the garage reverse turn,
// rear hinge, low shutter clearance and flight to each possible first new rack.
export function deliveryClip(kit, props, store, layout, shutter, groundY) {
  const parent = new THREE.Group();
  parent.position.y = groundY;
  const bake = node => { node.userData.dispose = () => {}; return node; };
  const clips = [];
  let vanModel, cargoModel;
  for (let first = 0; first < Math.min(12,layout.rackRow*3); first++) {
    const vanProps = {van_delivery:{build(k, options) {
      const van = first ? new THREE.Group() : props.van_delivery.build(k, options);
      // Retain original wheel pivots when using an identity (non-batching) kit.
      van.add(new THREE.Group()); van.userData.wheels = [];
      return van;
    }}};
    const trip = createDelivery({...kit,bake}, vanProps, parent, {
      makeRack: () => new THREE.Group(), install() {}, impact() {},
    });
    trip.start(layout, null, first, first+1, shutter);
    const [cargo, van] = parent.children[0].children;
    const hinge = van.children.findLast(n => n.isGroup && n.children.length && Math.abs(n.position.z+2.04)<.001);
    if (!hinge) throw Error('Missing delivery rear hinge');
    hinge.name = 'rear-door';
    if (!first) {
      vanModel = store.model(van);
      cargo.visible = true; cargoModel = store.model(cargo); cargo.visible = false;
    }
    const frames = [];
    for (let frame = 0; frame <= 112; frame++) {
      if (frame) trip.step(1/30);
      const c = cargo.position, v = van.position;
      frames.push(...[v.x,-v.z,-van.rotation.y, -hinge.rotation.y,
        c.x,c.y+groundY,-c.z,cargo.visible?1:0,-cargo.rotation.y,cargo.rotation.z
      ].map(value => +value.toFixed(4)));
    }
    if (!frames.some((v,i)=>i%10===7 && v===1) || !frames.some((v,i)=>i%10===3 && Math.abs(v)>1))
      throw Error('Incomplete delivery animation for rack '+first);
    trip.cancel(); clips.push({frames});
  }
  return {vanModel,cargoModel,clips};
}

// Export only distinct geometry choices. Unity's Look supplies each real uid's
// skin and hair palette at instantiation, independent of the sampled uid.
export function actorLibrary(room, group, store, roles) {
  const staff = [], keys = new Set(), models = [];
  for (const role of roles) {
    const target = keys.size + (role === 'eng' ? 28 : 14);
    for (let n=0; keys.size < target; n++) {
      const id = role+n, look = lookOf(id,role);
      const key = [role,look.style,+look.glasses,+look.headphones].join('-');
      if (!keys.has(key)) { keys.add(key); staff.push({id,role,key}); }
      if (n > 10000) throw Error('Missing actor variant '+role);
    }
  }
  const record = (node,key) => {
    const rig = node.children[0];
    rig.name = 'rig';
    rig.children.forEach((part,i) => part.name = ['leg_l','leg_r','torso','arm_l','arm_r','head'][i]);
    models.push({key,model:store.model(node)});
  };
  room.sync({staff, own:true});
  // Removing staff starts their leave animation. Newly added actors are last.
  group.children.slice(-staff.length).forEach((node,i) => record(node,staff[i].key));
  for (const outfit of Object.keys(FOUNDER_OUTFITS)) {
    room.sync({founder:{outfit}});
    // The founder wears the only head accessory mounted as a separate group.
    const founder = group.children.find(n => n.children[0]?.children[5]?.children.some(c => c.isGroup));
    if (!founder) throw Error('Missing founder rig');
    record(founder,'founder-'+outfit);
  }
  return models;
}
