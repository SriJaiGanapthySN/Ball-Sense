import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BOOK_FLIP_MS, bookSpread } from "../lib/bookCricket.js";

const PAGE_WIDTH = 2.24;
const PAGE_HEIGHT = 3.12;
const clamp = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => value * value * (3 - 2 * value);

function canvasSurface(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext("2d")];
}

function coverCanvas(book) {
  const [canvas, context] = canvasSurface(600, 840);
  context.fillStyle = book.cover;
  context.fillRect(0, 0, 600, 840);
  context.strokeStyle = "rgba(255,255,255,.065)";
  context.lineWidth = 1;
  for (let line = 0; line < 840; line += 4) {
    context.beginPath();
    context.moveTo(0, line);
    context.lineTo(600, line);
    context.stroke();
  }
  for (let line = 0; line < 600; line += 5) {
    context.beginPath();
    context.moveTo(line, 0);
    context.lineTo(line, 840);
    context.stroke();
  }
  context.fillStyle = "rgba(0,0,0,.18)";
  context.fillRect(0, 0, 25, 840);
  context.textAlign = "center";
  context.fillStyle = book.ink;
  context.strokeStyle = book.ink;
  if (book.binding === "cloth") {
    context.lineWidth = 2;
    context.strokeRect(49, 37, 514, 764);
    context.strokeRect(58, 46, 496, 746);
    context.font = "18px Georgia";
    context.fillText("B A L L S E N S E   E D I T I O N S", 307, 101);
    context.font = "38px Georgia";
    context.fillText("THE", 307, 207);
    context.font = "bold 65px Georgia";
    context.fillText("PAVILION", 307, 285);
    context.beginPath();
    context.arc(307, 453, 104, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.arc(307, 453, 96, 0, Math.PI * 2);
    context.stroke();
    context.lineWidth = 6;
    for (const position of [282, 307, 332]) {
      context.beginPath();
      context.moveTo(position, 499);
      context.lineTo(position, 409);
      context.stroke();
    }
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(276, 404);
    context.lineTo(338, 404);
    context.moveTo(264, 507);
    context.lineTo(350, 507);
    context.stroke();
    context.font = "20px Georgia";
    context.fillText("A CRICKETING COMPANION", 307, 639);
    context.font = "italic 23px Georgia";
    context.fillText("The long afternoon", 307, 681);
  } else if (book.binding === "paperback") {
    context.font = "18px monospace";
    context.fillText("FIELD NOTES / VOLUME 02", 307, 85);
    context.font = "bold 53px Georgia";
    context.fillText("BOUNDARY", 307, 180);
    context.font = "bold 94px Georgia";
    context.fillText("ATLAS", 307, 276);
    context.fillStyle = "#253f38";
    context.beginPath();
    context.ellipse(307, 476, 232, 164, -.18, 0, Math.PI * 2);
    context.fill();
    for (const radius of [1, .8, .61]) {
      context.lineWidth = radius === 1 ? 3 : 1;
      context.beginPath();
      context.ellipse(307, 476, 222 * radius, 154 * radius, -.18, 0, Math.PI * 2);
      context.stroke();
    }
    context.fillStyle = "#e7c58c";
    context.fillRect(287, 426, 40, 100);
    for (let point = 0; point < 9; point++) {
      const angle = point * Math.PI * 2 / 9;
      context.beginPath();
      context.arc(307 + Math.cos(angle) * 170, 476 + Math.sin(angle) * 109, 5, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = book.ink;
    context.fillRect(25, 685, 575, 155);
    context.fillStyle = book.cover;
    context.font = "17px monospace";
    context.fillText("THE WORLD BETWEEN WICKETS", 307, 741);
  } else {
    context.fillStyle = "#1b343f";
    context.fillRect(0, 0, 55, 840);
    context.fillStyle = book.ink;
    context.font = "18px monospace";
    context.fillText("BALLSENSE / NO. 03", 320, 97);
    context.font = "bold 54px Georgia";
    context.fillText("MATCHDAY", 320, 229);
    context.font = "bold 86px Georgia";
    context.fillText("NOTES", 320, 320);
    context.fillRect(97, 391, 447, 208);
    context.textAlign = "left";
    context.fillStyle = book.cover;
    context.font = "18px monospace";
    context.fillText("THE SCOREKEEPER'S EDITION", 121, 432);
    context.font = "16px monospace";
    context.fillText("SEASON", 121, 483);
    context.fillText("CLUB", 121, 550);
    context.strokeStyle = "#819baf";
    context.beginPath();
    context.moveTo(208, 487);
    context.lineTo(513, 487);
    context.moveTo(186, 554);
    context.lineTo(513, 554);
    context.stroke();
    context.textAlign = "center";
    context.fillStyle = book.ink;
    context.font = "18px monospace";
    context.fillText("RUNS / WICKETS / OVERS", 320, 702);
    for (let hole = 0; hole < 12; hole++) {
      context.fillStyle = "#101f25";
      context.beginPath();
      context.arc(37, 52 + hole * 66, 7, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.font = "17px monospace";
  context.fillText(`${book.pages} PAGES  /  BALLSENSE`, book.binding === "wire" ? 320 : 307, 773);
  return canvas;
}

function wrapParagraph(context, text, left, top, width) {
  let line = "";
  let baseline = top;
  for (const word of text.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > width) {
      context.fillText(line, left, baseline);
      baseline += 32;
      line = word;
    } else line = candidate;
  }
  context.fillText(line, left, baseline);
  return baseline + 53;
}

function pageCanvas(book, page, selected = false) {
  const [canvas, context] = canvasSurface(768, 1024);
  context.fillStyle = book.paper;
  context.fillRect(0, 0, 768, 1024);
  for (let grain = 0; grain < 3400; grain++) {
    context.fillStyle = grain % 2 ? "rgba(80,63,41,.025)" : "rgba(255,255,255,.3)";
    context.fillRect((grain * 137) % 768, (grain * 271) % 1024, 2, 2);
  }
  context.fillStyle = book.accent;
  context.font = "17px Georgia";
  context.textAlign = "center";
  context.fillText(book.title.toUpperCase(), 384, 60);
  context.strokeStyle = "#a3aaa0";
  context.beginPath();
  context.moveTo(64, 79);
  context.lineTo(704, 79);
  context.stroke();
  if (page != null) {
    context.textAlign = "left";
    context.fillStyle = "#293631";
    if (book.binding === "wire") {
      context.font = "bold 34px Georgia";
      context.fillText("Innings ledger", 72, 157);
      context.font = "16px monospace";
      context.fillText("GROUND __________________  DATE __________", 72, 206);
      const columns = [72, 132, 405, 503, 592, 692];
      context.strokeStyle = "#a1b4b8";
      context.lineWidth = 1;
      for (const position of columns) {
        context.beginPath();
        context.moveTo(position, 248);
        context.lineTo(position, 819);
        context.stroke();
      }
      for (let row = 0; row <= 12; row++) {
        const baseline = 248 + row * 47.5;
        context.beginPath();
        context.moveTo(72, baseline);
        context.lineTo(692, baseline);
        context.stroke();
        if (row > 0 && row < 12) context.fillText(String(row).padStart(2, "0"), 88, baseline + 31);
      }
      ["NO.", "BATTER", "RUNS", "BALLS", "S.R."].forEach((label, index) => context.fillText(label, columns[index] + 12, 280));
      context.fillText("TOTAL __________  WICKETS ____  OVERS ____", 72, 871);
      context.fillStyle = "#a8b5b3";
      for (let hole = 0; hole < 12; hole++) {
        context.beginPath();
        context.arc(page % 2 === 0 ? 742 : 26, 61 + hole * 81, 7, 0, Math.PI * 2);
        context.fill();
      }
    } else if (book.binding === "paperback") {
      context.font = "16px monospace";
      context.fillText(`PLATE ${String(Math.ceil(page / 2)).padStart(3, "0")}`, 72, 132);
      context.font = "bold 39px Georgia";
      context.fillText("Beyond the square", 72, 185);
      context.fillStyle = "#d5e0cc";
      context.beginPath();
      context.ellipse(384, 435, 234, 203, -.12, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#537761";
      for (const radius of [1, .7]) {
        context.beginPath();
        context.ellipse(384, 435, 221 * radius, 190 * radius, -.12, 0, Math.PI * 2);
        context.stroke();
      }
      context.fillStyle = "#b7a37d";
      context.fillRect(361, 370, 46, 130);
      context.strokeStyle = "#f7f7ef";
      context.strokeRect(344, 382, 80, 106);
      context.fillStyle = "#293631";
      context.font = "21px Georgia";
      wrapParagraph(context, "Every ground has its own geometry: a short boundary, a generous outfield, a pavilion watching from the shade. The square remains the centre of it all.", 72, 703, 616);
    } else {
      const chapters = ["The long afternoon", "At the pavilion end", "A change of ends", "The last partnership"];
      context.textAlign = "center";
      context.font = "18px Georgia";
      context.fillText(`CHAPTER ${Math.ceil(page / 24)}`, 384, 144);
      context.font = "bold 36px Georgia";
      context.fillText(chapters[Math.floor(page / 24) % chapters.length], 384, 205);
      context.textAlign = "left";
      context.font = "23px Georgia";
      let baseline = 279;
      for (const paragraph of [
        "The afternoon settled over the ground. Beyond the rope, chairs had been pulled into the shade, and a scorebook lay open on the pavilion table.",
        "Out in the middle, the batter took a fresh guard. The bowler walked back to the mark, turning the ball slowly in one hand. For a moment, the whole field was still.",
        "Then came the sound of bat meeting ball. A call, a turn, another run. The numbers changed, but the small rituals of the game remained.",
        "There would be another over, another partnership, another story to carry home. For now, there was only the next ball.",
      ]) baseline = wrapParagraph(context, paragraph, 76, baseline, 612);
    }
    context.textAlign = "center";
    context.fillStyle = selected ? (page % 10 === 0 ? "#a53443" : book.accent) : "#515953";
    context.font = `${selected ? "bold 64" : "32"}px Georgia`;
    context.fillText(String(page), 384, 969);
    if (selected) {
      context.fillRect(325, 986, 118, 4);
      context.strokeStyle = page % 10 === 0 ? "#a53443" : book.accent;
      context.lineWidth = 3;
      context.strokeRect(21, 21, 726, 982);
    }
  } else {
    context.fillStyle = book.accent;
    context.font = "italic 26px Georgia";
    context.fillText("Ballsense Editions", 384, 516);
  }
  const gutter = context.createLinearGradient(page % 2 === 0 ? 708 : 0, 0, page % 2 === 0 ? 768 : 60, 0);
  gutter.addColorStop(0, page % 2 === 0 ? "rgba(34,29,20,0)" : "rgba(34,29,20,.17)");
  gutter.addColorStop(1, page % 2 === 0 ? "rgba(34,29,20,.17)" : "rgba(34,29,20,0)");
  context.fillStyle = gutter;
  context.fillRect(page % 2 === 0 ? 708 : 0, 0, 60, 1024);
  return canvas;
}

export function BookCover({ book, className = "" }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").drawImage(coverCanvas(book), 0, 0);
  }, [book]);
  return <canvas ref={canvasRef} width={600} height={840} className={`book-cover-art ${className}`} role="img" aria-label={`${book.title}, ${book.edition}, ${book.pages} pages`} />;
}

function buildBook(book, renderer) {
  const group = new THREE.Group();
  const open = new THREE.Group();
  const closed = new THREE.Group();
  group.add(open, closed);
  group.rotation.y = -.1;
  const textures = new Set();
  function texture(canvas) {
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    textures.add(map);
    return map;
  }
  const coverMap = texture(coverCanvas(book));
  const boardMaterial = new THREE.MeshStandardMaterial({ color: book.cover, roughness: book.binding === "paperback" ? .62 : .9 });
  const coverMaterial = new THREE.MeshStandardMaterial({ map: coverMap, roughness: .82 });
  const paperMaterial = new THREE.MeshStandardMaterial({ color: book.paper, roughness: .95 });
  const [edgeCanvas, edgeContext] = canvasSurface(64, 1000);
  edgeContext.fillStyle = book.paper;
  edgeContext.fillRect(0, 0, 64, 1000);
  for (let sheet = 0; sheet < book.pages / 2; sheet++) {
    edgeContext.fillStyle = sheet % 3 ? "rgba(88,77,61,.19)" : "rgba(88,77,61,.32)";
    edgeContext.fillRect(0, sheet * 2000 / book.pages, 64, .8);
  }
  const edgeMap = texture(edgeCanvas);
  edgeMap.wrapT = THREE.RepeatWrapping;
  const edgeMaterial = new THREE.MeshStandardMaterial({ map: edgeMap, roughness: .95 });
  const thickness = book.pages / 1000;
  const boardHeight = book.binding === "paperback" ? .025 : .065;
  function box(parent, width, height, depth, material, position, rounded = false) {
    const mesh = new THREE.Mesh(rounded ? new RoundedBoxGeometry(width, height, depth, 2, Math.min(.04, height / 3)) : new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const sides = [-1, 1].map((direction) => {
    const centre = direction * (PAGE_WIDTH / 2 + .06);
    box(open, PAGE_WIDTH + .12, boardHeight, PAGE_HEIGHT + .15, boardMaterial, [centre, .06, 0], true);
    const sideMap = edgeMap.clone();
    textures.add(sideMap);
    const sideMaterial = edgeMaterial.clone();
    sideMaterial.map = sideMap;
    const stack = box(open, PAGE_WIDTH - .035, 1, PAGE_HEIGHT - .035, [sideMaterial, sideMaterial, paperMaterial, paperMaterial, sideMaterial, sideMaterial], [centre, .1, 0]);
    const geometry = new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT, 28, 12);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(centre, 0, 0);
    const positions = geometry.attributes.position;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const distance = Math.abs(positions.getX(vertex)) - .06;
      positions.setY(vertex, .06 * Math.exp(-distance * 3) + .014 * Math.sin(distance / PAGE_WIDTH * Math.PI));
    }
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ roughness: .94, side: THREE.DoubleSide });
    const page = new THREE.Mesh(geometry, material);
    page.receiveShadow = true;
    open.add(page);
    return { direction, stack, page, sideMap, material };
  });
  box(closed, PAGE_WIDTH + .12, boardHeight, PAGE_HEIGHT + .15, boardMaterial, [0, .06, 0], true);
  box(closed, PAGE_WIDTH - .035, thickness, PAGE_HEIGHT - .035, [edgeMaterial, edgeMaterial, paperMaterial, paperMaterial, edgeMaterial, edgeMaterial], [0, .095 + thickness / 2, 0]);
  box(closed, PAGE_WIDTH + .12, boardHeight, PAGE_HEIGHT + .15, [boardMaterial, boardMaterial, coverMaterial, boardMaterial, boardMaterial, boardMaterial], [0, .1 + thickness, 0], true);
  if (book.binding === "wire") {
    const metal = new THREE.MeshStandardMaterial({ color: "#bac7c8", metalness: .8, roughness: .27 });
    for (const parent of [open, closed]) for (let ring = 0; ring < 12; ring++) {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(.17, .018, 6, 24), metal);
      mesh.position.set(parent === open ? 0 : -PAGE_WIDTH / 2, .2 + thickness / 3, -1.38 + ring * .25);
      mesh.castShadow = true;
      parent.add(mesh);
    }
  } else {
    box(closed, .08, thickness + boardHeight, PAGE_HEIGHT + .15, boardMaterial, [-PAGE_WIDTH / 2 - .025, .09 + thickness / 2, 0], true);
    const ribbon = new THREE.MeshStandardMaterial({ color: book.binding === "cloth" ? "#ac4e4b" : "#dbbb80", roughness: .85, side: THREE.DoubleSide });
    box(open, .095, .008, .42, ribbon, [.73, .055, 1.72]);
    box(closed, .095, .008, .42, ribbon, [.5, .085, 1.72]);
  }
  const leafFront = new THREE.MeshStandardMaterial({ map: texture(pageCanvas(book, 2)), roughness: .94, side: THREE.FrontSide });
  const backMap = texture(pageCanvas(book, 3));
  backMap.repeat.x = -1;
  backMap.offset.x = 1;
  const leafBack = new THREE.MeshStandardMaterial({ map: backMap, roughness: .94, side: THREE.BackSide });
  const leaves = Array.from({ length: 6 }, () => {
    const geometry = new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT, 28, 10);
    const leaf = new THREE.Group();
    const front = new THREE.Mesh(geometry, leafFront);
    const back = new THREE.Mesh(geometry, leafBack);
    front.castShadow = true;
    back.castShadow = true;
    leaf.add(front, back);
    leaf.visible = false;
    open.add(leaf);
    return { leaf, geometry };
  });
  let currentKey = "";
  return {
    group, open, closed, leaves, textures,
    setPage(page, selected) {
      const key = `${page}:${selected}`;
      if (key === currentKey) return;
      currentKey = key;
      const spread = bookSpread(page, book.pages);
      for (const side of sides) {
        const number = side.direction < 0 ? spread.left : spread.right;
        if (side.material.map) {
          textures.delete(side.material.map);
          side.material.map.dispose();
        }
        side.material.map = texture(pageCanvas(book, number, selected && number === page));
        side.material.needsUpdate = true;
      }
    },
    setDepth(fraction) {
      for (const side of sides) {
        const share = side.direction < 0 ? fraction : 1 - fraction;
        const depth = Math.max(.012, thickness * share);
        side.stack.scale.y = depth;
        side.stack.position.y = .09 + depth / 2;
        side.page.position.y = .097 + depth;
        side.sideMap.repeat.y = Math.max(.02, share);
      }
    },
    turn(progress, forward) {
      for (let index = 0; index < leaves.length; index++) {
        const local = clamp((progress - .065 * index) / .64);
        const { leaf, geometry } = leaves[index];
        leaf.visible = local > 0 && local < 1;
        if (!leaf.visible) continue;
        const angle = (forward ? ease(local) : 1 - ease(local)) * Math.PI;
        const positions = geometry.attributes.position;
        for (let vertex = 0; vertex < positions.count; vertex++) {
          const across = (vertex % 29) / 28;
          const distance = across * PAGE_WIDTH;
          const bend = angle - Math.sin(angle) * Math.pow(across, .8) * .48;
          positions.setXYZ(vertex, .03 + distance * Math.cos(bend), .15 + thickness / 2 + index * .007 + distance * Math.sin(bend), (Math.floor(vertex / 29) / 10 - .5) * PAGE_HEIGHT);
        }
        positions.needsUpdate = true;
        geometry.computeVertexNormals();
      }
    },
  };
}

export default function BookCricketScene({ book, page, pendingPage, flipId, flipping, cover, active, paused, motion, overhead, cameraVersion, onReveal }) {
  const hostRef = useRef(null);
  const engineRef = useRef(null);
  const latest = useRef(null);
  latest.current = { page, pendingPage, flipId, flipping, cover, active, paused, motion, overhead, onReveal };
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setFailed(true);
      return;
    }
    setFailed(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#1b201e");
    const camera = new THREE.PerspectiveCamera(37, 1, .1, 60);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minPolarAngle = .08;
    controls.maxPolarAngle = 1.1;
    controls.minAzimuthAngle = -.65;
    controls.maxAzimuthAngle = .65;
    controls.target.set(0, .25, 0);
    scene.add(new THREE.HemisphereLight("#fff9e9", "#8d9b96", 2.1));
    const light = new THREE.DirectionalLight("#fff5e2", 3.1);
    light.position.set(-3, 7, 4);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    Object.assign(light.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: .1, far: 20 });
    light.shadow.bias = -.0003;
    light.shadow.normalBias = .015;
    scene.add(light);
    const fill = new THREE.DirectionalLight("#d6e7ff", 1.2);
    fill.position.set(4, 5, -4);
    scene.add(fill);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: "#1b201e", roughness: 1 }));
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    scene.add(table);
    const model = buildBook(book, renderer);
    scene.add(model.group);
    let frameId = null;
    let lastTime = null;
    let turn = null;
    let disposed = false;
    let lost = false;
    function resetCamera() {
      const settings = latest.current;
      const halfWidth = settings.cover ? 1.75 : 2.85;
      const distance = Math.max(settings.cover ? 5.7 : 7.9, halfWidth / (Math.tan(THREE.MathUtils.degToRad(18.5)) * camera.aspect));
      controls.target.set(0, .25, 0);
      camera.position.set(0, .25 + distance * (settings.overhead ? .993 : .84), distance * (settings.overhead ? .12 : .54));
      controls.update();
    }
    function resize() {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      resetCamera();
      wake();
    }
    function frame(time) {
      frameId = null;
      const settings = latest.current;
      if (disposed || lost || !settings.active || document.hidden) { lastTime = null; return; }
      const delta = lastTime == null || settings.paused ? 0 : time - lastTime;
      lastTime = time;
      model.open.visible = !settings.cover;
      model.closed.visible = settings.cover;
      if (settings.flipping && settings.motion) {
        if (turn?.id !== settings.flipId) turn = { id: settings.flipId, from: settings.page || 1, to: settings.pendingPage, elapsed: 0, done: false };
        turn.elapsed += delta;
        const progress = clamp(turn.elapsed / BOOK_FLIP_MS);
        model.setPage(progress < .52 ? turn.from : turn.to, progress >= .52 || settings.page != null);
        model.setDepth(THREE.MathUtils.lerp(turn.from / book.pages, turn.to / book.pages, ease(progress)));
        model.turn(progress, turn.to >= turn.from);
        host.dataset.progress = progress.toFixed(3);
        if (progress >= 1 && !turn.done) {
          turn.done = true;
          settings.onReveal(turn.id);
        }
      } else {
        const shown = settings.flipping ? settings.pendingPage : settings.page || 1;
        model.setPage(shown, settings.flipping || settings.page != null);
        model.setDepth(shown / book.pages);
        model.leaves.forEach(({ leaf }) => { leaf.visible = false; });
        turn = null;
        host.dataset.progress = "1";
      }
      controls.update();
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(frame);
    }
    function wake() {
      if (!disposed && !lost && frameId == null) { lastTime = null; frameId = window.requestAnimationFrame(frame); }
    }
    function contextLost(event) {
      event.preventDefault();
      lost = true;
      window.cancelAnimationFrame(frameId);
      setFailed(true);
    }
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    document.addEventListener("visibilitychange", wake);
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    engineRef.current = { wake, resetCamera };
    resize();
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      document.removeEventListener("visibilitychange", wake);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      controls.dispose();
      const geometries = new Set();
      const materials = new Set();
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      model.textures.forEach((map) => map.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      engineRef.current = null;
    };
  }, [book]);

  useEffect(() => { engineRef.current?.wake(); }, [active, paused, flipping, flipId, motion, page, pendingPage]);
  useEffect(() => { engineRef.current?.resetCamera(); engineRef.current?.wake(); }, [cover, overhead, cameraVersion]);
  useEffect(() => {
    if (!flipping || !active || paused || (!failed && motion)) return;
    const timer = window.setTimeout(() => latest.current.onReveal(flipId), 180);
    return () => window.clearTimeout(timer);
  }, [failed, motion, flipping, active, paused, flipId]);

  const visiblePage = flipping && (!motion || failed) ? pendingPage : page;
  const spread = bookSpread(visiblePage || 1, book.pages);
  return <>
    <div ref={hostRef} className="book-canvas" role="img" aria-label={`${book.title}, ${cover ? "front cover" : `open at page ${visiblePage || 1}`}`} data-renderer={failed ? "fallback" : "three"} />
    {failed && <div className="book-fallback">
      {cover ? <BookCover book={book} /> : <div className="book-fallback-spread">{[spread.left, spread.right].map((number, index) => <div key={index} className={number === visiblePage ? "selected" : ""}><span>{book.title}</span><div className="book-fallback-lines" /><strong>{number}</strong></div>)}</div>}
      <span className="book-fallback-notice" role="status">3D is unavailable on this device.</span>
    </div>}
  </>;
}