// ============================================================================
// 3D part preview — lazy-loaded Three.js STL viewer in a modal.
// Cards render a .preview-btn with data-stl (+ data-thumb for the loader art);
// first click pulls Three.js from CDN, then every preview reuses the renderer.
// While the STL downloads, the part's thumbnail fills bottom-to-top from
// grayscale to color alongside a 0-100% progress bar. Orbit controls stay
// locked until the model is fully loaded.
// ============================================================================
(function () {
  const THREE_VER = "0.147.0"; // last release with non-module examples/js builds
  const SCRIPTS = [
    `https://unpkg.com/three@${THREE_VER}/build/three.min.js`,
    `https://unpkg.com/three@${THREE_VER}/examples/js/loaders/STLLoader.js`,
    `https://unpkg.com/three@${THREE_VER}/examples/js/controls/OrbitControls.js`,
  ];

  let threeReady = null;
  function ensureThree() {
    if (threeReady) return threeReady;
    threeReady = SCRIPTS.reduce(
      (p, src) => p.then(() => new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = res;
        s.onerror = () => rej(new Error("Failed to load " + src));
        document.head.appendChild(s);
      })),
      Promise.resolve()
    );
    return threeReady;
  }

  let el = null, renderer = null, scene, camera, controls, mesh, rafId = 0;
  let openSeq = 0; // guards against a stale load finishing after close/reopen

  function buildModal() {
    el = document.createElement("div");
    el.className = "viewer-backdrop";
    el.hidden = true;
    el.innerHTML = `
      <div class="viewer-box">
        <div class="viewer-head">
          <div><div class="mono viewer-id" id="vwId"></div><h3 id="vwTitle"></h3></div>
          <button class="viewer-close" id="vwClose" aria-label="Close preview">✕ CLOSE</button>
        </div>
        <div class="viewer-stage" id="vwStage">
          <div class="viewer-load" id="vwLoad" hidden>
            <div class="vw-thumbwrap" id="vwThumbWrap" hidden>
              <img class="vw-img vw-gray" id="vwImgGray" src="" alt="">
              <img class="vw-img vw-color" id="vwImgColor" src="" alt="">
            </div>
            <div class="vw-bar"><div class="vw-fill" id="vwFill"></div></div>
            <div class="vw-pct mono" id="vwPct">0%</div>
          </div>
          <div class="viewer-msg" id="vwMsg" hidden></div>
        </div>
        <div class="viewer-foot mono">DRAG TO ROTATE · SCROLL TO ZOOM · RIGHT-DRAG TO PAN · ESC TO CLOSE</div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => { if (e.target === el) close(); });
    el.querySelector("#vwClose").addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.hidden) close(); });
  }

  function close() {
    if (!el) return;
    openSeq++;
    el.hidden = true;
    document.body.style.overflow = "";
    cancelAnimationFrame(rafId);
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh = null;
    }
  }

  function setProgress(pct) {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    el.querySelector("#vwFill").style.width = p + "%";
    el.querySelector("#vwPct").textContent = p + "%";
    // Color image is revealed from the bottom up as the part downloads.
    el.querySelector("#vwImgColor").style.clipPath = `inset(${100 - p}% 0 0 0)`;
  }

  function initScene(stage) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f2ec);
    camera = new THREE.PerspectiveCamera(45, stage.clientWidth / stage.clientHeight, 0.1, 5000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(stage.clientWidth, stage.clientHeight);
    stage.insertBefore(renderer.domElement, stage.firstChild);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(1, 1.2, 1.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-1.5, -0.6, -1);
    scene.add(fill);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enabled = false; // unlocked once the model is fully loaded

    window.addEventListener("resize", () => {
      if (el.hidden || !renderer) return;
      camera.aspect = stage.clientWidth / stage.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(stage.clientWidth, stage.clientHeight);
    });
  }

  function animate() {
    rafId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  async function open(url, title, id, thumb) {
    if (!el) buildModal();
    const seq = ++openSeq;
    el.hidden = false;
    document.body.style.overflow = "hidden";
    el.querySelector("#vwTitle").textContent = title || "3D Preview";
    el.querySelector("#vwId").textContent = id || "";

    const stage = el.querySelector("#vwStage");
    const load = el.querySelector("#vwLoad");
    const msg = el.querySelector("#vwMsg");
    const thumbWrap = el.querySelector("#vwThumbWrap");
    msg.hidden = true;
    load.hidden = false;
    if (thumb) {
      el.querySelector("#vwImgGray").src = thumb;
      el.querySelector("#vwImgColor").src = thumb;
      thumbWrap.hidden = false;
    } else {
      thumbWrap.hidden = true;
    }
    setProgress(0);
    if (controls) controls.enabled = false;
    if (renderer) renderer.domElement.style.visibility = "hidden";

    try {
      await ensureThree();
      if (seq !== openSeq) return; // closed while Three.js was loading
      if (!renderer) initScene(stage);
      renderer.domElement.style.visibility = "hidden";

      const loader = new THREE.STLLoader();
      let crawl = 0; // fallback when the server doesn't report a total size
      const geometry = await new Promise((res, rej) =>
        loader.load(url, res, (e) => {
          if (seq !== openSeq) return;
          if (e.lengthComputable && e.total > 0) {
            setProgress((e.loaded / e.total) * 100);
          } else {
            crawl = Math.min(crawl + 4, 92);
            setProgress(crawl);
          }
        }, () => rej(new Error("download failed"))));
      if (seq !== openSeq) { geometry.dispose(); return; }

      setProgress(100);

      geometry.computeBoundingBox();
      geometry.center();
      const size = geometry.boundingBox.getSize(new THREE.Vector3()).length();

      mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: 0x9e2020, metalness: 0.15, roughness: 0.55,
      }));
      // STL files are Z-up; Three.js is Y-up.
      mesh.rotation.x = -Math.PI / 2;
      scene.add(mesh);

      camera.position.set(size * 0.7, size * 0.5, size * 0.9);
      camera.near = size / 100;
      camera.far = size * 10;
      camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0);
      controls.update();

      // Brief beat at 100% so the finished loader registers, then reveal.
      setTimeout(() => {
        if (seq !== openSeq) return;
        load.hidden = true;
        renderer.domElement.style.visibility = "visible";
        controls.enabled = true;
      }, 250);
      cancelAnimationFrame(rafId);
      animate();
    } catch (err) {
      console.error("3D preview failed:", err);
      if (seq !== openSeq) return;
      load.hidden = true;
      msg.hidden = false;
      msg.textContent = "COULD NOT LOAD THE 3D MODEL — TRY THE DOWNLOAD BUTTONS INSTEAD.";
    }
  }

  // Card buttons are re-rendered constantly; delegate from the document.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".preview-btn");
    if (!btn || btn.classList.contains("preview-link")) return; // .preview-link opens Autodesk's viewer
    e.preventDefault();
    open(btn.dataset.stl, btn.dataset.title, btn.dataset.id, btn.dataset.thumb);
  });

  window.Viewer = { open };
  // test/debug probe (harmless in production)
  window.Viewer._state = () => ({
    controlsEnabled: controls ? controls.enabled : null,
    camera: camera ? camera.position.toArray().map((n) => +n.toFixed(2)) : null,
  });
})();
