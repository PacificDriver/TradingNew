(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isMobile = window.innerWidth < 860;

  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ limitCallbacks: true, ignoreMobileResize: true });

  /* ══════════════════════════════════════════════════════════════
     THREE.JS HERO — r134 compatible, BMW static inside aura
     Aura: canvas-generated glow textures (no file loading)
     BMW: loaded via TextureLoader (works on file://)
  ══════════════════════════════════════════════════════════════ */
  (function initHero3D() {
    if (typeof THREE === "undefined") { console.warn("Three.js not loaded"); return; }

    var canvas = document.getElementById("hero3d");
    if (!canvas) return;

    var W = window.innerWidth;
    var H = window.innerHeight;

    /* ── Renderer ─────────────────────────────────────────────── */
    var renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: !isMobile,
      alpha: true,
      powerPreference: "low-power",
      stencil: false,
      depth: true
    });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    // r134 API — outputEncoding, not outputColorSpace
    renderer.outputEncoding = THREE.sRGBEncoding;

    var scene = new THREE.Scene();
    var cosmosColor = 0x0b0e11; // one color for sky + ground edge = no visible line
    scene.background = new THREE.Color(cosmosColor);

    var bmwCenterX = window.innerWidth < 860 ? 0.5 : (window.innerWidth < 1200 ? 5.45 : 2.65); // centered on mobile, right on desktop

    /* ── Camera ───────────────────────────────────────────────── */
    var camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
    camera.position.set(0, 0, 7);
    camera.lookAt(1.35, -0.5, 0); // fixed viewport target; BMW can move right on screen

    /* ── Ground + Grid (stylish premium grid with fade) ───────── */
    var groundMat = new THREE.MeshStandardMaterial({
      color: cosmosColor,
      metalness: 0.85,
      roughness: 0.22,
      envMapIntensity: 0.3
    });
    var groundSize = 56; // enough to avoid visible edge, not too large/high
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.6;
    scene.add(ground);

    var gridY = -1.59;
    var gridSize = 34;
    var gridDiv = 32;
    var gridStep = gridSize / gridDiv;
    var gridVerts = 4 * (gridDiv + 1);
    var gridPos = new Float32Array(gridVerts * 3);
    var gridCol = new Float32Array(gridVerts * 3);
    var half = gridSize / 2;
    var r0 = 0.18, g0 = 0.165, b0 = 0.155;
    var r1 = 0.12, g1 = 0.11, b1 = 0.105;
    var idx = 0;
    for (var gi = 0; gi <= gridDiv; gi++) {
      var z = -half + gi * gridStep;
      var f = 1 - 0.55 * (Math.abs(z) / half);
      var r = r0 * f + r1 * (1 - f), g = g0 * f + g1 * (1 - f), b = b0 * f + b1 * (1 - f);
      gridPos[idx] = -half; gridPos[idx + 1] = gridY; gridPos[idx + 2] = z; gridCol[idx] = r; gridCol[idx + 1] = g; gridCol[idx + 2] = b; idx += 3;
      gridPos[idx] = half;  gridPos[idx + 1] = gridY; gridPos[idx + 2] = z; gridCol[idx] = r; gridCol[idx + 1] = g; gridCol[idx + 2] = b; idx += 3;
    }
    for (gi = 0; gi <= gridDiv; gi++) {
      var x = -half + gi * gridStep;
      var f = 1 - 0.55 * (Math.abs(x) / half);
      r = r0 * f + r1 * (1 - f); g = g0 * f + g1 * (1 - f); b = b0 * f + b1 * (1 - f);
      gridPos[idx] = x; gridPos[idx + 1] = gridY; gridPos[idx + 2] = -half; gridCol[idx] = r; gridCol[idx + 1] = g; gridCol[idx + 2] = b; idx += 3;
      gridPos[idx] = x; gridPos[idx + 1] = gridY; gridPos[idx + 2] = half;  gridCol[idx] = r; gridCol[idx + 1] = g; gridCol[idx + 2] = b; idx += 3;
    }
    var gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute("position", new THREE.BufferAttribute(gridPos, 3));
    gridGeo.setAttribute("color", new THREE.BufferAttribute(gridCol, 3));
    var gridMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      linewidth: 1
    });
    var grid = new THREE.LineSegments(gridGeo, gridMat);
    scene.add(grid);

    /* ── Lights ───────────────────────────────────────────────── */
    scene.add(new THREE.AmbientLight(0x161a1e, 0.88));
    var goldLight   = new THREE.PointLight(0xf0b90b, 4.5, 18);
    var purpleLight = new THREE.PointLight(0x64748b, 2.0, 14);
    goldLight.position.set(-3, 2, 4);
    purpleLight.position.set(-2, 3, -3);
    scene.add(goldLight, purpleLight);

    /* ── Canvas-generated glow textures ───────────────────────── */
    var texSize = 128;
    function makeGlowTex(r, g, b) {
      var c = document.createElement("canvas");
      c.width = c.height = texSize;
      var ctx = c.getContext("2d");
      var mid = texSize / 2;
      var grad = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
      grad.addColorStop(0.0, "rgba(" + r + "," + g + "," + b + ",0.9)");
      grad.addColorStop(0.25,"rgba(" + r + "," + g + "," + b + ",0.5)");
      grad.addColorStop(0.55,"rgba(" + r + "," + g + "," + b + ",0.15)");
      grad.addColorStop(1.0, "rgba(" + r + "," + g + "," + b + ",0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, texSize, texSize);
      return new THREE.CanvasTexture(c);
    }

    /* Human-like aura: multi-layer soft gradient (center → outer) */
    function makeAuraLayerTex(stops) {
      var c = document.createElement("canvas");
      c.width = texSize; c.height = texSize;
      var ctx = c.getContext("2d");
      var r = texSize / 2;
      var grad = ctx.createRadialGradient(r, r, 0, r, r, r);
      for (var i = 0; i < stops.length; i++) { grad.addColorStop(stops[i][0], stops[i][1]); }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, texSize, texSize);
      return new THREE.CanvasTexture(c);
    }

    function makeRingTex(r, g, b) {
      var c = document.createElement("canvas");
      c.width = c.height = texSize;
      var ctx = c.getContext("2d");
      var mid = texSize / 2;
      var grad = ctx.createRadialGradient(mid, mid, texSize * 0.33, mid, mid, mid);
      grad.addColorStop(0.0, "rgba(" + r + "," + g + "," + b + ",0)");
      grad.addColorStop(0.6, "rgba(" + r + "," + g + "," + b + ",0.4)");
      grad.addColorStop(0.78, "rgba(" + r + "," + g + "," + b + ",0.18)");
      grad.addColorStop(1.0, "rgba(" + r + "," + g + "," + b + ",0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, texSize, texSize);
      return new THREE.CanvasTexture(c);
    }

    var AX = bmwCenterX; // updated each frame from window width so BMW moves on resize
    var haloZ = -1.05;
    var haloY = 0.2; // halo slightly above center (was 0.5 — lowered)

    /* ── Aura layers (like human aura: core → outer glow → subtle edge) ── */
    function addAuraMesh(stops, w, h, z, op) {
      var tex = makeAuraLayerTex(stops);
      var m = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true, opacity: op,
        blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide
      });
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      mesh.position.set(AX, haloY, z);
      scene.add(mesh);
      return mesh;
    }
    // Layer 1: outermost — very soft violet-gold edge (эфирное тело)
    var auraOuter = addAuraMesh([
      [0, "rgba(255,230,180,0)"],
      [0.5, "rgba(200,180,220,0.04)"],
      [0.72, "rgba(255,210,150,0.08)"],
      [0.88, "rgba(255,200,120,0.04)"],
      [1, "rgba(255,220,180,0)"]
    ], 7, 11, haloZ - 0.08, 0.7);
    // Layer 2: middle — warm amber glow (астральное)
    var auraMid = addAuraMesh([
      [0, "rgba(255,235,180,0.75)"],
      [0.15, "rgba(255,218,140,0.45)"],
      [0.35, "rgba(255,195,90,0.22)"],
      [0.55, "rgba(255,180,80,0.08)"],
      [0.78, "rgba(255,200,120,0.03)"],
      [1, "rgba(255,220,180,0)"]
    ], 5.2, 8, haloZ, 0.5);
    // Layer 3: inner core — bright gold (внутреннее свечение)
    var auraCore = addAuraMesh([
      [0, "rgba(255,248,220,0.95)"],
      [0.12, "rgba(255,230,160,0.7)"],
      [0.3, "rgba(255,210,100,0.35)"],
      [0.55, "rgba(255,190,80,0.12)"],
      [0.8, "rgba(255,200,120,0.02)"],
      [1, "rgba(255,220,180,0)"]
    ], 2.6, 4, haloZ + 0.05, 0.62);
    // Soft ring accent
    var haloRing = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 3.6),
      new THREE.MeshBasicMaterial({
        map: makeRingTex(255, 220, 140),
        transparent: true, opacity: 0.28,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      })
    );
    haloRing.position.set(AX, haloY, haloZ + 0.03);
    scene.add(haloRing);

    /* ── Particles: reduced count for smooth 60fps on all devices ───── */
    var N = 60;
    var pPos = new Float32Array(N * 3);
    var pCol = new Float32Array(N * 3);
    var pSpeed = new Float32Array(N); // per-particle rise speed
    var pDrift = new Float32Array(N * 2); // subtle X,Z drift
    var cGold  = new THREE.Color(0xf5d070);
    var cAmber = new THREE.Color(0xffb347);
    var cWarm  = new THREE.Color(0xffcc80);
    var cSoft  = new THREE.Color(0xffe0a0);
    var colorPool = [cGold, cGold, cAmber, cWarm, cSoft];

    for (var i = 0; i < N; i++) {
      var angle = Math.random() * Math.PI * 2;
      var radius = 1.2 + Math.random() * 3.8;
      pPos[i * 3]     = AX + Math.cos(angle) * radius;
      pPos[i * 3 + 1] = (Math.random() - 0.5) * 4.5;
      pPos[i * 3 + 2] = Math.sin(angle) * radius * 0.28 - 2.2;
      pSpeed[i] = 0.0018 + Math.random() * 0.0022;
      pDrift[i * 2] = (Math.random() - 0.5) * 0.002;
      pDrift[i * 2 + 1] = (Math.random() - 0.5) * 0.0015;
      var pc = colorPool[Math.floor(Math.random() * colorPool.length)];
      pCol[i * 3] = pc.r; pCol[i * 3 + 1] = pc.g; pCol[i * 3 + 2] = pc.b;
    }
    var pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));

    var particleTex = (function () {
      var c = document.createElement("canvas");
      c.width = c.height = 32;
      var ctx = c.getContext("2d");
      var g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, "rgba(255,255,255,0.9)");
      g.addColorStop(0.25, "rgba(255,240,200,0.5)");
      g.addColorStop(0.5, "rgba(255,220,150,0.2)");
      g.addColorStop(1, "rgba(255,220,180,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 32, 32);
      return new THREE.CanvasTexture(c);
    })();

    var pMat = new THREE.PointsMaterial({
      size: 0.06,
      map: particleTex,
      transparent: true,
      opacity: 0.82,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      sizeAttenuation: true
    });
    var pts = new THREE.Points(pGeo, pMat);
    pts.renderOrder = -1;
    scene.add(pts);

    /* ── BMW Group ────────────────────────────────────────────── */
    var bmwGroup = new THREE.Group();
    bmwGroup.position.set(bmwCenterX, gridY + 0.95, 0); // will be adjusted in buildBMWMesh so car sits on grid
    scene.add(bmwGroup);

    var bmwMesh = null;
    var bmwReflect = null;

    function buildBMWMesh(img) {
      var nw = img.naturalWidth || 800;
      var nh = img.naturalHeight || 450;
      var aspect = nw / nh;
      var ww = window.innerWidth;
      var pw = ww < 860 ? 1.85 : (ww < 1200 ? 2.45 : 3.2);
      var ph = pw / aspect;

      // Draw image to canvas → CanvasTexture avoids WebGL "cross-origin" block (texImage2D accepts canvas as same-origin)
      var tc = document.createElement("canvas");
      tc.width = nw;
      tc.height = nh;
      tc.getContext("2d").drawImage(img, 0, 0, nw, nh);
      var tex = new THREE.CanvasTexture(tc);
      tex.encoding = THREE.sRGBEncoding;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;

      var mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.02,
        depthWrite: true,
        side: THREE.DoubleSide
      });
      bmwMesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
      bmwMesh.position.set(0, 0, 0.3);
      bmwGroup.add(bmwMesh);
      bmwGroup.position.y = gridY + ph / 2; // car bottom on grid, adapts to screen size
      bmwGroup.position.z = ww < 860 ? 1.9 : (ww < 1200 ? 1.65 : 1.4); // very close to viewer

      // Reflection (gradient alpha from canvas — no image)
      var alphaC = document.createElement("canvas");
      alphaC.width = 2; alphaC.height = 64;
      var ag = alphaC.getContext("2d");
      var aGrad = ag.createLinearGradient(0, 0, 0, 64);
      aGrad.addColorStop(0, "rgba(255,255,255,0.55)");
      aGrad.addColorStop(1, "rgba(255,255,255,0)");
      ag.fillStyle = aGrad; ag.fillRect(0, 0, 2, 64);
      var alphaTex = new THREE.CanvasTexture(alphaC);
      alphaTex.minFilter = THREE.LinearFilter;

      bmwReflect = new THREE.Mesh(
        new THREE.PlaneGeometry(pw, ph),
        new THREE.MeshBasicMaterial({
          map: tex,
          alphaMap: alphaTex,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      bmwReflect.scale.y = -1;
      bmwReflect.position.set(0, -(ph + 0.2), 0.25);
      bmwGroup.add(bmwReflect);
    }

    function buildBMWFallback() {
      var c = document.createElement("canvas");
      c.width = 800; c.height = 450;
      var ctx = c.getContext("2d");
      ctx.clearRect(0, 0, 800, 450);
      var y0 = 260, ySill = 318, yRoof = 228;
      // Body outline (BMW M5 CS side: long hood, coupe roof, strong rear)
      ctx.beginPath();
      ctx.moveTo(95, ySill);
      ctx.lineTo(95, 305); ctx.lineTo(135, 288); ctx.lineTo(200, 278);
      ctx.lineTo(340, 268); ctx.lineTo(520, 262); ctx.lineTo(660, 268);
      ctx.lineTo(718, 282); ctx.lineTo(732, 298); ctx.lineTo(728, ySill);
      ctx.lineTo(698, ySill + 22); ctx.lineTo(655, ySill + 18);
      ctx.lineTo(420, ySill + 14); ctx.lineTo(180, ySill + 16);
      ctx.lineTo(105, ySill + 18); ctx.closePath();
      ctx.fillStyle = "#1a1a1a";
      ctx.fill();
      ctx.strokeStyle = "#f0b90b";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // Windshield + cabin
      ctx.beginPath();
      ctx.moveTo(218, 272); ctx.lineTo(355, 266); ctx.lineTo(395, 248);
      ctx.lineTo(398, 238); ctx.lineTo(355, 232); ctx.lineTo(218, 238);
      ctx.closePath();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(398, 238); ctx.lineTo(545, 262); ctx.lineTo(548, 272);
      ctx.lineTo(518, 278); ctx.lineTo(398, 272); ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Front wheel
      ctx.beginPath();
      ctx.arc(248, ySill + 28, 32, 0, Math.PI * 2);
      ctx.fillStyle = "#0c0c0c";
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.arc(248, ySill + 28, 18, 0, Math.PI * 2);
      ctx.strokeStyle = "#f0b90b";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Rear wheel
      ctx.beginPath();
      ctx.arc(565, ySill + 26, 32, 0, Math.PI * 2);
      ctx.fillStyle = "#0c0c0c";
      ctx.fill(); ctx.strokeStyle = "#f0b90b"; ctx.stroke();
      ctx.beginPath();
      ctx.arc(565, ySill + 26, 18, 0, Math.PI * 2);
      ctx.stroke();
      // Grille/headlight accent
      ctx.fillStyle = "#f0b90b";
      ctx.fillRect(138, 278, 24, 8);
      var img = new Image();
      img.onload = function () { buildBMWMesh(img); };
      img.src = c.toDataURL("image/png");
    }

    // 1) Embedded base64 (from scripts/embed-bmw.js) — works everywhere, no CORS/taint
    // 2) Else fetch + blob URL — works when served from same origin
    function loadBMWAndBuild() {
      if (window.BMW_IMAGE_DATA) {
        var img = new Image();
        img.onload = function () { if (img.naturalWidth) buildBMWMesh(img); else buildBMWFallback(); };
        img.onerror = buildBMWFallback;
        img.src = window.BMW_IMAGE_DATA;
        return;
      }
      fetch("assets/images/112v3.png?v=2")
        .then(function (r) { return r && r.ok ? r.blob() : Promise.reject(); })
        .then(function (blob) {
          var url = URL.createObjectURL(blob);
          var img = new Image();
          img.onload = function () {
            URL.revokeObjectURL(url);
            if (img.naturalWidth) buildBMWMesh(img);
            else buildBMWFallback();
          };
          img.onerror = function () { URL.revokeObjectURL(url); buildBMWFallback(); };
          img.src = url;
        })
        .catch(buildBMWFallback);
    }
    loadBMWAndBuild();

    /* Camera and grid stay fixed (no mouse/scroll movement) */

    function getBmwCenterX() {
      var w = window.innerWidth;
      return w < 860 ? 0.5 : (w < 1200 ? 5.45 : 2.65);
    }
    function getCameraTargetX() {
      var w = window.innerWidth;
      return w < 860 ? 0.5 : (w < 1200 ? 1.35 : 1.9);
    }
    var cachedBmwX = getBmwCenterX();
    var cachedCameraX = getCameraTargetX();

    /* ── Resize (throttled) ───────────────────────────────────── */
    var resizeTick;
    window.addEventListener("resize", function () {
      if (resizeTick) return;
      resizeTick = requestAnimationFrame(function () {
        resizeTick = 0;
        W = window.innerWidth; H = window.innerHeight;
        cachedBmwX = getBmwCenterX();
        cachedCameraX = getCameraTargetX();
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
        renderer.setSize(W, H);
      });
    });

    /* ── Render loop (pauses when hero out of view) ───────────── */
    var clock = new THREE.Clock();
    var frameCount = 0;
    var heroVisible = true;
    var heroEl = document.getElementById("hero");
    if (heroEl && typeof IntersectionObserver !== "undefined") {
      var io = new IntersectionObserver(
        function (entries) {
          heroVisible = entries[0].isIntersecting;
        },
        { root: null, rootMargin: "0px", threshold: 0.05 }
      );
      io.observe(heroEl);
    }

    function tick() {
      requestAnimationFrame(tick);
      if (!heroVisible) return;
      frameCount++;
      var t = clock.getElapsedTime();
      var pa = pGeo.attributes.position;

      // BMW + aura: use cached X (updated on resize only)
      if (cachedBmwX !== AX) {
        var deltaX = cachedBmwX - AX;
        for (var j = 0; j < N; j++) pa.array[j * 3] += deltaX;
        pa.needsUpdate = true;
        AX = cachedBmwX;
      }
      bmwGroup.position.x = AX;
      auraOuter.position.x = AX;
      auraMid.position.x = AX;
      auraCore.position.x = AX;
      haloRing.position.x = AX;

      camera.position.set(0, 0, 7);
      camera.lookAt(cachedCameraX, bmwGroup.position.y, bmwGroup.position.z);

      // Aura: gentle breath-like pulse (human aura feel)
      var pulse = 0.92 + Math.sin(t * 0.35) * 0.08;
      auraOuter.material.opacity = 0.7 * pulse;
      auraMid.material.opacity = 0.5 * pulse;
      auraCore.material.opacity = 0.62 * pulse;
      haloRing.material.opacity = 0.28 * pulse;

      // Particles: update every 3rd frame for smooth perf on all devices
      var step = (frameCount % 3) === 0 ? 3 : 0;
      if (step) {
        for (var j = 0; j < N; j++) {
          pa.array[j * 3]     += pDrift[j * 2] * step;
          pa.array[j * 3 + 1] += pSpeed[j] * step;
          pa.array[j * 3 + 2] += pDrift[j * 2 + 1] * step;
          if (pa.array[j * 3 + 1] > 2.8) pa.array[j * 3 + 1] = -2.6;
          if (pa.array[j * 3 + 1] < -2.7) pa.array[j * 3 + 1] = 2.7;
        }
        pa.needsUpdate = true;
      }

      renderer.render(scene, camera);
    }

    if (!reduceMotion) {
      tick();
    } else {
      renderer.render(scene, camera);
    }
  })();

  /* ═══════════════════════════════════════════════════════
     NAV
  ═══════════════════════════════════════════════════════ */
  var nav = document.getElementById("nav");
  var scrollScheduled = false;
  window.addEventListener("scroll", function () {
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(function () {
      scrollScheduled = false;
      nav.classList.toggle("scrolled", window.scrollY > 40);
    });
  }, { passive: true });

  var burger = document.getElementById("burger");
  var navMobilePanel = document.getElementById("navMobilePanel");
  var navOverlay = document.getElementById("navOverlay");
  function closeMobileMenu() {
    burger.classList.remove("open");
    if (navMobilePanel) navMobilePanel.classList.remove("open");
    if (navOverlay) navOverlay.classList.remove("open");
    document.body.classList.remove("nav-open");
  }
  function openMobileMenu() {
    burger.classList.add("open");
    if (navMobilePanel) navMobilePanel.classList.add("open");
    if (navOverlay) navOverlay.classList.add("open");
    document.body.classList.add("nav-open");
  }
  burger.addEventListener("click", function () {
    if (burger.classList.contains("open")) closeMobileMenu();
    else openMobileMenu();
  });
  if (navOverlay) navOverlay.addEventListener("click", closeMobileMenu);
  navMobilePanel && navMobilePanel.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", closeMobileMenu);
  });

  /* ═══════════════════════════════════════════════════════
     GSAP REVEALS
  ═══════════════════════════════════════════════════════ */
  gsap.utils.toArray("[data-reveal]").forEach(function (el) {
    if (el.closest(".hero")) return;
    gsap.from(el, {
      y: 28, opacity: 0, duration: 0.85, ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none none" }
    });
  });

  gsap.from(".hero-content", { y: 24, opacity: 0, duration: 0.9, ease: "power3.out", delay: 0.2 });

  /* ═══════════════════════════════════════════════════════
     KPI COUNTERS
  ═══════════════════════════════════════════════════════ */
  gsap.utils.toArray("[data-count]").forEach(function (el) {
    var target = parseInt(el.getAttribute("data-count"), 10);
    var o = { val: 0 };
    ScrollTrigger.create({
      trigger: el, start: "top 85%", once: true,
      onEnter: function () {
        gsap.to(o, {
          val: target, duration: 1.4, ease: "power2.out",
          onUpdate: function () { el.textContent = Math.round(o.val).toLocaleString("ru-RU"); }
        });
      }
    });
  });

  /* ═══════════════════════════════════════════════════════
     TILT
  ═══════════════════════════════════════════════════════ */
  if (!isMobile) {
    document.querySelectorAll("[data-tilt]").forEach(function (card) {
      var tiltRaf = 0;
      card.addEventListener("mousemove", function (e) {
        if (tiltRaf) return;
        tiltRaf = requestAnimationFrame(function () {
          tiltRaf = 0;
          var r = card.getBoundingClientRect();
          var x = (e.clientX - r.left) / r.width - 0.5;
          var y = (e.clientY - r.top) / r.height - 0.5;
          card.style.transform =
            "perspective(700px) rotateY("+(x*7)+"deg) rotateX("+(-y*7)+"deg) translateY(-6px)";
        });
      });
      card.addEventListener("mouseleave", function () { card.style.transform = ""; });
    });
  }

  /* ═══════════════════════════════════════════════════════
     CHARTS
  ═══════════════════════════════════════════════════════ */
  ScrollTrigger.create({
    trigger: ".line-chart", start: "top 80%", once: true,
    onEnter: function () {
      gsap.to(".chart-line",       { strokeDashoffset: 0, duration: 2, ease: "power2.out" });
      gsap.to(".chart-area",       { opacity: 1, duration: 1.2, delay: 0.8 });
      gsap.to(".chart-dots circle",{ opacity: 1, duration: 0.4, stagger: 0.12, delay: 0.6 });
    }
  });

  gsap.utils.toArray(".bar").forEach(function (bar) {
    var w = bar.getAttribute("data-w") + "%";
    ScrollTrigger.create({
      trigger: bar, start: "top 88%", once: true,
      onEnter: function () { gsap.to(bar, { width: w, duration: 1.2, ease: "power2.out" }); }
    });
  });

})();
