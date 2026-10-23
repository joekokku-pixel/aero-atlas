import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

const canvas = document.querySelector("#earth-canvas");
const surface = canvas?.closest(".globe-surface");
const button = canvas?.closest("#orbit-toggle");

if (canvas && surface && button && "WebGLRenderingContext" in window) {
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 30);
    camera.position.set(0, 0, 3.15);

    const globe = new THREE.Group();
    scene.add(globe);

    const earthGeometry = new THREE.SphereGeometry(0.96, 128, 96);
    const earthMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0,
      emissive: new THREE.Color(0x243b4f),
      emissiveIntensity: 0.2
    });
    earthMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float oceanSignal = diffuseColor.b - max(diffuseColor.r, diffuseColor.g) * 0.7;
        float oceanMask = smoothstep(0.018, 0.12, oceanSignal);
        vec3 vividOcean = mix(diffuseColor.rgb, vec3(0.055, 0.23, 0.49), 0.66);
        diffuseColor.rgb = mix(diffuseColor.rgb, vividOcean, oceanMask);`
      );
    };
    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    earth.rotation.y = -0.28;
    globe.add(earth);

    scene.add(new THREE.HemisphereLight(0xe5f6ff, 0x687b90, 2.5));
    scene.add(new THREE.AmbientLight(0xffffff, 1.75));
    const sun = new THREE.DirectionalLight(0xfff6e8, 2.1);
    sun.position.set(-0.6, 1.8, 6.2);
    scene.add(sun);
    const rimLight = new THREE.DirectionalLight(0x57a9ff, 0.65);
    rimLight.position.set(2.5, -1.4, -3.5);
    scene.add(rimLight);

    const atmosphereMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vNormal; varying vec3 vView; void main(){ vec4 mvPosition=modelViewMatrix*vec4(position,1.0); vNormal=normalize(normalMatrix*normal); vView=normalize(-mvPosition.xyz); gl_Position=projectionMatrix*mvPosition; }`,
      fragmentShader: `varying vec3 vNormal; varying vec3 vView; void main(){ float rim=pow(1.0-max(dot(normalize(vNormal),normalize(vView)),0.0),2.1); gl_FragColor=vec4(0.22,0.58,0.95,rim*0.58); }`
    });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(0.99, 96, 64), atmosphereMaterial);
    globe.add(atmosphere);

    const textureUrl = "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/january/world.200401.3x5400x2700.jpg";
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(textureUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      earthMaterial.map = texture;
      earthMaterial.emissiveMap = texture;
      earthMaterial.emissive.set(0xffffff);
      earthMaterial.emissiveIntensity = 1.12;
      earthMaterial.needsUpdate = true;
      surface.classList.add("has-globe3d");
    }, undefined, () => {
      surface.classList.add("texture-failed");
    });

    const resize = () => {
      const rect = surface.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(surface);
    resize();

    let dragging = false;
    let moved = false;
    let previousX = 0;
    let previousY = 0;
    let velocityX = 0;
    let velocityY = 0;

    canvas.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      dragging = true;
      moved = false;
      previousX = event.clientX;
      previousY = event.clientY;
      velocityX = 0;
      velocityY = 0;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("is-dragging");
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      event.preventDefault();
      const dx = event.clientX - previousX;
      const dy = event.clientY - previousY;
      if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
      velocityY = dx * 0.0048;
      velocityX = dy * 0.0048;
      globe.rotation.y += velocityY;
      globe.rotation.x = THREE.MathUtils.clamp(globe.rotation.x + velocityX, -1.42, 1.42);
      previousX = event.clientX;
      previousY = event.clientY;
    });

    const endDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      canvas.classList.remove("is-dragging");
      if (moved) {
        button.dataset.skipClick = "true";
        window.setTimeout(() => delete button.dataset.skipClick, 700);
      }
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      camera.position.z = THREE.MathUtils.clamp(camera.position.z + Math.sign(event.deltaY) * 0.18, 2.55, 4.4);
    }, { passive: false });

    let previousFrame = performance.now();
    const animate = (now) => {
      const dt = Math.min((now - previousFrame) / 1000, 0.05);
      previousFrame = now;
      if (!dragging) {
        globe.rotation.y += velocityY + dt * 0.035;
        globe.rotation.x = THREE.MathUtils.clamp(globe.rotation.x + velocityX, -1.42, 1.42);
        velocityX *= Math.pow(0.08, dt);
        velocityY *= Math.pow(0.08, dt);
      }
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  } catch (error) {
    console.warn("3D globe could not start; showing the map illustration instead.", error);
  }
}
