const unit = value => Math.max(0, Math.min(1, value));
const smooth = value => value * value * (3 - 2 * value);
const mix = (from, to, weight) => from + (to - from) * weight;

export function rackSlot(layout, index) {
  const spacing = Math.min(1.05, (layout.rz - 1.3) / Math.max(1, layout.rackRow - 1));
  return { x: layout.W / 2 - layout.rz + 0.75 + index % layout.rackRow * spacing, z: -layout.D / 2 + 0.85 + Math.floor(index / layout.rackRow) * 1.6 };
}

function parkVan(run, time, leave) {
  const { van, layout, shutter, streetZ } = run, reach = Math.max(layout.D, layout.W) + 36;
  const side = shutter ? -1 : 1, radius = shutter ? 1.34 : 2.2;
  const drive = unit(time / 0.65), reverse = smooth(unit((time - 0.65) / 0.55));
  const turn = (shutter ? 1.18 : 0.85) * reverse * (1 - smooth(unit(leave / 0.48)));
  const originX = shutter ? layout.W / 2 + 0.13 : 1 - layout.rz;
  const travel = reach * (unit((leave - 0.48) / 0.52) ** 2 - (1 - drive) ** 2);
  van.rotation.y = -side * Math.PI / 2 + turn;
  van.position.x = originX - side * (travel - radius * Math.sin(turn));
  van.position.z = streetZ - side * radius * (1 - Math.cos(turn));
}

function shutterFlight(cargo, rearX, rearZ, wallZ, target, flight) {
  const aisle = unit(flight / 0.32), lower = unit((flight - 0.32) / 0.17);
  const through = unit((flight - 0.49) / 0.19), inside = unit((flight - 0.68) / 0.32);
  if (flight < 0.32) cargo.position.set(mix(rearX, 1.65, smooth(aisle)),
    mix(1.1, 2.85, smooth(unit(aisle * 1.7))) + 0.65 * Math.sin(Math.PI * aisle), mix(rearZ, wallZ - 1.28, aisle));
  else if (flight < 0.49) cargo.position.set(mix(1.65, 0, smooth(unit(lower * 1.6))),
    mix(2.85, 0.67, smooth(unit((lower - 0.22) / 0.78))), wallZ + mix(-1.28, -0.65, lower));
  else if (flight < 0.68) cargo.position.set(0, 0.67, wallZ + mix(-0.65, 0.72, smooth(through)));
  else cargo.position.set(target.x * inside, mix(0.67, 0.59, inside) + 5.6 * inside * (1 - inside), mix(wallZ + 0.72, target.z, smooth(inside)));
}

export function createDelivery(k, props, parent, { makeRack, install, impact, traffic }) {
  let trip = null, idleSince = performance.now();

  function start(layout, brand, first, count, shutter) {
    const root = k.group(parent), cargo = k.group(root), paint = brand || '#528e88';
    root.name = 'rack-delivery';
    const model = (props.van_delivery || props.car)?.build(k, { brand: paint }) || k.group();
    if (!model.children.length) k.box(1.5, 1.6, 4, paint, model, 0, 0.9, 0);
    const wheels = model.userData.wheels || [], baked = [];
    for (const wheel of wheels) {
      const rim = k.bake(wheel); rim.position.set(0, 0, 0); rim.quaternion.identity(); rim.scale.setScalar(1);
      wheel.clear(); wheel.add(rim); baked.push(rim);
    }
    const van = k.bake(model); root.add(van); baked.push(van);
    const swing = shutter ? -1 : 1, hinge = k.group(van, -0.66 * swing, 0, -2.04);
    k.box(1.32, 1.16, 0.045, '#263239', van, 0, 1.35, -2.025);
    k.box(1.32, 1.16, 0.065, paint, hinge, 0.66 * swing, 1.35, -0.04, { r: 0.025 });
    k.box(0.16, 0.045, 0.035, '#e4e8ea', hinge, 1.15 * swing, 1.27, -0.09);
    k.box(0.77, 0.9, 0.69, shutter ? '#cc9863' : '#f2d3a0', cargo, 0, 0, 0, { r: 0.025 });
    k.box(shutter ? 0.14 : 0.26, 0.91, 0.7, paint, cargo, 0, 0, 0, { glow: paint, glowK: 0.28 });
    if (!shutter) k.box(0.78, 0.19, 0.71, paint, cargo, 0, -0.08, 0, { glow: paint, glowK: 0.28 });
    k.box(0.23, 0.15, 0.015, '#fff4d9', cargo, -0.21, 0.17, 0.35);
    cargo.visible = false;
    van.position.y = -parent.position.y;
    const streetZ = shutter ? -layout.D / 2 - 6.95 : layout.D / 2 + 6.25;
    trip = { root, cargo, van, wheels, hinge, baked, layout, shutter, streetZ, first, count, time: 0, popped: [], landed: false };
    parkVan(trip, 1.2, 0);
    traffic?.setBlock(streetZ, van.position.x);
    parkVan(trip, 0, 0);
  }

  function cancel() {
    if (!trip) return;
    traffic?.clearBlock();
    trip.root.removeFromParent();
    for (const batch of trip.baked) batch.userData.dispose();
    trip = null;
    idleSince = performance.now();
  }

  function step(dt) {
    if (!trip) return;
    const run = trip, { van, hinge, cargo, layout, shutter } = run;
    const time = run.time += dt, docked = time - 1.2, leave = unit((docked - 1.68) / 0.82);
    const lastX = van.position.x, lastZ = van.position.z;
    parkVan(run, time, leave);
    const travel = (van.position.x - lastX) * Math.sin(van.rotation.y) + (van.position.z - lastZ) * Math.cos(van.rotation.y);
    for (const wheel of run.wheels) wheel.rotation.x += travel / 0.32;
    hinge.rotation.y = (shutter ? -1.75 : 1.75) * (smooth(unit(docked / 0.3)) - smooth(unit((docked - 1.38) / 0.3)));
    const flight = unit((docked - 0.3) / 0.94);
    if (flight > 0 && flight < 1) {
      cargo.visible = true;
      const target = rackSlot(layout, run.first), rearX = van.position.x - Math.sin(van.rotation.y) * 2.2, rearZ = van.position.z - Math.cos(van.rotation.y) * 2.2;
      if (shutter) shutterFlight(cargo, rearX, rearZ, -layout.D / 2, target, flight);
      else {
        cargo.position.set(mix(rearX, target.x, smooth(flight)),
          mix(1.1 + van.position.y, 0.59, flight) + (layout.H + 0.7) * 4 * flight * (1 - flight),
          mix(rearZ, target.z, flight));
      }
      cargo.rotation.set(0, Math.PI * flight, 0.16 * Math.sin(Math.PI * 2 * flight));
    }
    if (flight === 1) {
      if (!run.landed) { run.landed = true; cargo.visible = false; impact(rackSlot(layout, run.first)); }
      if (run.first + run.popped.length < run.count) {
        if (!run.template) { run.template = k.bake(makeRack(run.first)); run.baked.push(run.template); }
        while (run.first + run.popped.length < run.count) {
          const rack = run.template.clone(), slot = rackSlot(layout, run.first + run.popped.length);
          rack.position.set(slot.x, 0.12, slot.z); run.root.add(rack); run.popped.push({ rack, since: time });
        }
      }
      for (const { rack, since } of run.popped) {
        const age = time - since;
        rack.scale.setScalar(age < 0.22 ? 1.08 * (1 - (1 - age / 0.22) ** 3) : mix(1.08, 1, smooth(unit((age - 0.22) / 0.14))));
      }
      if (run.popped.length && time - run.popped.at(-1).since >= 0.36) {
        install(run.count); for (const { rack } of run.popped) rack.removeFromParent(); run.first = run.count; run.popped = [];
      }
      if (leave === 1 && !run.popped.length) cancel();
    }
  }

  return { start, cancel, step, get active() { return !!trip; }, get idleSince() { return trip ? null : idleSince; }, extend(count) { trip.count = count; } };
}
