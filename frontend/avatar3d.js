import * as THREE from "/frontend/vendor/three.module.min.js";

const avatar = document.querySelector("#avatar");
const canvas = document.querySelector("#avatarCanvas");

if (avatar && canvas) {
  try {
    initAvatar3d();
  } catch (error) {
    console.warn("3D avatar fallback enabled", error);
    avatar.classList.remove("avatar-3d-ready");
  }
}

function initAvatar3d() {
  const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdcebe6, 6, 15);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 1.55, 8.3);
  camera.lookAt(0, 1.35, 0);

  const group = new THREE.Group();
  group.position.y = -0.15;
  scene.add(group);

  const refs = buildGuide(group);
  buildScenicStage(group, refs);
  setupLights(scene);
  updateProfileColors(refs);
  avatar.classList.add("avatar-3d-ready");

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(avatar);
  resize();

  const mutationObserver = new MutationObserver(() => {
    updateProfileColors(refs);
    refs.mood.smile = avatar.classList.contains("smile") ? 1 : 0;
    refs.mood.focused = avatar.classList.contains("focused") ? 1 : 0;
    refs.mood.thinking = avatar.classList.contains("thinking") ? 1 : 0;
  });
  mutationObserver.observe(avatar, {attributes: true, attributeFilter: ["class"]});

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const time = clock.getElapsedTime();
    const speaking = avatar.classList.contains("speaking");
    const listening = avatar.classList.contains("listening");

    group.rotation.y = Math.sin(time * 0.55) * 0.13 + (listening ? Math.sin(time * 2.2) * 0.04 : 0);
    refs.body.position.y = Math.sin(time * 1.1) * 0.035;
    refs.head.rotation.x = Math.sin(time * 1.6) * 0.035 + (speaking ? Math.sin(time * 8) * 0.05 : 0);
    refs.head.rotation.z = Math.sin(time * 0.75) * 0.025;
    refs.leftArm.rotation.z = 0.33 + Math.sin(time * 1.35) * 0.045;
    refs.rightArm.rotation.z = -0.33 - Math.sin(time * 1.35) * 0.045;
    refs.mouth.scale.set(1, speaking ? 0.55 + Math.abs(Math.sin(time * 12)) * 1.4 : 0.36 + refs.mood.smile * 0.35, 1);
    refs.mouth.position.y = speaking ? 1.28 : 1.3 + refs.mood.smile * 0.02;
    refs.aura.rotation.z = time * 0.12;
    refs.innerAura.rotation.z = -time * 0.16;
    refs.clouds.rotation.y = time * 0.08;
    refs.lotus.rotation.y = Math.sin(time * 0.5) * 0.05;
    refs.staff.rotation.z = -0.13 + Math.sin(time * 1.1) * 0.02;
    renderer.render(scene, camera);
  });

  function resize() {
    const rect = avatar.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
}

function buildGuide(root) {
  const refs = {mood: {smile: 0, focused: 0, thinking: 0}};
  const body = new THREE.Group();
  body.position.set(0, 0.25, 0);
  root.add(body);
  refs.body = body;

  const robeMaterial = new THREE.MeshStandardMaterial({color: 0x126a54, roughness: 0.58, metalness: 0.04});
  const trimMaterial = new THREE.MeshStandardMaterial({color: 0xd7ad58, roughness: 0.35, metalness: 0.2});
  const skinMaterial = new THREE.MeshStandardMaterial({color: 0xf1bd9e, roughness: 0.48});
  const hairMaterial = new THREE.MeshStandardMaterial({color: 0x1d2824, roughness: 0.62});
  refs.robeMaterial = robeMaterial;
  refs.trimMaterial = trimMaterial;

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.72, 0.55, 8, 20), robeMaterial);
  torso.position.set(0, 0.53, 0);
  torso.scale.set(1.05, 0.88, 0.58);
  torso.castShadow = true;
  body.add(torso);

  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.035, 10, 80, Math.PI * 1.55), trimMaterial);
  sash.position.set(0.04, 0.66, 0.43);
  sash.rotation.set(0.35, 0.1, -0.28);
  body.add(sash);

  const collar = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.32, 4), trimMaterial);
  collar.position.set(0, 1.03, 0.19);
  collar.rotation.set(0.75, 0, Math.PI / 4);
  collar.scale.set(1.05, 0.42, 0.55);
  body.add(collar);

  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.62, 8, 16), robeMaterial);
  leftArm.position.set(-0.62, 0.52, 0.04);
  leftArm.rotation.z = 0.33;
  leftArm.castShadow = true;
  body.add(leftArm);
  refs.leftArm = leftArm;

  const rightArm = leftArm.clone();
  rightArm.position.x = 0.62;
  rightArm.rotation.z = -0.33;
  body.add(rightArm);
  refs.rightArm = rightArm;

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.3, 24), skinMaterial);
  neck.position.set(0, 1.15, 0);
  body.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 1.72, 0.02);
  body.add(head);
  refs.head = head;

  const face = new THREE.Mesh(new THREE.SphereGeometry(0.52, 48, 32), skinMaterial);
  face.scale.set(0.86, 1.02, 0.76);
  face.castShadow = true;
  head.add(face);

  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.54, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMaterial);
  hairCap.position.set(0, 0.18, -0.02);
  hairCap.scale.set(0.94, 0.72, 0.8);
  hairCap.rotation.x = -0.08;
  head.add(hairCap);

  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), hairMaterial);
  bun.position.set(0, 0.57, -0.07);
  bun.scale.set(1, 0.78, 0.9);
  head.add(bun);

  const hairPin = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.78, 6, 14), trimMaterial);
  hairPin.position.set(0, 0.55, 0.08);
  hairPin.rotation.set(1.15, 0.1, Math.PI / 2.1);
  head.add(hairPin);

  const eyeMaterial = new THREE.MeshStandardMaterial({color: 0x14211d, roughness: 0.35});
  const eyeGeometry = new THREE.SphereGeometry(0.045, 16, 10);
  const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  leftEye.position.set(-0.18, 0.05, 0.42);
  leftEye.scale.set(1, 0.68, 0.35);
  head.add(leftEye);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.18;
  head.add(rightEye);

  const browMaterial = new THREE.MeshStandardMaterial({color: 0x594034, roughness: 0.5});
  addBrow(head, browMaterial, -0.19, 0.17, 0.43, -0.12);
  addBrow(head, browMaterial, 0.19, 0.17, 0.43, 0.12);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.13, 16), skinMaterial);
  nose.position.set(0, -0.06, 0.48);
  nose.rotation.x = Math.PI / 2;
  head.add(nose);

  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.08, 20, 10), new THREE.MeshStandardMaterial({color: 0x9a4b51, roughness: 0.45}));
  mouth.position.set(0, -0.22, 0.46);
  mouth.scale.set(1, 0.35, 0.28);
  head.add(mouth);
  refs.mouth = mouth;

  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.025, 32), trimMaterial);
  badge.position.set(0.3, 0.84, 0.42);
  badge.rotation.x = Math.PI / 2;
  body.add(badge);

  const staff = new THREE.Group();
  staff.position.set(0.75, 0.58, 0.04);
  staff.rotation.z = -0.13;
  body.add(staff);
  refs.staff = staff;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.45, 12), trimMaterial);
  pole.position.y = 0.24;
  staff.add(pole);
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), new THREE.MeshStandardMaterial({color: 0xf3d999, emissive: 0x805a22, emissiveIntensity: 0.12, roughness: 0.4}));
  lantern.position.y = 1.02;
  lantern.scale.set(0.9, 1.2, 0.9);
  staff.add(lantern);

  return refs;
}

function buildScenicStage(root, refs) {
  const auraMaterial = new THREE.MeshStandardMaterial({color: 0xd7ad58, roughness: 0.38, metalness: 0.22, transparent: true, opacity: 0.72});
  const aura = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.018, 10, 120), auraMaterial);
  aura.position.set(0, 1.63, -0.55);
  aura.rotation.x = Math.PI / 2.22;
  root.add(aura);
  refs.aura = aura;

  const innerAura = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.011, 8, 120), new THREE.MeshStandardMaterial({color: 0x4f907e, roughness: 0.6, transparent: true, opacity: 0.5}));
  innerAura.position.copy(aura.position);
  innerAura.rotation.copy(aura.rotation);
  root.add(innerAura);
  refs.innerAura = innerAura;

  const mountainMaterial = new THREE.MeshStandardMaterial({color: 0x78958a, roughness: 0.8, transparent: true, opacity: 0.5});
  [-0.95, -0.35, 0.42, 0.9].forEach((x, index) => {
    const peak = new THREE.Mesh(new THREE.ConeGeometry(0.32 + index * 0.02, 0.72 + index * 0.06, 4), mountainMaterial);
    peak.position.set(x, 0.62, -1.05);
    peak.rotation.y = Math.PI / 4;
    peak.scale.z = 0.38;
    root.add(peak);
  });

  const lotus = new THREE.Group();
  lotus.position.set(0, 0.03, 0);
  root.add(lotus);
  refs.lotus = lotus;
  const petalMaterial = new THREE.MeshStandardMaterial({color: 0xf6efe0, roughness: 0.5, metalness: 0.02});
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 12), petalMaterial);
    petal.position.set(Math.cos(angle) * 0.58, -0.02, Math.sin(angle) * 0.24);
    petal.scale.set(1.25, 0.18, 0.42);
    petal.rotation.set(0.22, -angle, angle);
    lotus.add(petal);
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 1.02, 0.18, 64), new THREE.MeshStandardMaterial({color: 0xc99b4a, roughness: 0.46, metalness: 0.16}));
  base.position.y = -0.11;
  base.receiveShadow = true;
  lotus.add(base);

  const clouds = new THREE.Group();
  clouds.position.set(0, 0.05, -0.45);
  root.add(clouds);
  refs.clouds = clouds;
  const cloudMaterial = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.7, transparent: true, opacity: 0.66});
  [[-1.1, 0.55, 0.15], [1.05, 0.78, 0.1], [-0.35, 2.42, -0.28]].forEach(([x, y, z], index) => {
    const cloud = new THREE.Group();
    cloud.position.set(x, y, z);
    cloud.scale.setScalar(index === 2 ? 0.56 : 0.72);
    for (let i = 0; i < 4; i += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.16 + i * 0.02, 16, 10), cloudMaterial);
      puff.position.x = (i - 1.5) * 0.14;
      puff.position.y = Math.sin(i) * 0.035;
      puff.scale.y = 0.55;
      cloud.add(puff);
    }
    clouds.add(cloud);
  });

}

function setupLights(scene) {
  scene.add(new THREE.HemisphereLight(0xf8fffb, 0x6d7f78, 2.1));

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(2.3, 4.4, 3.2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);

  const warmLight = new THREE.PointLight(0xf3c46f, 2.2, 6);
  warmLight.position.set(-1.4, 1.5, 2.2);
  scene.add(warmLight);
}

function addBrow(parent, material, x, y, z, rotateZ) {
  const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.16, 4, 8), material);
  brow.position.set(x, y, z);
  brow.rotation.set(Math.PI / 2, 0, rotateZ + Math.PI / 2);
  parent.add(brow);
}

function updateProfileColors(refs) {
  const className = avatar.className;
  const palettes = {
    "profile-zen": [0x8d6670, 0xcaa65d],
    "profile-scholar": [0x314d68, 0x87a1bb],
    "profile-family": [0x2a8c7b, 0xd8913a],
    "profile-steward": [0x3f6370, 0xdceff0],
    "profile-lingshan": [0x126a54, 0xd7ad58]
  };
  const [robe, trim] = Object.entries(palettes).find(([name]) => className.includes(name))?.[1] || palettes["profile-lingshan"];
  refs.robeMaterial.color.setHex(robe);
  refs.trimMaterial.color.setHex(trim);
}
