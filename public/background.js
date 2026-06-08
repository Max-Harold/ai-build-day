(() => {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');

  let W, H;
  // Raw mouse position
  let mouse = { x: 0, y: 0 };
  // Smoothed mouse offset fed into noise — lerps toward mouse, decays to 0 at rest
  let smoothMouse = { x: 0, y: 0 };
  // Time is frozen — clouds only shift via mouse, not a running clock
  const time = 0;

  // --- Simplex noise (2D) ---
  // Based on Stefan Gustavson's public domain implementation
  const grad3 = [
    [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
    [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
    [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
  ];
  const p = [];
  for (let i = 0; i < 256; i++) p[i] = Math.floor(Math.random() * 256);
  const perm = new Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  function dot(g, x, y) { return g[0] * x + g[1] * y; }

  function snoise(xin, yin) {
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t, Y0 = j - t;
    const x0 = xin - X0, y0 = yin - Y0;
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    const gi0 = perm[ii + perm[jj]] % 12;
    const gi1 = perm[ii + i1 + perm[jj + j1]] % 12;
    const gi2 = perm[ii + 1 + perm[jj + 1]] % 12;
    let t0 = 0.5 - x0*x0 - y0*y0;
    const n0 = t0 < 0 ? 0 : (t0 *= t0, t0 * t0 * dot(grad3[gi0], x0, y0));
    let t1 = 0.5 - x1*x1 - y1*y1;
    const n1 = t1 < 0 ? 0 : (t1 *= t1, t1 * t1 * dot(grad3[gi1], x1, y1));
    let t2 = 0.5 - x2*x2 - y2*y2;
    const n2 = t2 < 0 ? 0 : (t2 *= t2, t2 * t2 * dot(grad3[gi2], x2, y2));
    return 70 * (n0 + n1 + n2); // [-1, 1]
  }

  // --- Cloud layer config ---
  const LAYERS = [
    { scale: 0.0010, speed: 0, opacity: 0.50, mouseStrength: 0.00008 },  // large slow blobs
    { scale: 0.0020, speed: 0, opacity: 0.40, mouseStrength: 0.00014 },  // medium blobs
    { scale: 0.0040, speed: 0, opacity: 0.25, mouseStrength: 0.00020 },  // small detail
  ];

  // Resolution at which we sample noise (upscaled for performance)
  const STEP = 4;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    // Start smoothMouse at centre so there's no initial jolt
    smoothMouse.x = W / 2;
    smoothMouse.y = H / 2;
  }

  function drawLayer(layer, t) {
    const cols = Math.ceil(W / STEP) + 1;
    const rows = Math.ceil(H / STEP) + 1;

    // Mouse offset shifts noise sample coordinates (uses smoothed position)
    const mx = (smoothMouse.x / W - 0.5) * W * layer.mouseStrength * 800;
    const my = (smoothMouse.y / H - 0.5) * H * layer.mouseStrength * 800;

    const offscreen = document.createElement('canvas');
    offscreen.width = cols;
    offscreen.height = rows;
    const oc = offscreen.getContext('2d');
    const img = oc.createImageData(cols, rows);
    const data = img.data;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const nx = (col * STEP + mx) * layer.scale + t * layer.speed * 1000;
        const ny = (row * STEP + my) * layer.scale + t * layer.speed * 500;

        // Stack two octaves
        let v = snoise(nx, ny) * 0.65 + snoise(nx * 2.1, ny * 2.1) * 0.35;
        v = (v + 1) / 2; // [0,1]

        // Lower threshold = more cloud coverage across the screen
        // Power > 1 still keeps edges sharp and contrast high
        v = Math.pow(Math.max(0, v - 0.28) / 0.72, 1.6);

        const idx = (row * cols + col) * 4;
        if (window.lightMode) {
          // Light mode: bright white clouds with stronger contrast against the blue sky
          data[idx]     = Math.round(200 + v * 55);
          data[idx + 1] = Math.round(215 + v * 40);
          data[idx + 2] = Math.round(240 + v * 15);
          data[idx + 3] = Math.round(v * 255 * layer.opacity * 3.2);
        } else {
          // Dark mode: deep blue clouds on black
          data[idx]     = Math.round(20 + v * 40);
          data[idx + 1] = Math.round(50 + v * 80);
          data[idx + 2] = Math.round(160 + v * 95);
          data[idx + 3] = Math.round(v * 255 * layer.opacity);
        }
      }
    }

    oc.putImageData(img, 0, 0);

    // Scale the small canvas up to fill the screen
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(offscreen, 0, 0, W, H);
    ctx.restore();
  }

  function drawBackground() {
    if (window.lightMode) {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#c8dff5');
      grad.addColorStop(1, '#e8f4fd');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = '#000000';
    }
    ctx.fillRect(0, 0, W, H);
  }

  // How quickly smoothMouse chases the real mouse (0 = instant, 1 = never)
  // 0.94 = very lazy — takes ~30 frames to settle, giving a gentle cloud shift
  const LERP = 0.94;
  // How quickly smoothMouse decays back to centre when the mouse is still
  // 0.97 = slow drift back over ~1–2 seconds
  const DECAY = 0.97;
  let mouseActive = false;
  let mouseIdleTimer = null;

  function loop() {
    // When mouse is moving, lerp toward it; otherwise decay gently back to 0
    if (mouseActive) {
      smoothMouse.x += (mouse.x - smoothMouse.x) * (1 - LERP);
      smoothMouse.y += (mouse.y - smoothMouse.y) * (1 - LERP);
    } else {
      // Decay toward the screen centre so clouds settle symmetrically
      const cx = W / 2, cy = H / 2;
      smoothMouse.x += (cx - smoothMouse.x) * (1 - DECAY);
      smoothMouse.y += (cy - smoothMouse.y) * (1 - DECAY);
    }

    ctx.clearRect(0, 0, W, H);
    drawBackground();
    // time is always 0 — clouds don't auto-scroll, only mouse shifts them
    for (const layer of LAYERS) drawLayer(layer, time);
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouseActive = true;
    // Mark mouse as idle after 800ms of no movement
    clearTimeout(mouseIdleTimer);
    mouseIdleTimer = setTimeout(() => { mouseActive = false; }, 800);
  });

  resize();
  requestAnimationFrame(loop);
})();
