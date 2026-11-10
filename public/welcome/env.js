/* Mega Engineering Suite — part 2/3: environment map, flow particles, dust, glow sprite, module outline models. */
(function () {
  'use strict';
  var T = THREE, MEGA = window.MEGA, C = MEGA.C, HALF_PI = Math.PI / 2, CYAN = 0x38bdf8;

  /** Procedural studio environment (gradient dome + soft boxes) -> PMREM texture for metal reflections. */
  MEGA.makeEnv = function (renderer) {
    var sc = new T.Scene(), g = new T.SphereGeometry(30, 32, 16), pos = g.attributes.position, col = [], i;
    for (i = 0; i < pos.count; i++) {
      var h = pos.getY(i) / 30, c = new T.Color();
      c.setRGB(0.03 + 0.1 * Math.max(0, h), 0.05 + 0.2 * Math.max(0, h), 0.09 + 0.38 * Math.max(0, h));
      if (h < 0) c.setRGB(0.01, 0.015, 0.025);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    sc.add(new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    function box(w, h, x, y, z, r, gg, b) {
      var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(r, gg, b), side: T.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m);
    }
    box(14, 4, 0, 14, 6, 5, 5.4, 6);          // key strip light, top
    box(3, 12, -16, 3, 4, 1.2, 2.4, 3.6);     // cool side fill
    box(3, 10, 16, 2, -3, 0.6, 3.2, 5.2);     // cyan rim from behind right
    box(10, 2, 0, -2, -14, 1.6, 1.8, 2.2);
    var pm = new T.PMREMGenerator(renderer), rt = pm.fromScene(sc, 0.03);
    pm.dispose();
    sc.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    rt.texture.userData = rt.texture.userData || {};
    rt.texture.userData.target = rt;
    return rt.texture;
  };

  /** Soft radial glow sprite (cyan halo behind the model). */
  MEGA.makeGlow = function () {
    var cv = document.createElement('canvas'); cv.width = cv.height = 128;
    var x = cv.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(56,189,248,0.55)'); gr.addColorStop(0.4, 'rgba(56,189,248,0.14)'); gr.addColorStop(1, 'rgba(56,189,248,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    var s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }));
    s.scale.set(7, 3.2, 1); return s;
  };

  /** Slow parallax dust used to sell camera travel between modules. */
  MEGA.makeDust = function (n) {
    var p = new Float32Array(n * 3), i;
    for (i = 0; i < n; i++) { p[i * 3] = -8 + Math.random() * 44; p[i * 3 + 1] = (Math.random() - 0.5) * 6; p[i * 3 + 2] = -5 + Math.random() * 7; }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3));
    return new T.Points(g, new T.PointsMaterial({ color: CYAN, size: 0.022, transparent: true, opacity: 0.45, depthWrite: false, blending: T.AdditiveBlending }));
  };

  /* ---------- flow particles (GPU-animated: the CPU only updates uniforms) ---------- */
  // Match the model's baffle stations exactly, with a flat crossing across
  // each plate's full thickness plus clearance. Odd plates open downward.
  var stations = [{ x: C.nozX, y: '0.34' }];
  for (var bk = C.baffleN; bk >= 1; bk--) {
    var bx = -1.45 + bk * (2.9 / (C.baffleN + 1)), by = bk % 2 ? '-w' : 'w';
    stations.push({ x: bx + C.baffleT / 2 + 0.012, y: by }, { x: bx - C.baffleT / 2 - 0.012, y: by });
  }
  stations.push({ x: -C.nozX, y: '0.34' });
  var shellPath = 'float wy(float x,float w){';
  for (var si = 0; si < stations.length - 1; si++) {
    var sa = stations[si], sb = stations[si + 1];
    shellPath += 'if(x>=' + sb.x.toFixed(8) + ')return seg(x,' + sa.x.toFixed(8) + ',' + sb.x.toFixed(8) + ',' + sa.y + ',' + sb.y + ');';
  }
  shellPath += 'return 0.34;}';
  var VERT_COMMON = [
    'uniform float uTime,uShow,uSize,uScale; attribute float aPh,aSp; varying float vA,vT;',
    'float seg(float x,float xa,float xb,float ya,float yb){float t=clamp((x-xa)/(xb-xa),0.,1.);return mix(ya,yb,t*t*(3.-2.*t));}',
    shellPath
  ].join('\n');
  var FRAG = 'uniform vec3 uA,uB; varying float vA,vT; void main(){float d=length(gl_PointCoord-.5); if(d>.5) discard; float a=(1.-smoothstep(.12,.5,d))*vA; gl_FragColor=vec4(mix(uA,uB,vT)*(.55+.45*a),a*.95);}';

  function flowMaterial(vertBody, a, b, size, blend) {
    return new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uShow: { value: 0 }, uSize: { value: size }, uScale: { value: 600 },
        uA: { value: new T.Color(a) }, uB: { value: new T.Color(b) } },
      vertexShader: VERT_COMMON + '\nuniform vec3 _u;\n void main(){' + vertBody + '}',
      fragmentShader: FRAG, transparent: true, depthWrite: false, blending: blend || T.AdditiveBlending
    });
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /** hot: straight through ~tube positions (red-orange); cold: zig-zag across baffles (blue). */
  MEGA.buildFlow = function (layout, mobile) {
    var nh = mobile ? 600 : 1800, nc = mobile ? 450 : 1300, i;
    var hp = new Float32Array(nh * 3), ph = new Float32Array(nh), sp = new Float32Array(nh), yz = new Float32Array(nh * 2);
    for (i = 0; i < nh; i++) {
      var t = layout[(Math.random() * layout.length) | 0];
      yz[i * 2] = t.y; yz[i * 2 + 1] = t.z; ph[i] = Math.random(); sp[i] = rnd(0.07, 0.11);
    }
    var hg = new T.BufferGeometry();
    hg.setAttribute('position', new T.BufferAttribute(hp, 3)); hg.setAttribute('aYZ', new T.BufferAttribute(yz, 2));
    hg.setAttribute('aPh', new T.BufferAttribute(ph, 1)); hg.setAttribute('aSp', new T.BufferAttribute(sp, 1));
    var hm = flowMaterial('float s=fract(aPh+uTime*aSp); vec3 p=vec3((s*2.-1.)*1.5,aYZ.x,aYZ.y); vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=uSize*uScale/-mv.z; vA=uShow*smoothstep(0.,.05,s)*(1.-smoothstep(.95,1.,s)); vT=s;', 0xff7a1a, 0xff2200, 0.03, T.NormalBlending);
    hm.vertexShader = hm.vertexShader.replace('uniform vec3 _u;', 'attribute vec2 aYZ;');
    var tubeExtent = 0;
    layout.forEach(function (p) { tubeExtent = Math.max(tubeExtent, Math.hypot(p.y, p.z)); });
    hg.boundingSphere = new T.Sphere(new T.Vector3(), Math.hypot(1.5, tubeExtent));
    var hot = new T.Points(hg, hm);

    var cp = new Float32Array(nc * 3), cph = new Float32Array(nc), csp = new Float32Array(nc), cl = new Float32Array(nc * 3);
    for (i = 0; i < nc; i++) { cph[i] = Math.random(); csp[i] = rnd(0.06, 0.1); cl[i * 3] = rnd(0.55, 1.0); cl[i * 3 + 1] = rnd(-0.05, 0.05); cl[i * 3 + 2] = rnd(-1, 1); }
    var cg = new T.BufferGeometry();
    cg.setAttribute('position', new T.BufferAttribute(cp, 3)); cg.setAttribute('aL', new T.BufferAttribute(cl, 3));
    cg.setAttribute('aPh', new T.BufferAttribute(cph, 1)); cg.setAttribute('aSp', new T.BufferAttribute(csp, 1));
    var cm = flowMaterial([
      'float s=fract(aPh+uTime*aSp); float q=clamp((s-.08)/.84,0.,1.);',
      'float x=mix(' + C.nozX.toFixed(8) + ',' + (-C.nozX).toFixed(8) + ',q);',
      'float spread=smoothstep(0.,.08,q)*(1.-smoothstep(.92,1.,q));',
      'float w=' + (C.cutH + 0.055).toFixed(8) + '+.045*aL.x;',
      'float y=wy(x,w)+spread*(aL.y*.2+.006*sin(uTime*3.+aPh*40.));',
      'float z=aL.z*.85*spread*sqrt(max(0.,' + Math.pow(C.shellR - 0.02, 2).toFixed(8) + '-y*y));',
      'if(s<.08){y=mix(.7,.34,s/.08);z=0.;}else if(s>.92){y=mix(.34,.7,(s-.92)/.08);z=0.;}',
      'vec4 mv=modelViewMatrix*vec4(x,y,z,1.); gl_Position=projectionMatrix*mv; gl_PointSize=uSize*uScale/-mv.z;',
      'vA=uShow*smoothstep(0.,.05,s)*(1.-smoothstep(.95,1.,s)); vT=s;'
    ].join('\n'), 0x1f66ff, 0x4fc8ff, 0.052, T.NormalBlending);
    cm.vertexShader = cm.vertexShader.replace('uniform vec3 _u;', 'attribute vec3 aL;');
    cg.boundingSphere = new T.Sphere(new T.Vector3(), Math.hypot(C.nozX, 0.7));
    var cold = new T.Points(cg, cm);

    var grp = new T.Group(); grp.add(hot, cold);
    return {
      group: grp,
      /** time in seconds, show 0..1, scale = pixels per world unit at distance 1 */
      update: function (time, show, scale) {
        [hm, cm].forEach(function (m) { m.uniforms.uTime.value = time; m.uniforms.uShow.value = show; m.uniforms.uScale.value = scale; });
        grp.visible = show > 0.01;
      }
    };
  };

  /* ---------- module outline models (glass fill + cyan wire) ---------- */
  function Lines() {
    var v = [];
    return {
      seg: function (a, b) { v.push(a[0], a[1], a[2], b[0], b[1], b[2]); },
      poly: function (pts, close) { for (var i = 0; i < pts.length - 1; i++) this.seg(pts[i], pts[i + 1]); if (close) this.seg(pts[pts.length - 1], pts[0]); },
      circle: function (r, y, cx, cz, n) {
        n = n || 56; var p = [], i; for (i = 0; i < n; i++) { var a = i / n * Math.PI * 2; p.push([cx + r * Math.cos(a), y, cz + r * Math.sin(a)]); }
        this.poly(p, true);
      },
      geometry: function () { var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(v, 3)); return g; }
    };
  }
  function wireMat(op) { return new T.LineBasicMaterial({ color: CYAN, transparent: true, opacity: op, depthWrite: false, blending: T.AdditiveBlending }); }
  function glassMat() { return new T.MeshBasicMaterial({ color: 0x0b4a6e, transparent: true, opacity: 0.18, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }); }
  function lathe(profile) { return new T.LatheGeometry(profile.map(function (p) { return new T.Vector2(p[0], p[1]); }), 64); }

  /* ---- shared helpers for the module wireframes ---- */
  /** Closed ring of radius r centred at c, in the plane spanned by unit vectors u and v. */
  function ringP(L, c, u, v, r, n) {
    var p = [], i, t;
    for (i = 0; i < n; i++) {
      t = i / n * Math.PI * 2;
      p.push([c[0] + r * (Math.cos(t) * u[0] + Math.sin(t) * v[0]), c[1] + r * (Math.cos(t) * u[1] + Math.sin(t) * v[1]), c[2] + r * (Math.cos(t) * u[2] + Math.sin(t) * v[2])]);
    }
    L.poly(p, true);
  }
  /** Horizontal dashed ring (XZ plane) at height y. */
  function dashRing(L, r, y, n) {
    for (var i = 0; i < n; i += 2) {
      var a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      L.seg([r * Math.cos(a0), y, r * Math.sin(a0)], [r * Math.cos(a1), y, r * Math.sin(a1)]);
    }
  }
  /** Dash-dot centre line from a to b (drafting convention: long dash, gap, dot, gap). */
  function centreLine(L, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.sqrt(dx * dx + dy * dy + dz * dz), pat = [0.07, 0.018, 0.008, 0.018], t = 0, k = 0;
    while (t < len) {
      var d = Math.min(pat[k % 4], len - t);
      if (k % 2 === 0) L.seg([a[0] + dx * t / len, a[1] + dy * t / len, a[2] + dz * t / len], [a[0] + dx * (t + d) / len, a[1] + dy * (t + d) / len, a[2] + dz * (t + d) / len]);
      t += d; k++;
    }
  }
  function crossV(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  /** Flanged pipe stub: neck rings at both ends joined by four lines, plus a larger flange ring at the free end. */
  function stub(L, base, d, len, r, flangeR) {
    var u = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], v = crossV(d, u), end = [base[0] + d[0] * len, base[1] + d[1] * len, base[2] + d[2] * len], k, t;
    u = crossV(v, d);
    ringP(L, base, u, v, r, 20); ringP(L, end, u, v, r, 20); ringP(L, end, u, v, flangeR, 24);
    var end2 = [end[0] - d[0] * 0.012, end[1] - d[1] * 0.012, end[2] - d[2] * 0.012]; ringP(L, end2, u, v, flangeR, 24);
    for (k = 0; k < 4; k++) {
      t = k / 4 * Math.PI * 2;
      L.seg([base[0] + r * (Math.cos(t) * u[0] + Math.sin(t) * v[0]), base[1] + r * (Math.cos(t) * u[1] + Math.sin(t) * v[1]), base[2] + r * (Math.cos(t) * u[2] + Math.sin(t) * v[2])],
            [end[0] + r * (Math.cos(t) * u[0] + Math.sin(t) * v[0]), end[1] + r * (Math.cos(t) * u[1] + Math.sin(t) * v[1]), end[2] + r * (Math.cos(t) * u[2] + Math.sin(t) * v[2])]);
    }
  }
  /** Ground ring + faint floor disc under a standing model, so it reads as sitting on a plane. */
  function ground(parts, y, r) {
    var L = Lines(); L.circle(r, y, 0, 0, 96); dashRing(L, r * 0.72, y, 72);
    parts.push(new T.LineSegments(L.geometry(), wireMat(0.35)));
    var disc = new T.Mesh(new T.CircleGeometry(r, 64), new T.MeshBasicMaterial({ color: 0x0b4a6e, transparent: true, opacity: 0.16, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }));
    disc.rotation.x = -HALF_PI; disc.position.y = y - 0.001; parts.push(disc);
  }

  /** Tube sheet: plate with 28 bolt holes and the 420-hole triangular layout, drawn like a drafting face view
   *  (bolt circle, outer tube limit, shell bore line and dash-dot centre lines). */
  function moduleTubeSheet(layout, parts) {
    var g = MEGA.discGeometry(C.sheetR, 0, C.sheetT, true); g.rotateZ(HALF_PI);
    parts.push(new T.Mesh(g, glassMat()), new T.LineSegments(new T.EdgesGeometry(g, 30), wireMat(0.9)));
    var rg = new T.RingGeometry(C.tubeR * 0.8, C.tubeR * 1.05, 14); rg.rotateX(-HALF_PI);
    var m = new T.InstancedMesh(rg, new T.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), layout.length);
    m.frustumCulled = true; var d = new T.Object3D(), otl = 0;
    layout.forEach(function (p, i) {
      d.position.set(p.z, C.sheetT / 2 + 0.0006, p.y); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
      otl = Math.max(otl, Math.sqrt(p.y * p.y + p.z * p.z));
    });
    rg.boundingSphere = new T.Sphere(new T.Vector3(), Math.hypot(otl + C.tubeR * 1.05, C.sheetT / 2 + 0.0006));
    parts.push(m);
    var y = C.sheetT / 2 + 0.001, L = Lines(), ext = C.sheetR + 0.09;
    dashRing(L, C.boltCircle, y, 160);                        // bolt circle (PCD)
    L.circle(otl + C.tubeR + 0.006, y, 0, 0, 120);            // outer tube limit
    L.circle(C.shellR, y, 0, 0, 120);                         // shell bore / gasket seating line
    centreLine(L, [-ext, y, 0], [ext, y, 0]); centreLine(L, [0, y, -ext], [0, y, ext]);
    parts.push(new T.LineSegments(L.geometry(), wireMat(0.55)));
  }

  /** Bonnet (body) flange, weld-neck: flange ring with 28 bolt holes, tapered hub and neck, raised face,
   *  and studs with nuts through every hole. */
  function moduleBonnet(parts) {
    var t = 0.07, g = MEGA.discGeometry(C.sheetR, 0.36, t, true); g.rotateZ(HALF_PI);
    var hubProf = [[0.395, t / 2], [0.374, 0.16], [0.374, 0.26], [0.367, 0.272]];
    var hub = lathe([[0.36, t / 2]].concat(hubProf, [[0.36, 0.272], [0.36, t / 2]]));
    var face = lathe([[0.36, -t / 2], [0.405, -t / 2], [0.405, -t / 2 - 0.006], [0.36, -t / 2 - 0.006]]);
    parts.push(new T.Mesh(g, glassMat()), new T.LineSegments(new T.EdgesGeometry(g, 30), wireMat(0.9)),
      new T.Mesh(hub, glassMat()), new T.LineSegments(MEGA.wireRevolve(hubProf, 28, [0, 1, 2, 3], 64), wireMat(0.85)),
      new T.Mesh(face, glassMat()));
    var L = Lines(), k, a, x, z, s;
    L.circle(0.405, -t / 2 - 0.006, 0, 0, 96); L.circle(0.36, -t / 2 - 0.006, 0, 0, 96);      // raised face
    L.circle(0.36, 0.272, 0, 0, 96);                                                          // weld-end bore
    for (k = 0; k < C.nBolts; k++) {                                                          // studs + nuts
      a = k / C.nBolts * Math.PI * 2; x = C.boltCircle * Math.cos(a); z = C.boltCircle * Math.sin(a);
      L.seg([x, -t / 2 - 0.05, z], [x, t / 2 + 0.05, z]);
      [t / 2, t / 2 + 0.022, -t / 2, -t / 2 - 0.022].forEach(function (yy) {
        var hex = [];
        for (s = 0; s < 6; s++) { var b = s / 6 * Math.PI * 2 + 0.3; hex.push([x + 0.018 * Math.cos(b), yy, z + 0.018 * Math.sin(b)]); }
        L.poly(hex, true);
      });
    }
    parts.push(new T.LineSegments(L.geometry(), wireMat(0.7)));
  }

  /** Shop tank: vertical vessel, 2:1 dished heads, four pipe legs with base plates, side + bottom nozzles,
   *  top manway, shell ladder, girth seam and nameplate, standing on a ground ring. */
  function moduleShopTank(parts) {
    var R = 0.42, H = 0.525, dish = R / 2, n = 14, prof = [], i, k, a, y;
    for (i = 0; i <= n; i++) { var f = i / n * HALF_PI; prof.push([R * Math.cos(f), -H - dish * Math.sin(f)]); }
    prof.reverse(); prof.push([R, H]);
    for (i = 0; i <= n; i++) { var f2 = i / n * HALF_PI; prof.push([R * Math.cos(f2), H + dish * Math.sin(f2)]); }
    parts.push(new T.Mesh(lathe(prof), glassMat()));
    parts.push(new T.LineSegments(MEGA.wireRevolve(prof, 18, [4, 8, 14, 15, 22, 26], 56), wireMat(0.8)));
    var L = Lines(), floor = -H - dish - 0.14, legR = R + 0.02, ta, tx, tz, pad;
    L.circle(R, -H + 0.875, 0, 0, 72);                                                        // girth seam (1250 mm course)
    for (k = 0; k < 4; k++) {                                                                 // pipe legs, pads, base plates
      a = Math.PI / 4 + k * HALF_PI; ta = [-Math.sin(a), Math.cos(a)];
      tx = legR * Math.cos(a); tz = legR * Math.sin(a);
      L.seg([tx - 0.018 * ta[0], -H + 0.16, tz - 0.018 * ta[1]], [tx - 0.018 * ta[0], floor, tz - 0.018 * ta[1]]);
      L.seg([tx + 0.018 * ta[0], -H + 0.16, tz + 0.018 * ta[1]], [tx + 0.018 * ta[0], floor, tz + 0.018 * ta[1]]);
      pad = [[tx - 0.035 * ta[0], -H + 0.2, tz - 0.035 * ta[1]], [tx + 0.035 * ta[0], -H + 0.2, tz + 0.035 * ta[1]], [tx + 0.035 * ta[0], -H + 0.12, tz + 0.035 * ta[1]], [tx - 0.035 * ta[0], -H + 0.12, tz - 0.035 * ta[1]]];
      L.poly(pad, true);
      L.poly([[tx - 0.05 * ta[0] - 0.05 * Math.cos(a), floor, tz - 0.05 * ta[1] - 0.05 * Math.sin(a)], [tx + 0.05 * ta[0] - 0.05 * Math.cos(a), floor, tz + 0.05 * ta[1] - 0.05 * Math.sin(a)],
              [tx + 0.05 * ta[0] + 0.05 * Math.cos(a), floor, tz + 0.05 * ta[1] + 0.05 * Math.sin(a)], [tx - 0.05 * ta[0] + 0.05 * Math.cos(a), floor, tz - 0.05 * ta[1] + 0.05 * Math.sin(a)]], true);
    }
    var yTop = H + dish * Math.sqrt(1 - Math.pow(0.1 / R, 2));                               // top manway
    ringP(L, [0, yTop, 0], [1, 0, 0], [0, 0, 1], 0.1, 28); ringP(L, [0, yTop + 0.075, 0], [1, 0, 0], [0, 0, 1], 0.1, 28);
    ringP(L, [0, yTop + 0.075, 0], [1, 0, 0], [0, 0, 1], 0.125, 32); ringP(L, [0, yTop + 0.09, 0], [1, 0, 0], [0, 0, 1], 0.125, 32);
    for (k = 0; k < 8; k++) { a = k / 8 * Math.PI * 2; L.seg([0.1 * Math.cos(a), yTop, 0.1 * Math.sin(a)], [0.1 * Math.cos(a), yTop + 0.075, 0.1 * Math.sin(a)]); }
    stub(L, [R, 0.2, 0], [1, 0, 0], 0.15, 0.04, 0.065);                                      // side nozzle
    stub(L, [0, -H - dish, 0], [0, -1, 0], 0.08, 0.035, 0.055);                              // bottom outlet
    var np = 0.55, nw = 0.16, nh = 0.09;                                                      // nameplate on the shell
    L.poly([[(R + 0.004) * Math.cos(np - nw / 2), -0.05 + nh / 2, (R + 0.004) * Math.sin(np - nw / 2)], [(R + 0.004) * Math.cos(np + nw / 2), -0.05 + nh / 2, (R + 0.004) * Math.sin(np + nw / 2)],
            [(R + 0.004) * Math.cos(np + nw / 2), -0.05 - nh / 2, (R + 0.004) * Math.sin(np + nw / 2)], [(R + 0.004) * Math.cos(np - nw / 2), -0.05 - nh / 2, (R + 0.004) * Math.sin(np - nw / 2)]], true);
    var a0 = -1.0, aL = a0 - 0.1, aR = a0 + 0.1, rr = R + 0.04, yb = -H + 0.08, yt = H + 0.04;  // ladder
    L.seg([rr * Math.cos(aL), yb, rr * Math.sin(aL)], [rr * Math.cos(aL), yt, rr * Math.sin(aL)]);
    L.seg([rr * Math.cos(aR), yb, rr * Math.sin(aR)], [rr * Math.cos(aR), yt, rr * Math.sin(aR)]);
    for (y = yb + 0.05; y < yt; y += 0.075) L.seg([rr * Math.cos(aL), y, rr * Math.sin(aL)], [rr * Math.cos(aR), y, rr * Math.sin(aR)]);
    [yb + 0.04, 0, yt - 0.04].forEach(function (yy) {
      L.seg([R * Math.cos(aL), yy, R * Math.sin(aL)], [rr * Math.cos(aL), yy, rr * Math.sin(aL)]);
      L.seg([R * Math.cos(aR), yy, R * Math.sin(aR)], [rr * Math.cos(aR), yy, rr * Math.sin(aR)]);
    });
    parts.push(new T.LineSegments(L.geometry(), wireMat(0.85)));
    ground(parts, floor - 0.002, 0.78);
  }

  /** Site tank: tall coursed shell (default 9100 x 10500 mm, H/D 1.15, 7 x 1500 mm courses), 15 degree cone roof
   *  on 20 rafters with centre drum, sloped bottom, wind girder, 28 anchor chairs, a clean helical stair
   *  (stringers, treads, handrail and posts) ending at a roof platform, shell nozzle and manway. */
  function moduleSiteTank(parts) {
    var R = 0.5, H = 0.575, courses = 7, roof = R * Math.tan(15 * Math.PI / 180), drop = R / 25, drum = 0.043, k, j, a, y;
    var prof = [[0.0, -H - drop], [R + 0.03, -H], [R, -H], [R, H], [drum, H + roof], [0.0, H + roof]];
    parts.push(new T.Mesh(lathe(prof), glassMat()));
    var L = Lines();
    for (k = 0; k <= courses; k++) L.circle(R, -H + k * H * 2 / courses, 0, 0, 96);            // course lines
    for (j = 0; j < courses; j++) for (k = 0; k < 3; k++) {                                    // staggered vertical seams
      a = j * 0.7 + k * Math.PI * 2 / 3; L.seg([R * Math.cos(a), -H + j * H * 2 / courses, R * Math.sin(a)], [R * Math.cos(a), -H + (j + 1) * H * 2 / courses, R * Math.sin(a)]);
    }
    L.circle(R + 0.03, -H, 0, 0, 96);                                                          // annular plate
    L.circle(R + 0.045, H - 0.06, 0, 0, 96); L.circle(R + 0.005, H - 0.06, 0, 0, 96);           // wind girder (outer edge + toe)
    for (k = 0; k < 20; k++) { a = k / 20 * Math.PI * 2; L.seg([R * Math.cos(a), H, R * Math.sin(a)], [drum * Math.cos(a), H + roof, drum * Math.sin(a)]); }   // rafters
    for (k = 0; k < 3; k++) L.circle(R * (1 - (k + 1) * 0.25), H + roof * (k + 1) * 0.25, 0, 0, 64);                                                        // roof rings
    ringP(L, [0, H + roof, 0], [1, 0, 0], [0, 0, 1], drum, 20); ringP(L, [0, H + roof + 0.03, 0], [1, 0, 0], [0, 0, 1], drum, 20);                         // centre drum
    for (k = 0; k < 8; k++) { a = k / 8 * Math.PI * 2; L.seg([drum * Math.cos(a), H + roof, drum * Math.sin(a)], [drum * Math.cos(a), H + roof + 0.03, drum * Math.sin(a)]); }
    for (k = 0; k < 28; k++) {                                                                  // anchor chairs (top plate + gussets)
      a = k / 28 * Math.PI * 2;
      var c0 = Math.cos(a), s0 = Math.sin(a), tc = -s0, ts = c0;
      L.seg([(R + 0.002) * c0, -H + 0.05, (R + 0.002) * s0], [(R + 0.03) * c0, -H + 0.05, (R + 0.03) * s0]);
      L.seg([(R + 0.03) * c0 + 0.008 * tc, -H, (R + 0.03) * s0 + 0.008 * ts], [(R + 0.03) * c0 + 0.008 * tc, -H + 0.05, (R + 0.03) * s0 + 0.008 * ts]);
    }
    // helical stair: inner and outer stringers, a tread every few steps, handrail with posts; 3/4 turn to a roof platform
    var turn = 1.5 * Math.PI, a0 = 0.6, n = 72, ri = R + 0.012, ro = R + 0.075, rail = 0.065, inner = [], outer = [], hand = [];
    for (k = 0; k <= n; k++) {
      a = a0 + k / n * turn; y = -H + 0.02 + (H * 2 - 0.02) * k / n;
      inner.push([ri * Math.cos(a), y, ri * Math.sin(a)]); outer.push([ro * Math.cos(a), y, ro * Math.sin(a)]);
      hand.push([ro * Math.cos(a), y + rail, ro * Math.sin(a)]);
      if (k % 3 === 0) L.seg([ri * Math.cos(a), y, ri * Math.sin(a)], [ro * Math.cos(a), y, ro * Math.sin(a)]);
      if (k % 9 === 0) L.seg([ro * Math.cos(a), y, ro * Math.sin(a)], [ro * Math.cos(a), y + rail, ro * Math.sin(a)]);
    }
    L.poly(inner); L.poly(outer); L.poly(hand);
    var ae = a0 + turn, pl = [], pr = [];                                                       // roof platform with guardrail
    for (k = 0; k <= 10; k++) {
      var ap = ae + k / 10 * 0.35, rp = R - 0.09;
      pl.push([rp * Math.cos(ap), H + 0.004 + (R - rp) * Math.tan(15 * Math.PI / 180), rp * Math.sin(ap)]);
      pr.push([(R - 0.012) * Math.cos(ap), H + rail, (R - 0.012) * Math.sin(ap)]);
      if (k % 5 === 0) L.seg([(R - 0.012) * Math.cos(ap), H, (R - 0.012) * Math.sin(ap)], [(R - 0.012) * Math.cos(ap), H + rail, (R - 0.012) * Math.sin(ap)]);
    }
    L.poly(pl); L.poly(pr);
    var nz = 2.0; stub(L, [R * Math.cos(nz), -H + 0.1, R * Math.sin(nz)], [Math.cos(nz), 0, Math.sin(nz)], 0.12, 0.022, 0.036);
    var mw = 3.6; stub(L, [R * Math.cos(mw), -H + 0.2, R * Math.sin(mw)], [Math.cos(mw), 0, Math.sin(mw)], 0.07, 0.04, 0.056);
    parts.push(new T.LineSegments(L.geometry(), wireMat(0.8)));
    ground(parts, -H - drop - 0.004, 0.82);
  }

  /** kind: 'tubesheet' | 'bonnet' | 'shop' | 'site'. Returns Group with update(t). */
  MEGA.buildModule = function (kind, layout) {
    var parts = [], spin = new T.Group(), tilt = new T.Group(), tiltX = 0.9, rate = 0.22;
    if (kind === 'tubesheet') moduleTubeSheet(layout, parts);
    else if (kind === 'bonnet') { moduleBonnet(parts); tiltX = 0.75; }
    else if (kind === 'shop') { moduleShopTank(parts); tiltX = 0.28; }
    else { moduleSiteTank(parts); tiltX = 0.42; rate = 0.15; }
    var off = new T.Group(); off.position.y = kind === 'shop' ? 0.03 : kind === 'site' ? -0.07 : 0; /* centre each model in frame */
    parts.forEach(function (p) { off.add(p); }); spin.add(off);
    tilt.add(spin); tilt.rotation.x = tiltX;
    var out = new T.Group(); out.add(tilt);
    out.userData.update = function (t) { spin.rotation.y = t * rate; };
    return out;
  };
})();
