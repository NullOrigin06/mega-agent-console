/* Mega Engineering Suite — part 1/3: procedural shell-and-tube heat exchanger.
 * Plain functions, no globals except window.MEGA, so each build* can be lifted into an R3F component later.
 * Units: metres. Exchanger axis = +X, up = +Y. Lathe geometries are built on Y and rotated onto X. */
(function () {
  'use strict';
  var T = THREE;
  var MEGA = (window.MEGA = window.MEGA || {});

  /* ---- dimensions (the numbers quoted on the page) ---- */
  var C = (MEGA.C = {
    shellR: 0.4, shellT: 0.012,            // shell ID 800 mm
    sheetR: 0.4625, sheetT: 0.05,          // tube sheet OD 925 mm
    nTubes: 420, tubeR: 0.0127, pitch: 0.03175, // 25.4 mm OD, 1.25 x OD triangular pitch
    nBolts: 28, boltCircle: 0.4313, boltHoleR: 0.011,
    halfTube: 1.504, baffleN: 5, baffleR: 0.395, baffleT: 0.008, cutH: 0.2, // 25% of 800
    nozR: 0.075, nozFlangeR: 0.125, nozX: 1.1, saddleX: 0.62
  });
  var HALF_PI = Math.PI / 2;
  var CYAN = 0x38bdf8;

  /* ---- small helpers ---- */
  /** Nearest 210 inversion pairs on the triangular lattice; no centre tube. */
  MEGA.tubeLayout = function () {
    var pts = [], rowH = C.pitch * Math.sqrt(3) / 2, j, i;
    for (j = -22; j <= 22; j++) {
      for (i = -22; i <= 22; i++) {
        var y = j * rowH, z = (i + (j & 1 ? 0.5 : 0)) * C.pitch;
        if (y < 0 || (y === 0 && z <= 0)) continue;
        pts.push({ y: y, z: z, r: Math.hypot(y, z), a: Math.atan2(z, y) });
      }
    }
    pts.sort(function (p, q) { return p.r - q.r || p.a - q.a; });
    var layout = [];
    pts.slice(0, C.nTubes / 2).forEach(function (p) {
      layout.push(p, { y: -p.y, z: -p.z, r: p.r, a: Math.atan2(-p.z, -p.y) });
    });
    return layout;
  };

  /** Polyline wire for a surface of revolution about Y. profile = [[r,y],...] */
  MEGA.wireRevolve = function (profile, meridians, ringIdx, segs) {
    segs = segs || 48;
    var v = [], k, a, p;
    function push(a0, b0) { v.push(a0[0], a0[1], a0[2], b0[0], b0[1], b0[2]); }
    (ringIdx || []).forEach(function (idx) {
      p = profile[idx]; if (p[0] < 0.002) return;
      for (k = 0; k < segs; k++) {
        var a1 = k / segs * Math.PI * 2, a2 = (k + 1) / segs * Math.PI * 2;
        push([p[0] * Math.cos(a1), p[1], p[0] * Math.sin(a1)], [p[0] * Math.cos(a2), p[1], p[0] * Math.sin(a2)]);
      }
    });
    for (k = 0; k < meridians; k++) {
      a = k / meridians * Math.PI * 2;
      for (var q = 0; q < profile.length - 1; q++) {
        push([profile[q][0] * Math.cos(a), profile[q][1], profile[q][0] * Math.sin(a)],
             [profile[q + 1][0] * Math.cos(a), profile[q + 1][1], profile[q + 1][0] * Math.sin(a)]);
      }
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
    return g;
  };

  /** Annular / full disc with the 28 bolt holes, thickness along +X, centred on x=0. */
  MEGA.discGeometry = function (rOut, rIn, thick, boltHoles) {
    var s = new T.Shape(), h, k;
    s.absarc(0, 0, rOut, 0, Math.PI * 2, false);
    if (rIn > 0) { h = new T.Path(); h.absarc(0, 0, rIn, 0, Math.PI * 2, true); s.holes.push(h); }
    if (boltHoles) {
      for (k = 0; k < C.nBolts; k++) {
        var a = k / C.nBolts * Math.PI * 2;
        h = new T.Path();
        h.absarc(C.boltCircle * Math.cos(a), C.boltCircle * Math.sin(a), C.boltHoleR, 0, Math.PI * 2, true);
        s.holes.push(h);
      }
    }
    var g = new T.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 40 });
    g.translate(0, 0, -thick / 2);
    g.rotateY(HALF_PI); // z (extrusion) -> x
    return g;
  };

  /* ---- materials: one registry so blueprint / opacity changes toggle cleanly ---- */
  function createMaterials(env, clip) {
    var reg = [];
    function reg_(m, part, bpOp) {
      m.userData.c0 = m.color.clone(); m.userData.part = part; m.userData.bpOp = bpOp;
      m.userData.e0 = m.emissive ? m.emissive.clone() : null; reg.push(m); return m;
    }
    var steel = reg_(new T.MeshStandardMaterial({ color: 0xaab6c2, metalness: 1, roughness: 0.3, envMap: env, envMapIntensity: 1.15 }), 'body', 0.16);
    var shell = reg_(new T.MeshStandardMaterial({ color: 0xb4c0cb, metalness: 1, roughness: 0.26, envMap: env, envMapIntensity: 1.2,
      side: T.DoubleSide, clippingPlanes: [clip], clipIntersection: false }), 'shell', 0.05);
    var shellSteel = reg_(new T.MeshStandardMaterial({ color: 0xaab6c2, metalness: 1, roughness: 0.3, envMap: env, envMapIntensity: 1.15,
      clippingPlanes: [clip] }), 'shell', 0.12);
    var tube = reg_(new T.MeshStandardMaterial({ color: 0xc3ced8, metalness: 1, roughness: 0.22, envMap: env, envMapIntensity: 1.25 }), 'tubes', 0.22);
    var dark = reg_(new T.MeshStandardMaterial({ color: 0x070b12, metalness: 0.2, roughness: 0.9, side: T.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 'body', 0.2);
    var head = reg_(new T.MeshStandardMaterial({ color: 0xa4b1be, metalness: 1, roughness: 0.34, envMap: env, envMapIntensity: 1.1, side: T.DoubleSide }), 'body', 0.12);
    var edge = new T.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
    return { reg: reg, steel: steel, shell: shell, shellSteel: shellSteel, tube: tube, dark: dark, head: head, edge: edge };
  }

  function addEdges(mesh, mat, angle) {
    var l = new T.LineSegments(new T.EdgesGeometry(mesh.geometry, angle || 28), mat);
    l.userData.isEdge = true; mesh.add(l); return l;
  }
  function inst(geo, mat, n) { var m = new T.InstancedMesh(geo, mat, n); m.frustumCulled = true; return m; }

  // r128 culls InstancedMesh using geometry.boundingSphere, ignoring instance matrices.
  function boundInstances(m) {
    m.geometry.computeBoundingSphere();
    var sphere = m.geometry.boundingSphere.clone(), matrix = new T.Matrix4(), radius = 0;
    for (var i = 0; i < m.count; i++) {
      m.getMatrixAt(i, matrix);
      var s = sphere.clone().applyMatrix4(matrix);
      radius = Math.max(radius, s.center.length() + s.radius);
    }
    m.geometry.boundingSphere = new T.Sphere(new T.Vector3(), radius);
  }

  /* ---- builders (right-hand end is built, left is the same part rotated by PI about Y) ---- */
  function buildTubes(M, layout, radial) {
    var g = new T.CylinderGeometry(C.tubeR, C.tubeR, C.halfTube * 2, radial, 1, false);
    g.rotateZ(-HALF_PI);
    var m = inst(g, M.tube, layout.length), d = new T.Object3D();
    layout.forEach(function (p, i) { d.position.set(0, p.y, p.z); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
    m.instanceMatrix.needsUpdate = true; m.name = 'tubes';
    return m;
  }

  function buildBaffle(M, layout, k, radial) {
    var grp = new T.Group(), s = new T.Shape(), c = C.cutH, Rb = C.baffleR, a0 = Math.asin(c / Rb), n = 56, i;
    s.moveTo(Rb * Math.cos(a0), c);
    for (i = 0; i <= n; i++) { var a = a0 - (Math.PI + 2 * a0) * i / n; s.lineTo(Rb * Math.cos(a), Rb * Math.sin(a)); }
    s.lineTo(Rb * Math.cos(a0), c);
    var g = new T.ExtrudeGeometry(s, { depth: C.baffleT, bevelEnabled: false });
    g.translate(0, 0, -C.baffleT / 2); g.rotateY(HALF_PI);
    if (k % 2 === 1) g.rotateX(Math.PI); // odd plates have a bottom window
    var mesh = new T.Mesh(g, M.steel); grp.add(mesh); addEdges(mesh, M.edge, 20);
    // tube holes: only tubes below the window pass through the plate
    var held = layout.filter(function (p) { return (k % 2 === 1 ? -p.y : p.y) < c - C.tubeR - 0.003; });
    var cg = new T.CylinderGeometry(C.tubeR + 0.0012, C.tubeR + 0.0012, C.baffleT + 0.0006, radial, 1, true);
    cg.rotateZ(-HALF_PI);
    var holes = inst(cg, M.dark, held.length), d = new T.Object3D();
    held.forEach(function (p, j) { d.position.set(0, p.y, p.z); d.updateMatrix(); holes.setMatrixAt(j, d.matrix); });
    holes.instanceMatrix.needsUpdate = true; grp.add(holes);
    var wrap = new T.Group(); wrap.add(grp);
    return wrap;
  }

  function buildSheet(M, layout, radial) {
    var g = MEGA.discGeometry(C.sheetR, 0, C.sheetT, true);
    var grp = new T.Group(), mesh = new T.Mesh(g, M.steel); grp.add(mesh); addEdges(mesh, M.edge, 30);
    var face = C.sheetT / 2 + 0.0004, d = new T.Object3D(), i;
    var rg = new T.RingGeometry(C.tubeR, C.tubeR + 0.0026, radial); rg.rotateY(HALF_PI);
    var bg = new T.CircleGeometry(C.tubeR * 0.82, radial); bg.rotateY(HALF_PI);
    var rings = inst(rg, M.dark, layout.length), bores = inst(bg, M.dark, layout.length);
    for (i = 0; i < layout.length; i++) {
      d.position.set(face, layout[i].y, layout[i].z); d.updateMatrix(); rings.setMatrixAt(i, d.matrix);
      d.position.set(face + 0.0038, layout[i].y, layout[i].z); d.updateMatrix(); bores.setMatrixAt(i, d.matrix);
    }
    rings.instanceMatrix.needsUpdate = true; bores.instanceMatrix.needsUpdate = true;
    grp.add(rings, bores);
    return grp;
  }

  function buildBonnetFlange(M) {
    var mesh = new T.Mesh(MEGA.discGeometry(C.sheetR, C.shellR, C.sheetT, true), M.steel);
    var grp = new T.Group(); grp.add(mesh); addEdges(mesh, M.edge, 30); return grp;
  }

  /** Dished (2:1 elliptical) head with straight skirt + axial nozzle. Local +X = outward. */
  function buildHead(M) {
    var Ro = C.shellR + C.shellT, Ri = C.shellR, skirt = 0.06, depth = 0.2, pts = [], outer = [], i, n = 18;
    for (i = 0; i <= n; i++) { var f = i / n * HALF_PI; outer.push([Ro * Math.cos(f), skirt + depth * Math.sin(f)]); }
    var inner = outer.map(function (p) { return [Math.max(0, p[0] - C.shellT * (p[0] / Ro)), p[1] - C.shellT * Math.min(1, p[1] / depth)]; });
    pts.push(new T.Vector2(Ro, 0), new T.Vector2(Ro, skirt));
    outer.forEach(function (p) { pts.push(new T.Vector2(p[0], p[1])); });
    inner.reverse().forEach(function (p) { pts.push(new T.Vector2(p[0], p[1])); });
    pts.push(new T.Vector2(Ri, skirt), new T.Vector2(Ri, 0));
    var g = new T.LatheGeometry(pts, 72); g.rotateZ(-HALF_PI);
    var grp = new T.Group(); grp.add(new T.Mesh(g, M.head));
    var wprofile = [[Ro, 0], [Ro, skirt]].concat(outer);
    var wire = new T.LineSegments(MEGA.wireRevolve(wprofile, 8, [0, 1, 6, 12], 48), M.edge);
    wire.geometry.rotateZ(-HALF_PI); wire.userData.isEdge = true; grp.add(wire);
    // axial nozzle on the apex
    var tip = skirt + depth, nl = 0.22;
    var ng = new T.CylinderGeometry(C.nozR, C.nozR, nl, 32, 1, true); ng.rotateZ(-HALF_PI); ng.translate(tip + nl / 2 - 0.01, 0, 0);
    var fg = new T.CylinderGeometry(C.nozFlangeR, C.nozFlangeR, 0.03, 40); fg.rotateZ(-HALF_PI); fg.translate(tip + nl, 0, 0);
    var nz = new T.Mesh(ng, M.head), fl = new T.Mesh(fg, M.steel);
    grp.add(nz, fl); addEdges(fl, M.edge, 30);
    return grp;
  }

  function buildBolts(M, radial) {
    var sg = new T.CylinderGeometry(0.009, 0.009, 0.19, 8); sg.rotateZ(-HALF_PI);
    var ng = new T.CylinderGeometry(0.0155, 0.0155, 0.018, 6); ng.rotateZ(-HALF_PI);
    var studs = inst(sg, M.steel, C.nBolts), nuts = inst(ng, M.steel, C.nBolts * 2), d = new T.Object3D(), k;
    for (k = 0; k < C.nBolts; k++) {
      var a = k / C.nBolts * Math.PI * 2, y = C.boltCircle * Math.cos(a), z = C.boltCircle * Math.sin(a);
      d.position.set(0, y, z); d.rotation.set(a, 0, 0); d.updateMatrix(); studs.setMatrixAt(k, d.matrix);
      // Local origin is x=1.48: stack bearing faces are x=1.40 and x=1.55.
      d.position.set(1.525 + C.sheetT / 2 - 1.48 + 0.009, y, z); d.updateMatrix(); nuts.setMatrixAt(k, d.matrix);
      d.position.set(1.425 - C.sheetT / 2 - 1.48 - 0.009, y, z); d.updateMatrix(); nuts.setMatrixAt(C.nBolts + k, d.matrix);
    }
    studs.instanceMatrix.needsUpdate = true; nuts.instanceMatrix.needsUpdate = true;
    var grp = new T.Group(); grp.add(studs, nuts); return grp;
  }

  function buildShell(M) {
    var Ro = C.shellR + C.shellT, L = 1.45, grp = new T.Group();
    var prof = [new T.Vector2(C.shellR, -L), new T.Vector2(Ro, -L), new T.Vector2(Ro, L), new T.Vector2(C.shellR, L), new T.Vector2(C.shellR, -L)];
    var g = new T.LatheGeometry(prof, 96); g.rotateZ(-HALF_PI);
    grp.add(new T.Mesh(g, M.shell));
    var wire = new T.LineSegments(MEGA.wireRevolve([[Ro, -L], [Ro, L]], 10, [0, 1], 64), M.edge);
    wire.geometry.rotateZ(-HALF_PI); wire.userData.isEdge = true; grp.add(wire);
    // shell flanges (share one geometry) + two top nozzles
    var fg = MEGA.discGeometry(C.sheetR, C.shellR, C.sheetT, true);
    [-1, 1].forEach(function (sg) {
      var f = new T.Mesh(fg, M.shellSteel); f.position.x = sg * 1.425; grp.add(f); addEdges(f, M.edge, 30);
      var ng = new T.CylinderGeometry(C.nozR, C.nozR, 0.3, 32, 1, true); ng.translate(0, 0.4 + 0.15, 0);
      var nz = new T.Mesh(ng, M.shell); nz.position.x = sg * C.nozX; grp.add(nz);
      var fl = new T.CylinderGeometry(C.nozFlangeR, C.nozFlangeR, 0.03, 40); fl.translate(0, 0.7, 0);
      var fm = new T.Mesh(fl, M.shellSteel); fm.position.x = sg * C.nozX; grp.add(fm); addEdges(fm, M.edge, 30);
      var cap = new T.CircleGeometry(C.nozR * 0.9, 24); cap.rotateX(-HALF_PI); cap.translate(0, 0.716, 0);
      var cm = new T.Mesh(cap, M.dark); cm.position.x = sg * C.nozX; grp.add(cm);
    });
    return grp;
  }

  function buildSaddles(M) {
    var R = C.shellR + C.shellT, grp = new T.Group(), zr = 0.33, a0 = Math.asin(zr / R), s = new T.Shape(), i, n = 24;
    s.moveTo(-zr, -0.62); s.lineTo(zr, -0.62); s.lineTo(zr, -R * Math.cos(a0));
    for (i = 0; i <= n; i++) { var a = a0 - 2 * a0 * i / n; s.lineTo(R * Math.sin(a), -R * Math.cos(a)); }
    s.lineTo(-zr, -0.62);
    var g = new T.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false });
    g.translate(0, 0, -0.08); g.rotateY(HALF_PI);
    var bg = new T.BoxGeometry(0.24, 0.02, 0.84); bg.translate(0, -0.63, 0);
    [-1, 1].forEach(function (sg) {
      var m = new T.Mesh(g, M.head); m.position.x = sg * C.saddleX; grp.add(m); addEdges(m, M.edge, 25);
      var b = new T.Mesh(bg, M.head); b.position.x = sg * C.saddleX; grp.add(b); addEdges(b, M.edge, 25);
    });
    return grp;
  }

  /* ---- assembly ---- */
  /** opts: { env, clipPlane, mobile } -> { group, parts, update(state), materials } */
  MEGA.buildExchanger = function (opts) {
    var radial = opts.mobile ? 6 : 10, layout = MEGA.tubeLayout();
    var M = createMaterials(opts.env, opts.clipPlane);
    var root = new T.Group(); root.name = 'exchanger';
    var parts = {}, ends = [];

    parts.shell = buildShell(M); root.add(parts.shell);
    parts.saddles = buildSaddles(M); root.add(parts.saddles);
    var bundle = new T.Group(); root.add(bundle); parts.bundle = bundle;
    var tubes = buildTubes(M, layout, radial); bundle.add(tubes);
    var baffles = [], i;
    for (i = 1; i <= C.baffleN; i++) {
      var b = buildBaffle(M, layout, i, radial), x0 = -1.45 + i * (2.9 / (C.baffleN + 1));
      b.position.x = x0; b.userData.x0 = x0; bundle.add(b); baffles.push(b);
    }
    // outline of the shell envelope, visible when the shell is lifted away
    var ghost = new T.LineSegments(MEGA.wireRevolve([[C.shellR, -1.45], [C.shellR, 1.45]], 12, [0, 1], 64),
      new T.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    ghost.geometry.rotateZ(-HALF_PI); root.add(ghost);

    // end parts: [name, builder, base x, explode dx]
    var defs = [['sheet', buildSheet.bind(null, M, layout, radial), 1.475, 0.55],
                ['bolts', buildBolts.bind(null, M, radial), 1.48, 1.05],
                ['flange', buildBonnetFlange.bind(null, M), 1.525, 1.4],
                ['head', buildHead.bind(null, M), 1.55, 1.95]];
    defs.forEach(function (d) {
      [1, -1].forEach(function (sg) {
        var g = d[1](); g.userData = { sign: sg, base: d[2], dx: d[3], name: d[0] };
        if (sg < 0) g.rotation.y = Math.PI;
        g.position.x = sg * d[2]; root.add(g); ends.push(g); parts[d[0] + (sg > 0 ? 'R' : 'L')] = g;
      });
    });

    var renderables = [];
    root.traverse(function (o) {
      if (o.isInstancedMesh) boundInstances(o);
      if (o.material) { o.visible = o.material.opacity > 0; renderables.push(o); }
    });
    var tmpC = new T.Color(0x0b1a2e), hot = new T.Color(0xff5a24), sm = T.MathUtils.smoothstep;
    /** Applies the animated state to geometry + materials. All toggles live here. */
    function update(s) {
      var e = s.explode, sc = 1 + 0.3667 * e, so = s.shellOut;
      tubes.scale.x = sc;
      baffles.forEach(function (b) { b.position.x = b.userData.x0 * sc; });
      ends.forEach(function (g) { g.position.x = g.userData.sign * (g.userData.base + g.userData.dx * e); });
      parts.shell.position.set(-so * 1.1, so * 1.5, so * 0.5); parts.shell.rotation.set(0, 0, so * 0.05);
      parts.saddles.position.y = -0.45 * e - 0.8 * sm(so, 0.1, 0.9);
      // clipping plane (world y): sweeps down to halve the shell while it lifts away
      opts.clipPlane.constant = T.MathUtils.lerp(20, parts.shell.position.y - 0.02, s.clip);
      var bp = s.bp, ops = { body: 1, tubes: s.tubeOp, shell: s.shellOp };
      M.reg.forEach(function (m) {
        var o = ops[m.userData.part] * (1 - bp * (1 - m.userData.bpOp));
        m.visible = o > 0.01; m.opacity = o; m.transparent = o < 0.995;
        m.depthWrite = o >= 0.995; m.color.lerpColors(m.userData.c0, tmpC, bp * 0.7);
        if (m.envMap) m.envMapIntensity = (m.userData.part === 'shell' ? 1.2 : 1.15) * (1 - 0.85 * bp);
      });
      // hot tubes glow in the cutaway
      M.tube.emissive.copy(hot).multiplyScalar(s.glow * 0.55);
      M.tube.color.lerp(hot, s.glow * 0.25);
      M.edge.opacity = bp * 0.85; ghost.material.opacity = s.ghost * 0.55 + bp * 0.25;
      renderables.forEach(function (o) { o.visible = o.material.visible && o.material.opacity > 0; });
      parts.saddles.visible = s.shellOp > 0.01 || bp > 0.01;
    }
    return { group: root, parts: parts, tubes: tubes, baffles: baffles, layout: layout, update: update, materials: M };
  };
})();
