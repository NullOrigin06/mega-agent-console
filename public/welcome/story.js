/* Mega Engineering Suite welcome page: renderer, scroll story (GSAP ScrollTrigger) and overlays.
 * Everything animated by scroll lives in one plain object `S`; the timeline only tweens S,
 * and frame() reads S and applies it to the scene. */
(function () {
  'use strict';
  var MEGA = window.MEGA, T = window.THREE;
  var loaderEl = document.getElementById('loader');

  /** No WebGL, or the build threw: keep the page readable and leave the line drawing as a still figure. */
  function fallback(err) {
    if (err && window.console) console.warn('Welcome page 3D view unavailable:', err);
    var c = document.getElementById('gl'); if (c) c.style.display = 'none';
    if (loaderEl) { loaderEl.classList.remove('done'); loaderEl.classList.add('still'); loaderEl.removeAttribute('role'); }
  }
  if (!MEGA || !T || !window.gsap || !window.ScrollTrigger) { fallback('scripts missing'); initPlain(); return; }

  var clamp = T.MathUtils.clamp, lerp = T.MathUtils.lerp, smooth = T.MathUtils.smoothstep;
  var reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = reducedQuery.matches;
  var coarse = window.matchMedia('(pointer: coarse)').matches;
  // Same breakpoint as the stylesheet, so the scene framing and the text layout always agree.
  function isMobile() { return window.innerWidth <= 860 || (coarse && window.innerWidth < 900); }
  function isNarrow() { return !isMobile() && (window.innerWidth / Math.max(1, window.innerHeight)) < 1.65; }
  var mobile = isMobile();

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  /* ---------- things that work without the 3D view ---------- */
  function initPlain() {
    // Section links land on the middle of a section, where its scene is held, not on its top edge.
    var links = Array.prototype.slice.call(document.querySelectorAll('a[href^="#s-"]'));
    var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    links.forEach(function (a) {
      a.addEventListener('click', function (e) {
        var sec = document.getElementById(a.getAttribute('href').slice(1)); if (!sec) return;
        e.preventDefault();
        var first = !sec.previousElementSibling, last = !sec.nextElementSibling;
        var y = first ? 0 : last ? document.documentElement.scrollHeight : sec.offsetTop + (sec.offsetHeight - window.innerHeight) / 2;
        window.scrollTo({ top: y, behavior: still ? 'auto' : 'smooth' });
        var h = sec.querySelector('h1,h2'); if (h) h.focus({ preventScroll: true });
        if (history.replaceState) history.replaceState(null, '', a.getAttribute('href'));
      });
    });
    // Footer: the current Local Agent release, read from the same file the app uses.
    var rel = document.getElementById('rel');
    if (rel && window.fetch) {
      fetch('/agent-releases.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (list) {
        var cur = list && list[0]; if (!cur || !cur.version) return;
        var d = cur.date ? new Date(cur.date) : null;
        var when = d && !isNaN(d) ? ', released ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        rel.textContent = 'Local Agent ' + cur.version + when; rel.hidden = false;
      }).catch(function () {});
    }
  }

  /* ---------- animated state (desktop values; mobile tweaks in sceneKeys) ---------- */
  var S = (MEGA.S = {});
  var BASE = {
    az: 0.55, el: 0.18, fov: 32, viewW: 5.6, tx: 0, ty: 0, tz: 0, ox: 0, oy: 0.15, yaw: 0, flat: 0, spin: 1,
    explode: 0, shellOut: 0, shellOp: 1, clip: 0, ghost: 0, tubeOp: 1, bp: 0, glow: 0, flow: 0, rim: 1,
    tagOp: 0, dimHero: 1, dimBP: 0, gridI: 0.55, tblock: 0
  };
  function key(o) { var k = {}, p; for (p in BASE) k[p] = o && p in o ? o[p] : BASE[p]; return k; }

  /** One keyframe per <section class="step"> (same order as the markup). */
  function sceneKeys() {
    var m = mobile, narrow = isNarrow();
    var modK = function (i, vw, side) {
      // Desktop: centre the part in the space the text column leaves free, and keep it small enough to stay inside that space.
      var W = window.innerWidth, H = Math.max(1, window.innerHeight), cf = Math.min(0.66, (540 + Math.max(20, Math.min(96, W * 0.06))) / W), free = 1 - cf;
      var dvw = Math.max(narrow ? vw * 1.25 : vw, vw * 0.4 / (free * 0.9), vw * (W / H) / 1.6);
      return key({ az: 0.0, el: 0.04, fov: 32, viewW: m ? vw * 0.62 : dvw, tx: 12 + 4 * i, ox: m ? 0 : side * Math.max(narrow ? 0.26 : 0.17, cf / 2), oy: m ? -0.2 : 0,
        explode: 1, shellOp: 0.2, ghost: 0.3, rim: 0.4, spin: 0, dimHero: 0, gridI: 0.6 });
    };
    return [
      /* 0 hero      */ key({ ox: m ? 0 : 0.17, oy: m ? 0.3 : 0.16, viewW: m ? 4.9 : 6.8 }),
      /* 1 exploded  */ key({ az: 0.5, el: 0.2, viewW: m ? 9.6 : 11.6, ox: m ? 0 : 0.03, oy: m ? -0.18 : 0.17, explode: 1, shellOp: 0.2, ghost: 0.35, rim: 0.6, spin: 0.4, tagOp: m ? 0 : 1, dimHero: 0, gridI: 0.6 }),
      /* 2 cutaway   */ key({ az: 0.38, el: 0.26, viewW: m ? 5.4 : 7.4, ty: 0.5, ox: m ? 0 : -0.22, oy: m ? -0.2 : 0, shellOut: 1, shellOp: 0, clip: 1, ghost: 1, tubeOp: 0.3, glow: 1, flow: 1, rim: 0.5, spin: 0.3, dimHero: 0, gridI: 0.5 }),
      /* 3 drawing   */ key({ az: 0, el: 0, fov: 9, viewW: m ? 7.0 : 8.4, ox: m ? 0 : 0.24, oy: m ? -0.2 : 0.02, bp: 1, flat: 1, spin: 0, rim: 0.2, dimHero: 0, dimBP: 1, gridI: 1, tblock: 1, tubeOp: 1 }),
      /* 4-7 modules */ modK(0, 2.6, -1), modK(1, 2.6, 1), modK(2, 4.3, -1), modK(3, 3.8, 1),
      /* 8 close     */ key({ az: 0.5, el: 0.2, viewW: m ? 6.4 : 9.2, oy: m ? -0.2 : -0.29, rim: 1.4, gridI: 0.6, dimHero: 0 })
    ];
  }

  /* ---------- scene setup ---------- */
  var pixelRatio = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 2);
  function createRenderer(canvas) {
    var r = new T.WebGLRenderer({ canvas: canvas, antialias: !mobile, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(pixelRatio);
    r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.localClippingEnabled = true; r.setClearColor(0x000000, 0);
    return r;
  }
  function addLights(scene) {
    scene.add(new T.HemisphereLight(0x6ea8d8, 0x0a0f18, 0.55));
    var k = new T.DirectionalLight(0xffffff, 1.25); k.position.set(3, 5, 4); scene.add(k);
    var rim = new T.DirectionalLight(0x38bdf8, 2.2); rim.position.set(-4, 2.5, -5); scene.add(rim);
    var rim2 = new T.DirectionalLight(0x38bdf8, 1.4); rim2.position.set(5, -1, -4); scene.add(rim2);
    return rim;
  }

  /* ---------- dimension lines (SVG authored in the markup; here we only set attributes).
   * Anchors are in model units (metres) and match the geometry in model.js. ---------- */
  var DIMS = {
    shellID: { a: [0.24, -0.4, 0], b: [0.24, 0.4, 0], off: [0, 0, 0.55], hero: 1, m: 1 },
    tubeLen: { a: [-1.504, -0.45, 0], b: [1.504, -0.45, 0], off: [0, -0.78, 0.5], hero: 1, m: 1 },
    sheetOD: { a: [-1.475, -0.4625, 0], b: [-1.475, 0.4625, 0], off: [-0.9, 0, 0.5], hero: 1, m: 0 },
    overall: { a: [-2.045, 0.46, 0], b: [2.045, 0.46, 0], off: [0, 0.78, 0.5], hero: 0, m: 1 },
    pitch: { a: [0, 0.42, 0], b: [0.4833, 0.42, 0], off: [0, 0.4, 0.5], hero: 0, m: 0 },
    saddle: { a: [-0.62, -0.63, 0], b: [0.62, -0.63, 0], off: [0, -0.3, 0.5], hero: 0, m: 0 },
    cut: { a: [-0.4833, 0.2, 0], b: [-0.4833, 0.4, 0], off: [-0.3, 0, 0.5], hero: 0, m: 0 }
  };
  function initDims() {
    return $$('#dims .dim').map(function (g) {
      var cfg = DIMS[g.getAttribute('data-dim')];
      g.style.display = 'none';
      return { g: g, cfg: cfg, on: false, ex1: $('.ex1', g), ex2: $('.ex2', g), dl: $('.dl', g), tx: $('text', g),
        a: cfg ? new T.Vector3().fromArray(cfg.a) : null, b: cfg ? new T.Vector3().fromArray(cfg.b) : null, o: cfg ? new T.Vector3().fromArray(cfg.off) : null,
        a2: new T.Vector3(), b2: new T.Vector3(), va: new T.Vector3(), vb: new T.Vector3(), vc: new T.Vector3(), vd: new T.Vector3() };
    });
  }
  function project(v, model, cam, W, H, out) {
    out.copy(v); model.localToWorld(out); out.project(cam);
    out.x = (out.x * 0.5 + 0.5) * W; out.y = (-out.y * 0.5 + 0.5) * H; return out;
  }
  function setLine(l, p, q) { l.setAttribute('x1', p.x.toFixed(1)); l.setAttribute('y1', p.y.toFixed(1)); l.setAttribute('x2', q.x.toFixed(1)); l.setAttribute('y2', q.y.toFixed(1)); }
  function updateDims(dims, model, cam, W, H, time) {
    for (var i = 0; i < dims.length; i++) {
      var d = dims[i], cfg = d.cfg; if (!cfg) continue;
      var v = Math.max(cfg.hero ? S.dimHero : 0, S.dimBP);
      if (mobile && !cfg.m) v = 0;
      if (v < 0.005) { if (d.on) { d.g.style.display = 'none'; d.on = false; } continue; }
      if (!d.on) { d.g.style.display = ''; d.on = true; }
      var bob = Math.sin(time * 0.9 + i) * 0.03 * S.dimHero * (1 - S.dimBP);
      d.a2.copy(d.a).add(d.o); d.a2.y += bob; d.b2.copy(d.b).add(d.o); d.b2.y += bob;
      project(d.a, model, cam, W, H, d.va); project(d.b, model, cam, W, H, d.vb);
      project(d.a2, model, cam, W, H, d.vc); project(d.b2, model, cam, W, H, d.vd);
      setLine(d.ex1, d.va, d.vc); setLine(d.ex2, d.vb, d.vd); setLine(d.dl, d.vc, d.vd);
      var len = Math.hypot(d.vd.x - d.vc.x, d.vd.y - d.vc.y);
      d.dl.style.strokeDasharray = len.toFixed(1) + ' ' + len.toFixed(1); d.dl.style.strokeDashoffset = (len * (1 - v)).toFixed(1);
      d.dl.style.opacity = Math.min(1, v * 3).toFixed(3);
      d.ex1.style.opacity = d.ex2.style.opacity = (0.7 * smooth(v, 0, 0.5)).toFixed(3);
      var mx = (d.vc.x + d.vd.x) / 2, my = (d.vc.y + d.vd.y) / 2, vert = Math.abs(d.vd.y - d.vc.y) > Math.abs(d.vd.x - d.vc.x);
      d.tx.setAttribute('x', (vert ? mx - 9 : mx).toFixed(1)); d.tx.setAttribute('y', (vert ? my + 4 : my - 8).toFixed(1));
      d.tx.setAttribute('text-anchor', vert ? 'end' : 'middle');
      d.tx.style.opacity = smooth(v, 0.7, 1).toFixed(3);
    }
  }

  /* ---------- exploded-view part labels ---------- */
  var TAGS = {
    head: [-3.62, 0.3, 0], flange: [2.93, -0.5, 0], bolts: [2.53, 0.5, 0], sheet: [-2.03, -0.5, 0],
    tubes: [-0.5, 0.05, 0.2], baffle: [0.66, -0.4, 0], shell: [-0.3, 0.41, 0.3], saddle: [-0.62, -1.02, 0]
  };
  function initTags() {
    return $$('#tags .tag').map(function (el) {
      var a = TAGS[el.getAttribute('data-tag')];
      return a ? { el: el, p: new T.Vector3().fromArray(a), v: new T.Vector3(), shown: false } : null;
    }).filter(Boolean);
  }
  function updateTags(tags, model, cam, W, H) {
    var show = S.tagOp > 0.02;
    for (var i = 0; i < tags.length; i++) {
      var t = tags[i];
      if (!show) { if (t.shown) { t.el.style.opacity = 0; t.shown = false; } continue; }
      project(t.p, model, cam, W, H, t.v);
      t.el.style.opacity = S.tagOp.toFixed(3); t.shown = true;
      t.el.style.transform = 'translate3d(' + Math.round(t.v.x + 10) + 'px,' + Math.round(t.v.y - 16) + 'px,0)';
    }
  }

  /** Where each section's scene sits on the scroll timeline, measured in viewport heights. */
  function sectionCentres() {
    var secs = $$('.step'), vh = Math.max(1, window.innerHeight);
    var hs = secs.map(function (s) { return s.offsetHeight / vh; });
    var total = Math.max(0.01, hs.reduce(function (a, b) { return a + b; }, 0) - 1), start = 0, cs = [], ws = [];
    hs.forEach(function (h, i) {
      var c = start + h / 2 - 0.5; if (i === 0) c = 0; if (i === hs.length - 1) c = total;
      cs.push(c); ws.push(i === 0 ? 0.3 : Math.min(0.22, h * 0.14)); start += h;
    });
    return { secs: secs, cs: cs, ws: ws, total: total };
  }

  /** Master timeline: holds each scene around the centre of its section and tweens S between neighbours. */
  function buildTimeline(keys) {
    var L = sectionCentres(), cs = L.cs, ws = L.ws, total = L.total;
    var tl = gsap.timeline({ defaults: { ease: 'sine.inOut' },
      scrollTrigger: { trigger: '#story', start: 'top top', end: 'bottom bottom', scrub: reduced ? true : 0.6 } });
    for (var i = 0; i < keys.length - 1; i++) {
      var from = cs[i] + ws[i], to = cs[i + 1] - (i + 1 === keys.length - 1 ? 0.3 : ws[i + 1]);
      var tw = {}; for (var p in keys[i + 1]) tw[p] = keys[i + 1][p];
      tw.duration = Math.max(0.05, to - from); tw.immediateRender = false;
      tl.fromTo(S, key(keys[i]), tw, from);
    }
    if (tl.duration() < total) tl.to({}, { duration: total - tl.duration() }, tl.duration());
    return tl;
  }

  /* ---------- main ---------- */
  function start() {
    var canvas = $('#gl'), pct = $('#ldPct'), bar = $('#ldBar'), grid = $('#grid'), tblock = $('#tblock');
    function progress(v) { if (pct) pct.textContent = Math.round(v); if (bar) bar.style.width = v + '%'; }
    var renderer = createRenderer(canvas);
    gsap.registerPlugin(ScrollTrigger);
    var keys = sceneKeys(); Object.assign(S, keys[0], { intro: reduced ? 1 : 0 });

    var scene = new T.Scene(), world = new T.Group(), model = new T.Group();
    scene.add(world); world.add(model);
    var cam = new T.PerspectiveCamera(32, 1, 0.1, 160);
    var rimLight = addLights(scene);
    var clipPlane = new T.Plane(new T.Vector3(0, -1, 0), 20);
    var ex, flow, mods = [], dust, glow, dims = initDims(), tags = initTags(), W = 1, H = 1;
    var running = false, raf = 0, layoutSig = '';

    function resize() {
      W = Math.max(1, window.innerWidth); H = Math.max(1, window.innerHeight);
      renderer.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix();
    }
    resize();

    // build in stages so the loader can paint between them
    var stages = [
      function () { progress(12); },
      function () { MEGA.env = MEGA.makeEnv(renderer); progress(30); },
      function () { ex = MEGA.buildExchanger({ env: MEGA.env, clipPlane: clipPlane, mobile: mobile }); model.add(ex.group); progress(60); },
      function () {
        flow = MEGA.buildFlow(ex.layout, mobile); model.add(flow.group);
        glow = MEGA.makeGlow(); glow.position.set(0, 0, -1.4); model.add(glow);
        dust = MEGA.makeDust(mobile ? 160 : 420); scene.add(dust); progress(75);
      },
      function () {
        ['tubesheet', 'bonnet', 'shop', 'site'].forEach(function (k, i) {
          var g = MEGA.buildModule(k, ex.layout); g.position.set(12 + 4 * i, 0, 0); g.userData.cx = 12 + 4 * i;
          var mats = [];
          g.traverse(function (o) { if (o.material && mats.indexOf(o.material) < 0) { o.material.userData.base = o.material.opacity; mats.push(o.material); } });
          g.userData.mats = mats; g.userData.near = -1;
          scene.add(g); mods.push(g);
        });
        progress(90);
      },
      function () { ex.update(S); renderer.compile(scene, cam); progress(100); }
    ];
    var si = 0;
    (function step() {
      try {
        // setTimeout, not requestAnimationFrame: a tab opened in the background must still finish building.
        if (si < stages.length) { stages[si++](); return setTimeout(step, 16); }
        begin();
      } catch (err) { stop(); fallback(err); }
    })();

    var time = 0, flowTime = 0, last = 0, mx = 0, my = 0, tmx = 0, tmy = 0, slow = 0, gx = null, gy = null, gi = null, tbv = null;
    var tl = null;

    function buildStory() {
      if (tl) { if (tl.scrollTrigger) tl.scrollTrigger.kill(); tl.kill(); tl = null; }
      mobile = isMobile(); keys = sceneKeys(); layoutSig = mobile + '|' + isNarrow();
      tl = buildTimeline(keys);
      ScrollTrigger.refresh();
    }

    function begin() {
      if (loaderEl) loaderEl.classList.add('done');
      buildStory();
      if (!reduced) {
        gsap.to(S, { intro: 1, duration: 2.4, ease: 'expo.out', delay: 0.1 });
        gsap.from('.hero .copy > *', { y: 16, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.08, delay: 0.15, clearProps: 'all' });
      }
      if (!coarse && !reduced) {
        window.addEventListener('pointermove', function (e) { tmx = e.clientX / W * 2 - 1; tmy = e.clientY / H * 2 - 1; }, { passive: true });
      }
      var rt = 0;
      window.addEventListener('resize', function () {
        resize();
        clearTimeout(rt); rt = setTimeout(function () {
          var dpr = Math.min(window.devicePixelRatio || 1, isMobile() ? 1.25 : 2);
          if (dpr < pixelRatio || Math.abs(dpr - pixelRatio) > 0.5) { pixelRatio = dpr; renderer.setPixelRatio(pixelRatio); resize(); }
          if (layoutSig !== isMobile() + '|' + isNarrow()) buildStory(); else ScrollTrigger.refresh();
        }, 180);
      });
      document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else go(); });
      canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); stop(); });
      canvas.addEventListener('webglcontextrestored', function () {
        // Rebuilding every GPU resource by hand is not worth it here: reload once, and never in a loop.
        var k = 'mega-gl-reload', t = 0; try { t = +sessionStorage.getItem(k) || 0; sessionStorage.setItem(k, String(Date.now())); } catch (e) {}
        if (Date.now() - t > 15000) window.location.reload(); else go();
      });
      var onPref = function () { reduced = reducedQuery.matches; if (reduced) S.intro = 1; buildStory(); };
      if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', onPref); else if (reducedQuery.addListener) reducedQuery.addListener(onPref);
      go();
    }
    function go() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(raf); }

    function frame(now) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      var raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
      // Reduced motion: scrolling still drives the scenes and the parts keep turning, at under half speed. No fly-in, no pointer parallax.
      time += reduced ? dt * 0.45 : dt;
      flowTime += reduced ? dt * 0.4 : dt;

      // Drop render resolution a step if this machine cannot hold the frame rate.
      if (time > 4 && pixelRatio > 1) {
        slow = raw > 0.026 ? slow + 1 : Math.max(0, slow - 1);
        if (slow > 50) { slow = 0; pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); renderer.setSize(W, H, false); }
      }

      var ease = 1 - Math.exp(-dt * 4.2);
      mx += (tmx - mx) * ease; my += (tmy - my) * ease;

      // camera: orbit the target by (az, el); distance derived from the visible world width
      var par = (1 - S.bp * 0.9) * (reduced ? 0 : 1);
      var vf = S.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect), d = S.viewW / (2 * Math.tan(hf / 2));
      var az = S.az + mx * 0.07 * par, el = S.el - my * 0.04 * par;
      cam.fov = S.fov;
      cam.position.set(S.tx + d * Math.sin(az) * Math.cos(el), S.ty + d * Math.sin(el), S.tz + d * Math.cos(az) * Math.cos(el));
      cam.lookAt(S.tx, S.ty, S.tz);
      cam.setViewOffset(W, H, -S.ox * W, -S.oy * H, W, H);
      cam.updateMatrixWorld();

      // model transforms
      var k = 1 - S.intro;
      world.position.set(k * 6, 0, -k * 3); world.rotation.y = k * 0.9;
      model.rotation.y = S.yaw + Math.sin(time * 0.32) * (reduced ? 0.2 : 0.32) * S.spin;
      model.rotation.x = Math.sin(time * 0.21) * 0.03 * S.spin;
      model.scale.set(1, 1, lerp(1, 0.03, S.flat));
      var exOn = S.tx < 9.5;                       // the exchanger is off screen once the camera is on the modules
      if (model.visible !== exOn) model.visible = exOn;
      if (exOn) {
        ex.update(S);
        flow.update(flowTime * 3, S.flow * S.intro, (renderer.domElement.height / (2 * Math.tan(vf / 2))));
        rimLight.intensity = 0.4 + 2.2 * S.rim;
        glow.material.opacity = 0.32 * S.rim * (1 - S.bp) * S.intro; glow.scale.set(7 + 5 * S.explode, 3.2 + 2 * S.explode, 1);
      }
      for (var i = 0; i < mods.length; i++) {
        var g = mods[i], near = 1 - clamp(Math.abs(S.tx - g.userData.cx) / 3.6, 0, 1), vis = near > 0.01;
        if (g.visible !== vis) g.visible = vis;
        if (!vis) continue;
        g.userData.update(time);
        if (Math.abs(near - g.userData.near) > 0.002) {
          g.userData.near = near; g.scale.setScalar(0.7 + 0.3 * near);
          for (var j = 0, ms = g.userData.mats; j < ms.length; j++) ms[j].opacity = ms[j].userData.base * near;
        }
      }
      scene.updateMatrixWorld();

      updateDims(dims, model, cam, W, H, time); updateTags(tags, model, cam, W, H);

      // DOM backdrop: the grid shifts a little with the pointer and brightens for the drawing. Only touched when it changes.
      if (grid) {
        var nx = Math.round(-mx * 26), ny = Math.round(-my * 18), ni = S.gridI.toFixed(2);
        if (nx !== gx || ny !== gy) { gx = nx; gy = ny; grid.style.transform = 'translate3d(' + nx + 'px,' + ny + 'px,0)'; }
        if (ni !== gi) { gi = ni; grid.style.opacity = ni; }
      }
      if (tblock) { var tb = S.tblock.toFixed(2); if (tb !== tbv) { tbv = tb; tblock.style.opacity = tb; } }

      renderer.render(scene, cam);
    }
  }

  initPlain();
  try { start(); } catch (err) { fallback(err); }
})();
