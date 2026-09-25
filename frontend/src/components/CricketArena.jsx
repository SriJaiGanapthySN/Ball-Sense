import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createCricketAvatar } from "../lib/cricketAvatar.js";
import { synchronizedElapsed } from "../lib/handMultiplayer.js";
import { DELIVERY_MS } from "../lib/cricketOpponent.js";
import { returnTimeline, victoryFrame, VICTORY_MS, deliveryShotPlan, deliveryRunningFrame } from "../lib/cricketPresentation.js";
import { FIELD_POSITIONS, KEEPER_INDEX, TEAM_COLORS, FIELDER_SPEED, CHEER_STAGE_CENTRES, CEREMONY_ORIGIN, inCheerStageBay, TOSS_MS, HANDSHAKE_MS, POST_MATCH_MS, shotPlan, chaseFrame, handshakeLineFrame, awardFrame, cheeringTeam, presentationDuration, tossFrame, dismissalFrame, outcomeDuration, runningFrame } from "../lib/cricketPresentation.js";

export default function CricketArena({ active, phase, lastBall, revealing, cameraView, motion, batting, bowlingLength = "good length", tossStage = "none", tossCoin = null, tossTiming = null, ceremony = null, awardTeams = "", winner = "tie", teamNames = null, scoreboard = null, onPresentationComplete, onCeremonyComplete }) {
  const hostRef = useRef(null);
  const stateRef = useRef({ phase, lastBall, revealing, cameraView, motion, batting, bowlingLength, tossStage, tossCoin, ceremony, awardTeams });
  const engineRef = useRef(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    stateRef.current = { phase, lastBall, revealing, cameraView, motion, batting, bowlingLength, tossStage, tossCoin, tossTiming, ceremony, awardTeams, winner, teamNames, scoreboard, onPresentationComplete, onCeremonyComplete };
    engineRef.current?.render();
  }, [phase, lastBall, revealing, cameraView, motion, batting, bowlingLength, tossStage, tossCoin, tossTiming, ceremony, awardTeams, winner, teamNames, scoreboard, onPresentationComplete, onCeremonyComplete]);

  useEffect(() => {
    if (!active || (!unavailable && motion) || revealing) return;
    const timer = window.setTimeout(() => {
      if (ceremony) stateRef.current.onCeremonyComplete?.(ceremony);
      else if (lastBall) stateRef.current.onPresentationComplete?.(lastBall);
    }, ceremony ? 1200 : 350);
    return () => window.clearTimeout(timer);
  }, [active, unavailable, motion, revealing, lastBall, ceremony]);

  useEffect(() => {
    const host = hostRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
    } catch {
      setUnavailable(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute("aria-label", "Interactive 3D cricket stadium");
    renderer.domElement.setAttribute("role", "img");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#080f15");
    scene.fog = new THREE.Fog("#080f15", 60, 130);
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 180);
    const resources = new Set();
    const material = (color, options = {}) => {
      const value = new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...options });
      resources.add(value);
      return value;
    };
    const addMesh = (geometry, surface, position, parent = scene) => {
      resources.add(geometry);
      const mesh = new THREE.Mesh(geometry, surface);
      mesh.position.set(...position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const box = (size, surface, position, parent) => addMesh(new THREE.BoxGeometry(...size), surface, position, parent);
    const charcoal = material("#1f303c");
    const pitchMaterial = material("#b5ac8a");
    const chalk = material("#e5f3df", { emissive: "#839478", emissiveIntensity: 0.2 });
    const mint = material("#79edc4", { emissive: "#37b991", emissiveIntensity: 1.6 });
    const amber = material("#f0c77b", { emissive: "#b17a2d", emissiveIntensity: 1 });
    const blue = material("#83b9ed", { emissive: "#447ab0", emissiveIntensity: 0.5 });
    const red = material("#fc795e", { emissive: "#c83922", emissiveIntensity: 0.8 });
    const whiteLight = material("#efffff", { emissive: "#b8e1ec", emissiveIntensity: 3 });
    const sparkCount = 4 * 64 * 3;
    const sparkPositions = new Float32Array(sparkCount * 3);
    const sparkColors = new Float32Array(sparkCount * 3);
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3).setUsage(THREE.DynamicDrawUsage));
    sparkGeometry.setAttribute("color", new THREE.BufferAttribute(sparkColors, 3).setUsage(THREE.DynamicDrawUsage));
    const sparkCanvas = document.createElement("canvas");
    sparkCanvas.width = sparkCanvas.height = 32;
    const sparkDrawing = sparkCanvas.getContext("2d");
    const glow = sparkDrawing.createRadialGradient(16, 16, 0, 16, 16, 16);
    glow.addColorStop(0, "white");
    glow.addColorStop(0.3, "rgba(255,255,255,0.8)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    sparkDrawing.fillStyle = glow;
    sparkDrawing.fillRect(0, 0, 32, 32);
    const sparkTexture = new THREE.CanvasTexture(sparkCanvas);
    const sparkMaterial = new THREE.PointsMaterial({ map: sparkTexture, size: 0.65, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const fireworks = new THREE.Points(sparkGeometry, sparkMaterial);
    fireworks.frustumCulled = false;
    scene.add(fireworks);
    [sparkGeometry, sparkTexture, sparkMaterial].forEach((resource) => resources.add(resource));
    const weavePixels = new Uint8Array(64 * 64 * 4);
    for (let pixel = 0; pixel < 64 * 64; pixel++) {
      const thread = (pixel % 64 + Math.floor(pixel / 64)) % 2;
      const grain = ((pixel * 374761393) ^ (pixel * 668265263 >>> 13)) & 15;
      weavePixels.set([160 + thread * 50 + grain, 160 + thread * 50 + grain, 160 + thread * 50 + grain, 255], pixel * 4);
    }
    const weave = new THREE.DataTexture(weavePixels, 64, 64);
    weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
    weave.repeat.set(5, 5);
    weave.needsUpdate = true;
    resources.add(weave);
    const fabric = { roughness: 0.94, bumpMap: weave, bumpScale: 0.006 };
    const teamKits = { you: material(TEAM_COLORS.you, fabric), computer: material(TEAM_COLORS.computer, fabric) };
    const battingKit = material(TEAM_COLORS.you, fabric);
    const bowlingKit = material(TEAM_COLORS.computer, fabric);
    const umpireKit = material("#ffffff");
    const helmetMaterial = material("#192e3e", { roughness: 0.3, metalness: 0.12 });
    const skinTones = ["#b87850", "#8b543b", "#d49b76", "#67432f", "#bb8766", "#e0b290"].map((color) => material(color, { roughness: 0.62, bumpMap: weave, bumpScale: 0.0009 }));
    const lipTones = ["#895645", "#674035", "#ad7767", "#51382e", "#916453", "#b78270"].map((color) => material(color, { roughness: 0.7 }));
    const hairTones = ["#191815", "#35251e", "#24221e"].map((color) => material(color, { roughness: 0.98 }));
    const trim = material("#cad4d8", { roughness: 0.83 });
    const jerseyNumbers = Array.from({ length: 11 }, (_, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 320;
      const drawing = canvas.getContext("2d");
      drawing.fillStyle = "#edf3ed";
      drawing.textAlign = "center";
      drawing.font = "600 25px 'Barlow Condensed', sans-serif";
      drawing.fillText("NIGHTFALL", 128, 55);
      drawing.font = "700 190px 'Barlow Condensed', sans-serif";
      drawing.fillText(String(index + 1), 128, 242);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      resources.add(texture);
      return texture;
    });
    const leather = material("#563c2a");

    scene.add(new THREE.HemisphereLight("#d9e8ee", "#283c30", 1.9));
    const floodlight = new THREE.DirectionalLight("#fff2df", 2.6);
    floodlight.position.set(-12, 32, 10);
    floodlight.castShadow = true;
    floodlight.shadow.mapSize.set(1024, 1024);
    Object.assign(floodlight.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 85 });
    floodlight.shadow.bias = -0.001;
    floodlight.shadow.normalBias = 0.08;
    scene.add(floodlight);
    const rimlight = new THREE.DirectionalLight("#9ebfd6", 1.4);
    rimlight.position.set(24, 12, -25);
    scene.add(rimlight);
    const faceLight = new THREE.DirectionalLight("#edf4ff", 0.8);
    faceLight.position.set(-4, 6, 18);
    scene.add(faceLight);

    const grassTexture = weave.clone();
    grassTexture.repeat.set(420, 420);
    resources.add(grassTexture);
    const grassSurface = { bumpMap: grassTexture, bumpScale: 0.025, roughness: 1 };
    const turf = addMesh(new THREE.CylinderGeometry(33, 33, 0.6, 96), material("#28613d", grassSurface), [0, -0.4, 0]);
    turf.scale.z = 0.86;
    const mownGrass = [material("#36774c", grassSurface), material("#307046", grassSurface)];
    for (let stripe = -4; stripe <= 4; stripe++) {
      const depth = 2 * Math.sqrt(31 * 31 - (stripe * 6) ** 2) * 0.86;
      box([3, 0.03, depth], mownGrass[Math.abs(stripe) % 2], [stripe * 6, -0.07, 0]);
    }
    const ring = (radius, thickness, surface, height) => {
      const mesh = addMesh(new THREE.TorusGeometry(radius, thickness, 6, 120), surface, [0, height, 0]);
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.y = 0.86;
      return mesh;
    };
    ring(31.2, 0.065, chalk, 0.06);
    ring(19, 0.045, chalk, 0.04);
    box([4.4, 0.12, 19], pitchMaterial, [0, 0.02, 0]);
    for (const end of [-1, 1]) {
      box([6, 0.04, 0.07], chalk, [0, 0.11, end * 7.3]);
      box([3.1, 0.04, 0.07], chalk, [0, 0.11, end * 8.4]);
      for (const side of [-1, 1]) box([0.06, 0.04, 2.2], chalk, [side * 1.55, 0.11, end * 7.7]);
    }

    const wicketGroups = [];
    const bails = [];
    for (const end of [-1, 1]) {
      const group = new THREE.Group();
      group.position.z = end * 8.4;
      scene.add(group);
      wicketGroups.push(group);
      for (const offset of [-0.35, 0, 0.35]) box([0.09, 1.25, 0.09], amber, [offset, 0.69, 0], group);
      for (const offset of [-0.18, 0.18]) {
        const bail = box([0.37, 0.09, 0.1], chalk, [offset, 1.37, 0], group);
        bail.userData.homeX = offset;
        bails.push(bail);
      }
    }

    const stands = new THREE.Group();
    scene.add(stands);
    const standGeometry = new THREE.BoxGeometry(1, 1, 1);
    resources.add(standGeometry);
    const seating = new THREE.InstancedMesh(standGeometry, material("#ffffff"), 132);
    const canopy = new THREE.InstancedMesh(standGeometry, material("#aeb9b4", { roughness: 0.55, metalness: 0.25 }), 44);
    const canopyTrim = new THREE.InstancedMesh(standGeometry, material("#dcdfd5", { emissive: "#869b91", emissiveIntensity: 0.35 }), 44);
    const roofSupports = new THREE.InstancedMesh(standGeometry, charcoal, 22);
    for (const structure of [seating, canopy, canopyTrim, roofSupports]) {
      structure.count = 0;
      structure.castShadow = true;
      structure.receiveShadow = true;
      stands.add(structure);
      resources.add(structure);
    }
    const standTransform = new THREE.Object3D();
    const seatColors = [new THREE.Color("#344e61"), new THREE.Color("#485950"), new THREE.Color("#5d6765")];
    for (let tier = 0; tier < 3; tier++) {
      for (let section = 0; section < 44; section++) {
        const angle = section / 44 * Math.PI * 2;
        const radius = 35.5 + tier * 2;
        if (inCheerStageBay(Math.sin(angle) * radius, Math.cos(angle) * radius * 0.86, 2.7)) continue;
        standTransform.position.set(Math.sin(angle) * radius, 1 + tier * 1.4, Math.cos(angle) * radius * 0.86);
        standTransform.rotation.set(0, angle, 0);
        standTransform.scale.set(4.8, 1.7, 2.4);
        standTransform.updateMatrix();
        seating.setMatrixAt(seating.count, standTransform.matrix);
        seating.setColorAt(seating.count++, seatColors[(section + tier) % 3]);
      }
    }
    for (let section = 0; section < 44; section++) {
      const angle = section / 44 * Math.PI * 2;
      if (inCheerStageBay(Math.sin(angle) * 38.6, Math.cos(angle) * 33.2, 3.5)) continue;
      standTransform.position.set(Math.sin(angle) * 38.6, 7.1, Math.cos(angle) * 33.2);
      standTransform.rotation.set(0, angle, 0);
      standTransform.rotateX(-0.12);
      standTransform.scale.set(5.35, 0.18, 7.4);
      standTransform.updateMatrix();
      canopy.setMatrixAt(canopy.count++, standTransform.matrix);
      standTransform.position.set(Math.sin(angle) * 35, 7.55, Math.cos(angle) * 30.1);
      standTransform.scale.set(5.35, 0.24, 0.14);
      standTransform.updateMatrix();
      canopyTrim.setMatrixAt(canopyTrim.count++, standTransform.matrix);
      if (section % 2 === 0) {
        standTransform.position.set(Math.sin(angle) * 41.5, 3.5, Math.cos(angle) * 35.7);
        standTransform.rotation.set(0, angle, 0);
        standTransform.scale.set(0.2, 7, 0.2);
        standTransform.updateMatrix();
        roofSupports.setMatrixAt(roofSupports.count++, standTransform.matrix);
      }
    }
    const crowdGeometry = new THREE.CapsuleGeometry(0.16, 0.24, 2, 6);
    const headGeometry = new THREE.SphereGeometry(0.115, 6, 4);
    resources.add(crowdGeometry);
    resources.add(headGeometry);
    const crowd = new THREE.InstancedMesh(crowdGeometry, material("#ffffff"), 1056);
    const crowdHeads = new THREE.InstancedMesh(headGeometry, material("#c79c7c"), 1056);
    const crowdTransform = new THREE.Object3D();
    const crowdColors = [new THREE.Color("#d9e0da"), new THREE.Color("#e3be4e"), new THREE.Color("#3c88c9"), new THREE.Color("#cb7768")];
    let visibleSpectators = 0;
    for (let spectator = 0; spectator < 1056; spectator++) {
      const tier = Math.floor(spectator / 352);
      const angle = (spectator % 352) / 352 * Math.PI * 2;
      crowdTransform.position.set(Math.sin(angle) * (35.5 + tier * 2), 2.15 + tier * 1.4, Math.cos(angle) * (35.5 + tier * 2) * 0.86);
      if (inCheerStageBay(crowdTransform.position.x, crowdTransform.position.z, 2.7)) continue;
      crowdTransform.scale.set(1, 1, 1);
      crowdTransform.updateMatrix();
      crowd.setMatrixAt(visibleSpectators, crowdTransform.matrix);
      crowd.setColorAt(visibleSpectators, crowdColors[spectator % 4]);
      crowdTransform.position.y += 0.34;
      crowdTransform.updateMatrix();
      crowdHeads.setMatrixAt(visibleSpectators, crowdTransform.matrix);
      visibleSpectators++;
    }
    crowd.count = visibleSpectators;
    crowdHeads.count = visibleSpectators;
    resources.add(crowd);
    resources.add(crowdHeads);
    scene.add(crowd, crowdHeads);
    const boundaryCanvas = document.createElement("canvas");
    boundaryCanvas.width = 512;
    boundaryCanvas.height = 128;
    const boundaryDrawing = boundaryCanvas.getContext("2d");
    boundaryDrawing.fillStyle = "#153126";
    boundaryDrawing.fillRect(0, 0, 512, 128);
    boundaryDrawing.fillStyle = "#ddeddf";
    boundaryDrawing.font = "600 62px 'Barlow Condensed', sans-serif";
    boundaryDrawing.textAlign = "center";
    boundaryDrawing.fillText("BALLSENSE", 256, 84);
    boundaryDrawing.fillStyle = "#8bbaa1";
    boundaryDrawing.fillRect(0, 116, 512, 5);
    const boundaryTexture = new THREE.CanvasTexture(boundaryCanvas);
    boundaryTexture.colorSpace = THREE.SRGBColorSpace;
    const boundarySurface = new THREE.MeshBasicMaterial({ map: boundaryTexture });
    resources.add(boundaryTexture);
    resources.add(boundarySurface);
    for (let section = 0; section < 56; section++) {
      const angle = section / 56 * Math.PI * 2;
      if (inCheerStageBay(Math.sin(angle) * 33.2, Math.cos(angle) * 28.5, 1.5)) continue;
      const board = box([2.8, 0.7, 0.2], boundarySurface, [Math.sin(angle) * 33.2, 0.7, Math.cos(angle) * 28.5]);
      board.rotation.y = angle;
    }
    const screenCanvas = document.createElement("canvas");
    screenCanvas.width = 1024;
    screenCanvas.height = 320;
    const screenDrawing = screenCanvas.getContext("2d");
    const screenTexture = new THREE.CanvasTexture(screenCanvas);
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    const screenSurface = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false });
    resources.add(screenTexture);
    resources.add(screenSurface);
    for (const end of [-1, 1]) {
      const screen = new THREE.Group();
      screen.position.set(0, 8.6, end * 35);
      screen.rotation.y = end === 1 ? Math.PI : 0;
      scene.add(screen);
      box([13.2, 4.4, 0.45], charcoal, [0, 0, 0], screen);
      addMesh(new THREE.PlaneGeometry(12.5, 3.9), screenSurface, [0, 0, 0.24], screen);
      for (const side of [-1, 1]) box([0.25, 7, 0.3], charcoal, [side * 5, -5.5, 0], screen);
    }
    let previousScreen = "";
    function updateStadiumScreen(state) {
      const home = state.scoreboard?.scores.you;
      const away = state.scoreboard?.scores.computer;
      const homeName = state.teamNames?.you || "YOUR XI";
      const awayName = state.teamNames?.computer || "COMPUTER XI";
      const caption = state.tossStage !== "none" ? `THE TOSS / ${state.tossStage.toUpperCase()}` : `INNINGS ${state.scoreboard?.innings || 1} / ${state.phase.toUpperCase()}`;
      const screenKey = JSON.stringify([home, away, homeName, awayName, caption]);
      if (screenKey === previousScreen) return;
      previousScreen = screenKey;
      screenDrawing.fillStyle = "#0e1c19";
      screenDrawing.fillRect(0, 0, 1024, 320);
      screenDrawing.textAlign = "center";
      screenDrawing.fillStyle = "#b8cdbf";
      screenDrawing.font = "500 24px 'Barlow Condensed', sans-serif";
      screenDrawing.fillText("NIGHTFALL ARENA / BALLSENSE", 512, 36);
      [home, away].forEach((score, index) => {
        const centre = index ? 760 : 264;
        screenDrawing.fillStyle = index ? "#efcf5b" : "#93c3ff";
        screenDrawing.font = "600 30px 'Barlow Condensed', sans-serif";
        screenDrawing.fillText(index ? awayName : homeName, centre, 93, 430);
        screenDrawing.font = "600 118px 'Barlow Condensed', sans-serif";
        screenDrawing.fillText(`${score?.runs || 0}/${score?.wickets || 0}`, centre, 224, 420);
      });
      screenDrawing.fillStyle = "#31473a";
      screenDrawing.fillRect(510, 62, 2, 181);
      screenDrawing.fillStyle = "#c8dcd0";
      screenDrawing.font = "500 25px 'Barlow Condensed', sans-serif";
      screenDrawing.fillText(caption, 512, 291, 940);
      screenTexture.needsUpdate = true;
      host.dataset.stadiumScore = `${home?.runs || 0}/${home?.wickets || 0} - ${away?.runs || 0}/${away?.wickets || 0}`;
    }
    host.dataset.spectators = String(visibleSpectators);
    host.dataset.coveredSections = String(canopy.count);
    const lightTowers = [];
    for (const [positionX, positionZ] of [[-28, -24], [28, -24], [-28, 24], [28, 24]]) {
      const tower = new THREE.Group();
      tower.userData.nearSide = positionZ > 0;
      scene.add(tower);
      lightTowers.push(tower);
      box([0.35, 18, 0.35], charcoal, [positionX, 9, positionZ], tower);
      const lamp = new THREE.Group();
      lamp.position.set(positionX, 18, positionZ);
      lamp.lookAt(0, 2, 0);
      tower.add(lamp);
      box([5.3, 2.2, 0.3], charcoal, [0, 0, 0], lamp);
      for (let bulb = 0; bulb < 8; bulb++) box([0.8, 0.6, 0.15], whiteLight, [(bulb % 4 - 1.5) * 1.15, bulb < 4 ? 0.55 : -0.55, 0.2], lamp);
    }

    let avatarIndex = 0;
    function cricketer(position, kit, padded = false, cap = true) {
      const index = avatarIndex++;
      const formal = kit.userData.formal;
      const player = createCricketAvatar({ kit, skin: skinTones[index % skinTones.length], hair: hairTones[index % hairTones.length], white: chalk, dark: charcoal, trim: formal ? kit : trim, helmet: helmetMaterial, lip: lipTones[index % lipTones.length], numberMap: formal || kit === umpireKit ? null : jerseyNumbers[index % 11], shoe: formal ? charcoal : chalk, padded, cap, index, resources });
      player.position.set(...position);
      player.userData.home = player.position.clone();
      scene.add(player);
      return player;
    }
    const batter = cricketer([0.65, 0.05, 7], battingKit, true);
    const bat = new THREE.Group();
    bat.position.set(0, -0.38, 0);
    batter.userData.elbows[0].add(bat);
    box([0.085, 0.38, 0.085], leather, [0, -0.14, 0], bat);
    box([0.25, 0.72, 0.11], material("#d6bf84"), [0, -0.67, 0], bat);
    box([0.14, 0.18, 0.015], helmetMaterial, [0, -0.6, -0.065], bat);
    const nonStriker = cricketer([-1.3, 0.05, -7], battingKit, true);
    const runningBat = box([0.23, 0.92, 0.1], material("#d6bf84"), [0, -0.77, 0], nonStriker.userData.elbows[0]);
    const bowler = cricketer([0, 0.05, -18], bowlingKit);
    bowler.rotation.y = Math.PI;
    const keeper = cricketer([0, 0.05, 11], bowlingKit, true);
    const fielders = FIELD_POSITIONS.map(([positionX, positionZ]) => cricketer([positionX, 0.05, positionZ], bowlingKit));
    const umpire = cricketer([1.3, 0.05, -11], umpireKit, false, false);
    addMesh(new THREE.CylinderGeometry(0.235, 0.235, 0.018, 32), umpireKit, [0, 0.08, 0], umpire.userData.head);
    addMesh(new THREE.CylinderGeometry(0.118, 0.147, 0.1, 24), umpireKit, [0, 0.125, 0.008], umpire.userData.head);
    const umpireFinger = addMesh(new THREE.CapsuleGeometry(0.014, 0.09, 4, 8), umpire.userData.skinMaterial, [0, -0.5, 0], umpire.userData.elbows[1]);
    umpireFinger.visible = false;
    const allPlayers = [batter, nonStriker, bowler, keeper, ...fielders, umpire];
    const captains = [cricketer([-1.6, 0.05, 0.4], teamKits.you), cricketer([1.6, 0.05, 0.4], teamKits.computer)];
    const squads = ["you", "computer"].map((team, teamIndex) => [captains[teamIndex], ...Array.from({ length: 10 }, () => cricketer([0, 0.05, 0], teamKits[team]))]);
    const suit = material("#111215", { roughness: 0.9 });
    suit.userData.formal = true;
    const presenter = cricketer([2.3, 0.05, 0], suit, false, false);
    box([0.13, 0.3, 0.012], umpireKit, [0, 1.56, -0.171], presenter);
    box([0.035, 0.26, 0.016], charcoal, [0, 1.55, -0.186], presenter);
    for (const side of [-1, 1]) {
      const lapel = box([0.08, 0.33, 0.022], suit, [side * 0.095, 1.55, -0.18], presenter);
      lapel.rotation.z = side * -0.23;
    }
    const stages = ["you", "computer"].map((team, index) => {
      const stage = new THREE.Group();
      const [centreX, centreZ] = CHEER_STAGE_CENTRES[index];
      stage.position.set(centreX, 0, centreZ);
      scene.add(stage);
      box([10.5, 0.1, 9], material("#263b38"), [0, -0.12, -0.5], stage);
      box([7.1, 3.8, 0.15], material("#182229"), [0, 1.75, -2], stage);
      for (const side of [-1, 1]) box([0.16, 3.5, 0.18], teamKits[team], [side * 3.35, 1.75, -1.87], stage);
      box([6.6, 0.65, 3.4], charcoal, [0, 0.2, 0], stage);
      box([6.7, 0.12, 3.5], material("#434a50"), [0, 0.58, 0], stage);
      box([6.5, 0.32, 0.08], teamKits[team], [0, 0.23, 1.73], stage);
      box([1.4, 0.22, 0.65], charcoal, [0, -0.02, 2.05], stage);
      box([1.4, 0.42, 0.5], charcoal, [0, 0.09, 1.65], stage);
      for (const side of [-1, 1]) {
        box([0.1, 1.1, 0.1], charcoal, [side * 3.15, 1.16, -1.4], stage);
        box([0.65, 0.85, 0.55], suit, [side * 3.65, 0.4, 0], stage);
      }
      box([6.4, 0.1, 0.1], charcoal, [0, 1.65, -1.4], stage);
      return stage;
    });
    const cheerSquads = ["you", "computer"].map((team, teamIndex) => Array.from({ length: 4 }, (_, index) => {
      const [centreX, centreZ] = CHEER_STAGE_CENTRES[teamIndex];
      const dancer = cricketer([centreX + (index - 1.5) * 1.3, 0.75, centreZ], teamKits[team], false, false);
      box([0.43, 0.045, 0.28], chalk, [0, 1.1, 0], dancer);
      addMesh(new THREE.CapsuleGeometry(0.055, 0.18, 6, 12), hairTones[1], [0, -0.055, 0.133], dancer.userData.head);
      dancer.userData.hands.forEach((hand) => {
        addMesh(new THREE.IcosahedronGeometry(0.23, 1), teamKits[team], [0, -0.12, 0], hand);
        for (let ribbon = 0; ribbon < 8; ribbon++) {
          const strand = box([0.035, 0.45, 0.035], ribbon % 2 ? chalk : teamKits[team], [0, -0.12, 0], hand);
          strand.rotation.set(ribbon * 0.7, ribbon * 1.3, ribbon * 0.4);
        }
      });
      return dancer;
    }));
    const ceremonyOrigin = new THREE.Vector3(...CEREMONY_ORIGIN);
    const awardCarpet = box([7, 0.04, 5], material("#223746"), [CEREMONY_ORIGIN[0], -0.035, CEREMONY_ORIGIN[2]]);
    const trophies = [0, 1].map(() => {
      const trophy = new THREE.Group();
      scene.add(trophy);
      const gold = material("#e4b954", { metalness: 0.75, roughness: 0.23 });
      box([0.4, 0.12, 0.32], charcoal, [0, 0, 0], trophy);
      addMesh(new THREE.CylinderGeometry(0.05, 0.08, 0.28, 12), gold, [0, 0.19, 0], trophy);
      addMesh(new THREE.CylinderGeometry(0.25, 0.09, 0.35, 20, 1, true), gold, [0, 0.47, 0], trophy);
      for (const side of [-1, 1]) addMesh(new THREE.TorusGeometry(0.13, 0.03, 6, 16), gold, [side * 0.24, 0.48, 0], trophy);
      return trophy;
    });
    const coin = new THREE.Group();
    scene.add(coin);
    const edge = addMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.055, 48), material("#d5b966", { metalness: 0.8, roughness: 0.25 }), [0, 0, 0], coin);
    edge.rotation.x = Math.PI / 2;
    const coinFaces = [];
    for (const [index, label] of ["HEADS", "TAILS"].entries()) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const drawing = canvas.getContext("2d");
      drawing.fillStyle = index ? "#b5c6d1" : "#efd28d";
      drawing.fillRect(0, 0, 256, 256);
      drawing.strokeStyle = "#5b492c";
      drawing.lineWidth = 7;
      drawing.beginPath(); drawing.arc(128, 128, 115, 0, Math.PI * 2); drawing.stroke();
      drawing.fillStyle = "#263332";
      drawing.textAlign = "center";
      drawing.font = "bold 112px Georgia";
      drawing.fillText(label[0], 128, 145);
      drawing.font = "bold 27px Georgia";
      drawing.fillText(label, 128, 191);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      resources.add(texture);
      const surface = new THREE.MeshBasicMaterial({ map: texture });
      resources.add(surface);
      const face = addMesh(new THREE.CircleGeometry(0.297, 48), surface, [0, 0, index ? -0.029 : 0.029], coin);
      face.rotation.y = index ? Math.PI : 0;
      coinFaces.push(face);
    }

    function pose(player, stride = 0, celebration = 0) {
      const rig = player.userData;
      const breath = stateRef.current.motion ? Math.sin(performance.now() * 0.0018 + rig.variation * 1.7) * 0.006 : 0;
      rig.torso.rotation.set(-Math.abs(stride) * 0.08, stride * 0.035, stride * 0.018);
      rig.torso.scale.set(1 + breath * 0.3, 1 + breath, 1 + breath);
      rig.head.rotation.set(Math.abs(stride) * 0.035, -stride * 0.04, -stride * 0.018);
      rig.arms.forEach((arm, index) => { arm.rotation.set(stride * (index ? -0.65 : 0.65) - 0.035, 0, (0.045 + celebration * 2.4) * (index ? -1 : 1)); });
      rig.elbows.forEach((elbow) => { elbow.rotation.set(-0.12 - Math.abs(stride) * 0.6, 0, 0); });
      rig.legs.forEach((leg, index) => { leg.rotation.x = stride * (index ? 0.75 : -0.75); });
      rig.knees.forEach((knee, index) => { knee.rotation.x = Math.max(0, stride * (index ? -1 : 1)) * 1.1; });
      player.position.y = player.userData.home.y + Math.abs(stride) * 0.027;
    }

    const down = new THREE.Vector3(0, -1, 0);
    const targetPoint = new THREE.Vector3();
    const shoulderToHand = new THREE.Vector3();
    const elbowOffset = new THREE.Vector3();
    const elbowPoint = new THREE.Vector3();
    const limbDirection = new THREE.Vector3();
    const inverseArm = new THREE.Quaternion();
    function reach(player, targets) {
      player.userData.arms.forEach((arm, index) => {
        targetPoint.set(...targets[index]);
        shoulderToHand.subVectors(targetPoint, arm.position);
        const distance = Math.min(0.75, shoulderToHand.length());
        shoulderToHand.normalize();
        elbowOffset.set(index ? 1 : -1, 0, 0);
        elbowOffset.addScaledVector(shoulderToHand, -elbowOffset.dot(shoulderToHand)).normalize();
        elbowPoint.copy(arm.position).addScaledVector(shoulderToHand, distance / 2).addScaledVector(elbowOffset, Math.sqrt(0.38 ** 2 - (distance / 2) ** 2));
        limbDirection.subVectors(elbowPoint, arm.position).normalize();
        arm.quaternion.setFromUnitVectors(down, limbDirection);
        inverseArm.copy(arm.quaternion).invert();
        limbDirection.subVectors(targetPoint, elbowPoint).normalize().applyQuaternion(inverseArm);
        player.userData.elbows[index].quaternion.setFromUnitVectors(down, limbDirection);
      });
    }

    const handContact = new THREE.Vector3();
    const throwRelease = new THREE.Vector3();
    const otherHand = new THREE.Vector3();
    const worldGrip = new THREE.Vector3();
    function reachWorld(player, targets) {
      player.updateWorldMatrix(true, false);
      reach(player, targets.map((target) => player.worldToLocal(worldGrip.fromArray(target)).toArray()));
    }

    function holdTrophy(player, trophy, targets) {
      reachWorld(player, targets);
      player.updateWorldMatrix(true, true);
      player.userData.hands[0].getWorldPosition(handContact);
      player.userData.hands[1].getWorldPosition(otherHand);
      trophy.position.copy(handContact).lerp(otherHand, 0.5);
    }

    const ball = addMesh(new THREE.SphereGeometry(0.11, 16, 12), red, [0, 1.1, -9]);
    const seam = addMesh(new THREE.TorusGeometry(0.113, 0.009, 4, 24), chalk, [0, 0, 0], ball);
    seam.rotation.x = Math.PI / 3;
    const trail = Array.from({ length: 10 }, (_, index) => addMesh(
      new THREE.SphereGeometry(0.13 - index * 0.008, 8, 6),
      material("#f7c983", { transparent: true, opacity: (1 - index / 10) * 0.6, emissive: "#b87933", emissiveIntensity: 1 }),
      [0, -2, 0],
    ));
    const cameraTarget = new THREE.Vector3();
    const lookTarget = new THREE.Vector3(0, 0, 0);
    const cameraLook = new THREE.Vector3(0, 1, 0);
    const pointer = { x: 0 };
    let running = false;
    let lost = false;
    let previousBall = null;
    let previousReveal = false;
    let lastTime = 0;
    let frame = 0;
    let previousShot = "";
    let previousTossStage = "none";
    let tossStarted = 0;
    let tossStageStarted = 0;
    let previousCeremony = null;
    let currentShot = null;
    let currentReturn = null;
    let currentPresentationMs = 0;
    let currentOutcomeMs = 1700;
    let actionElapsed = 0;
    let ceremonyElapsed = 0;
    let completedDelivery = null;
    let completedCeremony = null;

    function shakeHands(pair, progress, depth = 0) {
      const approach = Math.min(progress / 0.25, 1);
      const shaking = progress >= 0.25 && progress <= 0.85;
      const wave = shaking ? Math.sin(progress * Math.PI * 12) * 0.06 : 0;
      pair.forEach((player, index) => {
        player.visible = true;
        player.position.set((index ? 1 : -1) * (1.5 - approach), 0.05, depth - (index ? 0.5 : 0));
        player.rotation.set(0, index ? Math.PI / 2 : -Math.PI / 2, 0);
        pose(player, approach < 1 ? Math.sin(progress * 24) * 0.5 : 0);
        if (approach >= 1) reach(player, [[-0.25, 1.25 + wave, -0.5], [0.36, 1.02, 0]]);
      });
    }

    function render(time = performance.now()) {
      if (lost || !host.clientWidth || !host.clientHeight) return;
      const state = stateRef.current;
      updateStadiumScreen(state);
      const delta = Math.min((time - lastTime) / 1000 || 0, 0.05);
      lastTime = time;
      if (state.lastBall !== previousBall || state.revealing !== previousReveal) {
        previousBall = state.lastBall;
        previousReveal = state.revealing;
        actionElapsed = 0;
        currentShot = state.lastBall && !state.lastBall.wicket ? deliveryShotPlan(state.lastBall) : null;
        currentReturn = currentShot?.chase ? returnTimeline(state.lastBall, currentShot) : null;
        currentPresentationMs = currentReturn ? currentReturn.caughtAt + (state.lastBall.directHit ? 1400 : 350) : presentationDuration(state.lastBall);
        currentOutcomeMs = state.lastBall?.overthrow ? currentReturn.runningEnd : outcomeDuration(state.lastBall);
        trail.forEach((point) => point.position.set(0, -2, 0));
      }
      if (running && !document.hidden && state.motion) actionElapsed += delta * 1000;
      const elapsed = actionElapsed / 1000;
      if (state.tossStage !== previousTossStage) {
        previousTossStage = state.tossStage;
        tossStageStarted = time;
        if (state.tossStage === "flipping") tossStarted = time;
      }
      if (state.ceremony !== previousCeremony) {
        previousCeremony = state.ceremony;
        ceremonyElapsed = 0;
        completedCeremony = null;
      }
      if (running && !document.hidden && state.motion) ceremonyElapsed += delta * 1000;
      const compact = camera.aspect < 1.25;
      const delivery = state.lastBall;
      const boundary = [4, 5, 6].includes(delivery?.runs);
      const progress = state.motion ? Math.min(elapsed / (currentOutcomeMs / 1000), 1) : 1;
      const dismissal = delivery?.wicket && !state.revealing ? dismissalFrame(delivery.dismissal, progress, delivery.side, delivery.fielderIndex) : null;
      const battingRun = delivery && !delivery.wicket && !state.revealing ? deliveryRunningFrame(delivery, state.motion ? actionElapsed : currentOutcomeMs, currentReturn) : null;
      const approach = state.motion ? Math.min(elapsed / (DELIVERY_MS / 1000), 1) : 0.75;
      const direction = delivery?.side || 1;
      const cheering = !state.revealing && !state.ceremony && cheeringTeam(delivery) && (!state.motion || actionElapsed >= currentOutcomeMs && actionElapsed < currentPresentationMs) ? cheeringTeam(delivery) : null;
      const fieldTime = state.motion ? actionElapsed : currentPresentationMs;
      const safeHit = !!delivery?.directHit && !state.revealing && !state.ceremony && fieldTime >= currentReturn?.hitAt;
      const noBallSignal = delivery?.runs === 5 && !state.revealing && !state.ceremony && (!state.motion || actionElapsed >= 1700 && actionElapsed < 3300);
      host.dataset.umpireSignal = noBallSignal ? "no-ball" : safeHit ? "not-out" : "none";
      squads.flat().forEach((player) => { player.visible = false; });
      trophies.forEach((trophy) => { trophy.visible = false; });
      cheerSquads.flat().forEach((dancer) => { dancer.visible = false; });
      presenter.visible = false;
      stages.forEach((stage) => { stage.visible = !state.ceremony; });
      awardCarpet.visible = state.ceremony === "award";
      host.dataset.chaser = "none";
      host.dataset.returnStage = "none";
      delete host.dataset.keeperCatchGap;
      delete host.dataset.chasePosition;
      delete host.dataset.chaseFacing;
      delete host.dataset.chaseSpeed;
      allPlayers.forEach((player) => {
        player.position.copy(player.userData.home);
        player.visible = true;
        player.rotation.set(0, 0, 0);
        pose(player);
      });
      umpireFinger.visible = false;
      runningBat.rotation.x = 0;
      bowler.rotation.y = Math.PI;
      keeper.userData.legs.forEach((leg) => { leg.rotation.x = -0.25; });
      keeper.userData.knees.forEach((knee) => { knee.rotation.x = 0.5; });
      keeper.position.y = -0.05;
      batter.rotation.y = -0.25;
      batter.userData.arms.forEach((arm) => { arm.rotation.x = -0.35; });
      batter.userData.elbows.forEach((elbow) => { elbow.rotation.x = -0.5; });
      bat.rotation.x = -0.1;
      const breath = state.motion ? Math.sin(time * 0.002) * 0.008 : 0;
      batter.userData.torso.scale.y = 1 + breath;
      reach(batter, [[-0.18, 1.26, -0.43], [-0.06, 1.34, -0.43]]);
      ball.visible = state.revealing || !!delivery;
      if (state.revealing) {
        const runUp = Math.min(approach / 0.48, 1);
        const flight = Math.max(0, (approach - 0.48) / 0.52);
        pose(bowler, state.motion && runUp < 1 ? Math.sin(runUp * Math.PI * 6) : 0);
        bowler.position.z = -18 + runUp * 9;
        bowler.userData.arms[1].rotation.x = runUp > 0.65 ? -(runUp - 0.65) / 0.35 * Math.PI - flight * Math.PI : bowler.userData.arms[1].rotation.x;
        bowler.userData.elbows[1].rotation.x = 0;
        const short = /short|bouncer/.test(state.bowlingLength);
        const full = /full|yorker/.test(state.bowlingLength);
        const bounce = short ? 0.48 : full ? 0.9 : 0.72;
        const height = flight < bounce ? 2.6 * (1 - flight / bounce) : 0.17 + (flight - bounce) / (1 - bounce) * (short ? 1.7 : full ? 0.1 : 0.65);
        ball.visible = approach >= 0.48;
        ball.position.set(-0.36 * (1 - flight) + Math.sin(flight * Math.PI) * 0.22, Math.max(0.17, height), -8.5 + flight * 15.5);
        batter.userData.arms[0].rotation.x = -0.35 - flight * 0.65;
        bat.rotation.x = -flight * 0.7;
        reach(batter, [[-0.25, 1.28 + flight * 0.4, -0.28], [-0.13, 1.36 + flight * 0.4, -0.28]]);
      } else if (delivery) {
        const shotProgress = state.motion ? Math.min(elapsed / 1.7, 1) : 1;
        const travel = 1 - Math.pow(1 - shotProgress, 1.4);
        ball.position.set(delivery.wicket ? 0 : direction * travel * (boundary ? 32 : 8 + delivery.runs * 1.7),
          delivery.wicket ? 0.25 : 0.2 + Math.sin(travel * Math.PI) * (delivery.runs === 6 ? 14 : boundary ? 0.65 : 0.4),
          delivery.wicket ? 7 + Math.min(progress * 5, 1) * 1.4 : 7 - travel * (delivery.runs === 6 ? 15 : 21));
        if (currentShot) {
          ball.position.set(currentShot.target[0] * travel, 0.2 + Math.sin(travel * Math.PI) * (delivery.runs === 6 ? 14 : 0.45), 7 + (currentShot.target[2] - 7) * travel);
        }
        const swing = state.motion ? Math.sin(Math.min(shotProgress * 2.6, 1) * Math.PI) : 0;
        batter.rotation.y = -0.25 + direction * swing * 1.2;
        batter.userData.arms.forEach((arm) => { arm.rotation.x = -0.35 - swing * (delivery.runs === 6 ? 2.1 : 1.2); });
        bat.rotation.x = -swing * 1.3;
        batter.userData.legs[0].rotation.x = -swing * 0.4;
        reach(batter, [[-0.18 + swing * 0.4, 1.25 + swing * 0.6, -0.43], [-0.06 + swing * 0.4, 1.33 + swing * 0.6, -0.43]]);
        bowler.position.z = -8 + Math.min(progress * 2, 1) * 2;
        if (delivery.wicket) {
          pose(bowler, 0, state.motion ? Math.sin(Math.min(progress * 2, 1) * Math.PI / 2) : 1);
          pose(keeper, 0, 0.85);
        } else if (battingRun && !boundary) {
          batter.position.z = battingRun.batterZ;
          nonStriker.position.z = battingRun.runnerZ;
          batter.rotation.y = battingRun.batterFacing;
          nonStriker.rotation.y = battingRun.runnerFacing;
          pose(batter, battingRun.stride);
          pose(nonStriker, -battingRun.stride);
        }
        if (currentShot?.chase) {
          const fielder = fielders[currentShot.fielderIndex];
          const target = [currentShot.target[0], 0.05, currentShot.target[2]];
          const chase = chaseFrame(fielder.userData.home.toArray(), target, state.motion ? elapsed * 1000 : 100000);
          fielder.position.set(...chase.position);
          fielder.rotation.set(0, chase.facing, 0);
          pose(fielder, state.motion && chase.moving ? Math.sin(chase.travelled * 2.9) * 0.85 : 0);
          const pickup = THREE.MathUtils.clamp((fieldTime - currentReturn.pickupAt) / 650, 0, 1);
          const windup = THREE.MathUtils.smoothstep(fieldTime, currentReturn.releaseAt - 450, currentReturn.releaseAt);
          const returning = THREE.MathUtils.clamp((fieldTime - currentReturn.releaseAt) / currentReturn.flightMs, 0, 1);
          host.dataset.returnStage = fieldTime < currentReturn.pickupAt ? "chase" : pickup < 1 ? "gather" : fieldTime < currentReturn.releaseAt ? "set" : returning < 1 ? "throw" : "caught";
          if (chase.arrived && fieldTime >= currentReturn.pickupAt) {
            const throwFacing = Math.atan2(fielder.position.x, fielder.position.z - 10.5);
            fielder.rotation.y = chase.facing + Math.atan2(Math.sin(throwFacing - chase.facing), Math.cos(throwFacing - chase.facing)) * pickup;
            fielder.userData.torso.rotation.x = -Math.sin(pickup * Math.PI) * 0.45;
            reach(fielder, [[-0.24, 0.3 + pickup * 1.1 + windup * 0.6, -0.35 - windup * 0.2], [0.3, 1.1, -0.15]]);
            fielder.updateWorldMatrix(true, true);
            fielder.userData.hands[0].getWorldPosition(handContact);
            if (fieldTime < currentReturn.releaseAt) {
              ball.position.set(...currentShot.target).lerp(handContact, pickup);
            } else {
              throwRelease.copy(handContact);
              keeper.rotation.y = Math.atan2(-target[0], 11 - target[2]);
              reach(keeper, [[-0.09, 1.1, -0.5], [0.09, 1.1, -0.5]]);
              keeper.updateWorldMatrix(true, true);
              keeper.userData.hands[0].getWorldPosition(handContact);
              keeper.userData.hands[1].getWorldPosition(otherHand);
              handContact.lerp(otherHand, 0.5);
              if (delivery.overthrow) {
                const miss = [delivery.side * 1.4, 0.75, 8.4];
                const loose = [delivery.side * 4, 0.2, 17];
                if (fieldTime < currentReturn.missAt) {
                  ball.position.copy(throwRelease).lerp(new THREE.Vector3(...miss), returning);
                  ball.position.y += Math.sin(returning * Math.PI) * 1.5;
                } else {
                  const past = THREE.MathUtils.clamp((fieldTime - currentReturn.missAt) / 800, 0, 1);
                  ball.position.set(...miss).lerp(new THREE.Vector3(...loose), past);
                  ball.position.y += Math.sin(past * Math.PI) * 0.25;
                  const retrieve = chaseFrame([0, 0.05, 11], [loose[0], 0.05, loose[2]], fieldTime - currentReturn.missAt - 550);
                  keeper.position.set(...retrieve.position);
                  keeper.rotation.y = retrieve.facing;
                  pose(keeper, state.motion && retrieve.moving ? Math.sin(retrieve.travelled * 2.9) * 0.7 : 0);
                  const gather = THREE.MathUtils.clamp((fieldTime - currentReturn.caughtAt + 650) / 650, 0, 1);
                  reach(keeper, [[-0.09, 0.25 + gather * 0.85, -0.3], [0.09, 0.25 + gather * 0.85, -0.3]]);
                  keeper.updateWorldMatrix(true, true);
                  keeper.userData.hands[0].getWorldPosition(handContact);
                  keeper.userData.hands[1].getWorldPosition(otherHand);
                  handContact.lerp(otherHand, 0.5);
                  if (retrieve.arrived) ball.position.lerp(handContact, gather);
                  host.dataset.returnStage = gather === 1 ? "retrieved" : "overthrow";
                }
              } else if (delivery.directHit) {
                const stumps = new THREE.Vector3(0, 0.7, 8.4);
                if (!safeHit) {
                  ball.position.copy(throwRelease).lerp(stumps, returning);
                  ball.position.y += Math.sin(returning * Math.PI) * 1.5;
                } else {
                  const rebound = THREE.MathUtils.clamp((fieldTime - currentReturn.hitAt) / 450, 0, 1);
                  ball.position.copy(stumps).lerp(handContact, rebound);
                  ball.position.y += Math.sin(rebound * Math.PI) * 0.3;
                  host.dataset.returnStage = "safe-hit";
                }
              } else {
                ball.position.copy(throwRelease).lerp(handContact, returning);
                ball.position.y += Math.sin(returning * Math.PI) * 2.3;
              }
              if (fieldTime >= currentReturn.caughtAt) host.dataset.keeperCatchGap = ball.position.distanceTo(handContact).toFixed(3);
              fielder.userData.arms[0].rotation.x -= Math.sin(Math.min(returning * 4, 1) * Math.PI) * 0.7;
            }
          }
          host.dataset.chaser = String(currentShot.fielderIndex);
          host.dataset.chasePosition = JSON.stringify(chase.position);
          host.dataset.chaseFacing = String(chase.facing);
          host.dataset.chaseSpeed = String(FIELDER_SPEED);
        }
      }
      if (dismissal) {
        const kind = delivery.dismissal;
        const fielder = kind === "caught" && delivery.fielderIndex === KEEPER_INDEX ? keeper : fielders[delivery.fielderIndex] || fielders[0];
        ball.position.set(...dismissal.ball);
        ball.visible = dismissal.ballVisible;
        batter.position.set(...dismissal.batter);
        nonStriker.position.set(...dismissal.runner);
        fielder.position.set(...dismissal.fielder);
        fielder.rotation.set(0, 0, 0);
        pose(bowler, 0, dismissal.appeal || dismissal.celebrate);
        pose(keeper, 0, dismissal.appeal || dismissal.celebrate * 0.7);
        pose(umpire);
        umpire.userData.arms[1].rotation.x = -Math.PI * dismissal.signal;
        umpire.userData.elbows[1].rotation.x = 0;
        umpireFinger.visible = dismissal.signal > 0.5;
        batter.userData.head.rotation.x = progress > 0.6 ? 0.25 : 0;
        if (kind === "caught") {
          pose(fielder, state.motion && progress < 0.5 ? Math.sin(progress * 35) * 0.4 : 0);
          fielder.position.y = 0.05 + (state.motion ? Math.sin(Math.min(1, Math.max(0, (progress - 0.42) / 0.26)) * Math.PI) * 0.16 : 0);
          reach(fielder, [[-0.09, 1.25 + dismissal.catchReach * 0.85, -0.4], [0.09, 1.25 + dismissal.catchReach * 0.85, -0.4]]);
          if (progress >= 0.6) {
            fielder.updateWorldMatrix(true, true);
            fielder.userData.hands[0].getWorldPosition(handContact);
            fielder.userData.hands[1].getWorldPosition(otherHand);
            ball.position.copy(handContact).lerp(otherHand, 0.5);
          }
          batter.rotation.y = -0.25 + direction * dismissal.swing;
          reach(batter, [[0.05, 1.4 + dismissal.swing * 0.5, -0.4], [0.15, 1.45 + dismissal.swing * 0.5, -0.4]]);
        } else if (kind === "lbw") {
          batter.userData.legs[0].rotation.x = -0.32;
          batter.userData.knees[0].rotation.x = 0.42;
          batter.userData.torso.rotation.x = -0.12;
          reach(batter, [[-0.18, 1.15, -0.3], [-0.06, 1.23, -0.3]]);
          bat.rotation.x = -0.45;
        } else if (kind === "runout") {
          pose(batter, state.motion ? Math.sin(dismissal.run * Math.PI * 12) * (1 - dismissal.dive) : 0);
          pose(nonStriker, state.motion ? Math.sin(dismissal.run * Math.PI * 12 + Math.PI) : 0);
          nonStriker.rotation.y = Math.PI;
          batter.rotation.x = -dismissal.dive * 1.05;
          batter.position.y = 0.05 - dismissal.dive * 0.3;
          reach(batter, [[-0.2, 1.55, -0.55], [0.2, 1.55, -0.55]]);
          bat.rotation.x = -Math.PI / 2 * dismissal.dive;
          pose(fielder, state.motion && progress < 0.3 ? Math.sin(progress * 30) * 0.45 : 0);
          fielder.userData.torso.rotation.x = -Math.sin(Math.min(progress / 0.42, 1) * Math.PI) * 0.65;
          fielder.userData.arms[1].rotation.x = -Math.PI * dismissal.throwArm;
          fielder.userData.elbows[1].rotation.x = 0;
          reach(nonStriker, [[-0.2, 1.2, -0.45], [0.2, 1.3, -0.3]]);
        } else {
          batter.userData.head.rotation.y = -0.7 * Math.min(progress * 2, 1);
          batter.rotation.y = -0.25 - progress * 0.6;
        }
      }
      if (noBallSignal) {
        const signal = state.motion ? THREE.MathUtils.smoothstep(actionElapsed, 1700, 2050) : 1;
        umpire.userData.arms[0].rotation.set(0, 0, Math.PI / 2 * signal);
        umpire.userData.elbows[0].rotation.set(0, 0, 0);
      } else if (safeHit) {
        const signalTime = fieldTime - currentReturn.hitAt;
        umpire.userData.head.rotation.y = state.motion ? Math.sin(signalTime * 0.009) * 0.3 : -0.2;
        reach(umpire, [[-0.32, 1.15, -0.4], [0.32, 1.15, -0.4]]);
        umpireFinger.visible = false;
      }
      ball.rotation.x += state.motion ? delta * 8 : 0;
      bails.forEach((bail, index) => {
        const hit = dismissal?.brokenEnd === Math.floor(index / 2) || safeHit && Math.floor(index / 2) === 1;
        const fall = safeHit ? THREE.MathUtils.clamp((fieldTime - currentReturn.hitAt) / 650, 0, 1) : dismissal?.bails || 0;
        bail.position.set(bail.userData.homeX + (hit ? (index % 2 ? 1 : -1) * fall * 1.4 : 0),
          hit ? 1.37 + Math.sin(fall * Math.PI) * 1.6 - fall * 1.2 : 1.37, hit ? fall * 1.5 : 0);
        bail.rotation.z = hit ? fall * 3 : 0;
      });
      trail.forEach((point, index) => {
        point.visible = state.motion && ball.visible && dismissal?.stage !== "held" && (state.revealing || progress < 1);
        if (point.visible) point.position.lerp(index ? trail[index - 1].position : ball.position, 0.45);
      });
      wicketGroups.forEach((group, end) => group.children.slice(0, 3).forEach((stump) => { stump.material = dismissal?.brokenEnd === end ? red : amber; }));
      battingKit.color.set(TEAM_COLORS[state.batting]);
      bowlingKit.color.set(TEAM_COLORS[state.batting === "you" ? "computer" : "you"]);
      if (state.phase === "setup" || state.phase === "ready") {
        ball.visible = false;
      }
      const tossing = state.tossStage !== "none" && !state.ceremony;
      captains.forEach((captain, index) => {
        captain.visible = tossing;
        captain.position.copy(captain.userData.home);
        captain.rotation.set(0, index ? Math.PI / 3 : -Math.PI / 3, 0);
        pose(captain);
        captain.userData.head.rotation.x = state.tossStage === "flipping" ? -0.25 : 0.15;
      });
      coin.visible = tossing && ["flipping", "landed", "result"].includes(state.tossStage);
      coinFaces.forEach((face) => { face.visible = state.tossCoin != null; });
      host.dataset.coinFace = coin.visible && state.tossCoin != null ? state.tossCoin : "hidden";
      if (tossing) {
        allPlayers.forEach((player) => { player.visible = player === umpire; });
        umpire.position.set(0, 0.05, -0.6);
        umpire.rotation.set(0, Math.PI, 0);
        pose(umpire);
        reach(umpire, [[-0.2, 1.3, -0.5], [0.2, 1.3, -0.5]]);
        umpireFinger.visible = false;
        ball.visible = false;
        const tossElapsed = synchronizedElapsed(state.tossTiming?.startedAt, state.tossTiming?.serverOffset) ?? time - tossStarted;
        const handshakeElapsed = synchronizedElapsed(state.tossTiming?.stageStartedAt, state.tossTiming?.serverOffset) ?? time - tossStageStarted;
        const flight = state.tossStage === "flipping" && state.motion ? Math.min(tossElapsed / TOSS_MS, 1) : 1;
        host.dataset.tossProgress = flight.toFixed(3);
        const flip = state.tossStage === "flipping";
        const coinFrame = tossFrame(flight);
        coin.position.set(0, coinFrame.height, 0.65);
        coin.rotation.set(-Math.PI / 2 + (flip ? coinFrame.spin : 0), state.tossCoin === "tails" ? Math.PI : 0, 0);
        umpire.userData.arms[1].rotation.x -= flip ? Math.sin(flight * Math.PI) * 0.6 : 0;
        if (state.tossStage === "handshake" || state.tossStage === "complete") {
          shakeHands(captains, state.motion && state.tossStage === "handshake" ? Math.min(handshakeElapsed / HANDSHAKE_MS, 1) : 0.6);
          umpire.position.z = -1.8;
        }
      }
      if (cheering && !tossing) {
        ball.visible = false;
        const cheerIndex = cheering === "you" ? 0 : 1;
        cheerSquads[cheerIndex].forEach((dancer, index) => {
          dancer.visible = true;
          dancer.position.copy(dancer.userData.home);
          dancer.rotation.set(0, Math.PI, 0);
          const beat = state.motion ? (actionElapsed - currentOutcomeMs) / 1000 * Math.PI * 3 : Math.PI / 2;
          const step = Math.sin(beat);
          pose(dancer, step * 0.2);
          dancer.position.x += step * 0.16;
          dancer.position.y += Math.max(0, Math.sin(beat * 2)) * 0.08;
          dancer.userData.arms[0].rotation.set(-0.15, 0, 1.7 + Math.sin(beat + (index % 2) * Math.PI) * 0.65);
          dancer.userData.arms[1].rotation.set(-0.15, 0, -1.7 - Math.sin(beat + (index % 2) * Math.PI) * 0.65);
          dancer.userData.elbows.forEach((elbow) => { elbow.rotation.x = -0.25; });
          dancer.userData.torso.rotation.z = step * 0.06;
        });
      }
      if (state.ceremony) {
        allPlayers.forEach((player) => { player.visible = false; });
        coin.visible = ball.visible = false;
        umpire.position.set(2.2, 0.05, -1.5);
        umpire.rotation.set(0, Math.PI, 0);
        pose(umpire);
        umpireFinger.visible = false;
        const ceremonyTime = state.motion ? ceremonyElapsed : state.ceremony === "victory" ? 7400 : POST_MATCH_MS / 2;
        if (state.ceremony === "victory") {
          squads.forEach((team, teamIndex) => team.forEach((player, index) => {
            const reaction = victoryFrame(index, teamIndex, state.winner, ceremonyTime);
            player.visible = true;
            player.position.set(...reaction.position);
            player.rotation.set(0, reaction.facing, 0);
            pose(player, state.motion ? reaction.stride : 0, reaction.celebration);
            player.position.y = state.motion ? reaction.position[1] : 0.05;
            if (reaction.won) {
              player.userData.elbows.forEach((elbow, armIndex) => { elbow.rotation.x -= reaction.celebration * (0.25 + (index + armIndex) % 3 * 0.1); });
              player.userData.head.rotation.y = state.motion ? Math.sin(ceremonyTime * 0.0018 + index) * 0.12 : 0;
            }
            if (reaction.sad) {
              player.userData.head.rotation.x = -0.32;
              player.userData.torso.rotation.x = -0.12;
              player.userData.arms.forEach((arm) => { arm.rotation.z *= 0.2; });
            }
          }));
          host.dataset.victoryStage = victoryFrame(0, 0, state.winner, ceremonyTime).stage;
        } else if (state.ceremony === "handshakes") {
          squads.forEach((team, teamIndex) => team.forEach((player, index) => {
            const line = handshakeLineFrame(index, teamIndex, ceremonyTime);
            player.visible = true;
            player.position.set(...line.position).add(ceremonyOrigin);
            player.rotation.set(0, line.partner !== null ? teamIndex ? Math.PI / 2 : -Math.PI / 2 : line.facing, 0);
            pose(player, state.motion && line.walking ? Math.sin(line.beat * Math.PI * 2) * 0.45 : 0);
            if (line.partner !== null) {
              const contact = [ceremonyOrigin.x, 1.36 + (state.motion ? Math.sin(line.beat * 32) * 0.025 : 0), line.position[2] + ceremonyOrigin.z];
              const resting = player.localToWorld(new THREE.Vector3(0.36, 1.03, 0)).toArray();
              reachWorld(player, [contact, resting]);
              player.userData.head.rotation.x = 0.05;
            }
          }));
        } else {
          const winners = state.awardTeams.split(",").filter(Boolean);
          const winnerIndex = state.motion ? Math.min(winners.length - 1, Math.floor(ceremonyTime / 6500)) : winners.length - 1;
          const awardTime = state.motion ? ceremonyTime - winnerIndex * 6500 : 6000;
          const award = awardFrame(awardTime);
          const recipient = captains[winners[winnerIndex] === "you" ? 0 : 1];
          presenter.visible = recipient.visible = true;
          presenter.position.set(award.presenterX, 0.05, 0).add(ceremonyOrigin);
          recipient.position.set(award.recipientX, 0.05, 0).add(ceremonyOrigin);
          presenter.rotation.set(0, Math.PI / 2 + award.lift * Math.PI / 2, 0);
          recipient.rotation.set(0, -Math.PI / 2 - award.lift * Math.PI / 2, 0);
          pose(presenter, award.stage === "approach" ? Math.sin(awardTime * 0.009) * 0.35 : 0);
          pose(recipient, award.stage === "approach" ? -Math.sin(awardTime * 0.009) * 0.35 : 0);
          const trophy = trophies[0];
          trophy.visible = true;
          const holder = award.owner === "presenter" ? presenter : recipient;
          const height = award.owner === "presenter" ? 1.35 : 1.3 + award.lift * 0.65;
          const forward = award.owner === "presenter" ? -0.35 - award.offer * 0.17 : -0.52;
          holder.updateWorldMatrix(true, false);
          const grips = [-0.16, 0.16].map((offset) => holder.localToWorld(new THREE.Vector3(offset, height, forward)).toArray());
          holdTrophy(holder, trophy, grips);
          const receiving = award.offer > 0.65 && award.lift < 0.12;
          if (receiving) reachWorld(holder === presenter ? recipient : presenter, [...grips].reverse());
          if (receiving) {
            presenter.updateWorldMatrix(true, true);
            recipient.updateWorldMatrix(true, true);
            presenter.userData.hands[0].getWorldPosition(handContact);
            recipient.userData.hands[1].getWorldPosition(otherHand);
            host.dataset.handoverGap = handContact.distanceTo(otherHand).toFixed(3);
          } else delete host.dataset.handoverGap;
          host.dataset.trophyOwner = award.owner;
          host.dataset.awardStage = award.stage;
          host.dataset.presenter = "black-suit";
          host.dataset.awardRecipient = winners[winnerIndex];
        }
      }
      if (tossing || cheering || state.ceremony) trail.forEach((point) => { point.visible = false; });
      const pitchView = state.cameraView === "pitch";
      const director = state.cameraView === "director";
      const drift = state.motion ? Math.sin(time * 0.00016) * 0.4 + pointer.x * 0.4 : 0;
      let cameraShot = "AERIAL / WIDE";
      cameraTarget.set(compact ? 32 : 33, compact ? 47 : 32, compact ? 56 : 42);
      lookTarget.set(0, 0, 0);
      if (pitchView || director) {
        cameraTarget.set(pitchView ? 4 : -2 + drift, compact ? 7 : 5.5, pitchView ? 25 : -28);
        lookTarget.set(0, 1, pitchView ? -2 : 3);
        cameraShot = pitchView ? "CREASE / FIXED" : "END ON / LIVE";
        if (director && !state.revealing && delivery) {
          if (delivery.wicket) {
            cameraTarget.set(...dismissal.camera);
            lookTarget.set(...dismissal.look);
            if (compact) cameraTarget.addScaledVector(cameraTarget.clone().sub(lookTarget), 0.35);
            cameraShot = dismissal.shot;
          } else {
            cameraTarget.set(direction * (compact ? 20 : 23), delivery.runs === 6 ? 20 : 13, 25);
            lookTarget.set(ball.position.x * 0.55, Math.max(1, ball.position.y * 0.6), ball.position.z * 0.5);
            cameraShot = boundary ? "BOUNDARY / TRACKING" : "BETWEEN WICKETS / RUNNING";
            if (boundary && currentShot) {
              cameraTarget.set(direction * (compact ? 34 : 27), delivery.runs === 6 ? 26 : 22, 13);
              lookTarget.set(currentShot.target[0] * 0.42, delivery.runs === 6 ? 5 : 0.7, currentShot.target[2] * 0.42);
              cameraShot = `BOUNDARY / ${currentShot.sector.toUpperCase()}`;
            }
            if (!boundary) {
              cameraTarget.set(compact ? 23 : 19, compact ? 20 : 12, 16);
              lookTarget.set(0, 0.8, 0);
            }
          }
        }
      }
      if (director && state.phase === "setup" && !tossing && !state.ceremony) {
        cameraTarget.set(compact ? -3.8 : -3.4, compact ? 2.75 : 2.45, compact ? 1.1 : 2.2);
        lookTarget.set(0.5, 1.05, 7);
        cameraShot = "AT THE CREASE / PLAYER VIEW";
      }
      if (tossing) {
        cameraTarget.set(4, 4.3, 8);
        lookTarget.set(0, 1.7, 0);
        if (compact) cameraTarget.addScaledVector(cameraTarget.clone().sub(lookTarget), 0.3);
        cameraShot = state.tossStage === "flipping" ? "TOSS / COIN IN FLIGHT" : "TOSS / CAPTAINS";
        if (["landed", "result"].includes(state.tossStage)) {
          cameraTarget.set(0, compact ? 2.2 : 1.9, 1.35);
          lookTarget.set(0, 0.11, 0.65);
          cameraShot = "TOSS / ON THE GROUND";
        }
        if (state.tossStage === "handshake") cameraShot = "TOSS / CAPTAINS HANDSHAKE";
      }
      if (!tossing && !state.ceremony && director && (noBallSignal || safeHit || delivery?.overthrow && !state.revealing)) {
        const umpireView = noBallSignal || safeHit && fieldTime > currentReturn.hitAt + 550;
        cameraTarget.set(umpireView ? 6 : compact ? 23 : 18, umpireView ? 3.2 : compact ? 21 : 12, umpireView ? -17 : 23);
        lookTarget.set(umpireView ? 1.3 : 0, 1, umpireView ? -11 : 4);
        if (umpireView && compact) cameraTarget.addScaledVector(cameraTarget.clone().sub(lookTarget), 0.35);
        cameraShot = noBallSignal ? "UMPIRE / NO BALL" : safeHit ? umpireView ? "UMPIRE / NOT OUT" : "DIRECT HIT / SAFE" : "OVERTHROW / EXTRA RUNS";
      }
      if (cheering && !tossing) {
        const [positionX, positionZ] = CHEER_STAGE_CENTRES[cheering === "you" ? 0 : 1];
        cameraTarget.set(positionX + 0.5, compact ? 5.2 : 4.1, positionZ + (compact ? 14 : 10.5));
        lookTarget.set(positionX, 1.65, positionZ);
        cameraShot = `${state.teamNames?.[cheering] || (cheering === "you" ? "YOUR XI" : "COMPUTER XI")} / BOUNDARY STAGE`;
      }
      if (state.ceremony) {
        cameraTarget.set(state.ceremony === "award" ? 1.4 : 8, state.ceremony === "award" ? 3.2 : 7, state.ceremony === "award" ? 8 : 15);
        lookTarget.set(0, 1.2, 0);
        cameraTarget.add(ceremonyOrigin);
        lookTarget.add(ceremonyOrigin);
        if (compact) cameraTarget.addScaledVector(cameraTarget.clone().sub(lookTarget), 0.25);
        cameraShot = state.ceremony === "award" ? "PRESENTATION / MAN OF THE MATCH" : "FULL TIME / TEAM HANDSHAKES";
        if (state.ceremony === "victory") {
          const assemble = THREE.MathUtils.smoothstep(ceremonyElapsed, 9000, VICTORY_MS);
          cameraTarget.lerp(new THREE.Vector3(compact ? 36 : 32, compact ? 32 : 24, compact ? 46 : 38), 1 - assemble);
          lookTarget.lerp(new THREE.Vector3(15, state.winner === "tie" ? 1.2 : 8, 1), 1 - assemble);
          cameraShot = state.winner === "tie" ? "FULL TIME / HONOURS EVEN" : "FULL TIME / WINNING XI";
        }
      }
      lightTowers.forEach((tower) => { tower.visible = !state.ceremony && (pitchView || director || !tower.userData.nearSide); });
      fireworks.visible = state.ceremony === "victory" && state.winner !== "tie" && state.motion && ceremonyElapsed < 9000;
      let litSparks = 0;
      if (fireworks.visible) {
        for (let spark = 0; spark < sparkCount; spark++) {
          const burst = Math.floor(spark / 192);
          const particle = Math.floor(spark % 192 / 3);
          const tail = spark % 3;
          const age = (ceremonyElapsed - 700 - burst * 1700) / 1000 - tail * 0.055;
          const launched = age >= 0 && age < 0.7;
          const exploded = age >= 0.7 && age < 2.9;
          const flight = Math.max(0, age - 0.7);
          const vertical = 1 - 2 * (particle + 0.5) / 64;
          const radial = Math.sqrt(1 - vertical * vertical);
          const angle = particle * 2.3999632297;
          const originX = -3 + burst % 3 * 14;
          const originZ = -37 - burst % 2 * 3;
          const height = 16 + burst % 2 * 3;
          const visible = exploded || launched && particle === 0;
          const fade = visible ? (1 - Math.max(0, flight) / 2.2) * (1 - tail * 0.28) * 2.5 : 0;
          sparkPositions[spark * 3] = originX + (exploded ? Math.cos(angle) * radial * 4 * flight : 0);
          sparkPositions[spark * 3 + 1] = launched ? 1 + age / 0.7 * (height - 1) : height + vertical * 4 * flight - 1.25 * flight * flight;
          sparkPositions[spark * 3 + 2] = originZ + (exploded ? Math.sin(angle) * radial * 4 * flight : 0);
          sparkColors[spark * 3] = fade * (burst % 2 ? 0.35 : 1);
          sparkColors[spark * 3 + 1] = fade * (burst % 2 ? 0.8 : 0.65);
          sparkColors[spark * 3 + 2] = fade * (burst % 2 ? 1 : 0.2);
          if (visible) litSparks++;
        }
        sparkGeometry.attributes.position.needsUpdate = true;
        sparkGeometry.attributes.color.needsUpdate = true;
      }
      host.dataset.fireworks = String(litSparks);
      const cut = (director || tossing || cheering || state.ceremony) && cameraShot !== previousShot && cameraShot !== "TOSS / ON THE GROUND";
      previousShot = cameraShot;
      const smoothing = state.motion && frame > 0 && !cut ? 1 - Math.exp(-delta * 5) : 1;
      camera.position.lerp(cameraTarget, smoothing);
      cameraLook.lerp(lookTarget, smoothing);
      camera.lookAt(cameraLook);
      host.dataset.shot = cameraShot;
      host.dataset.dismissal = dismissal ? delivery.dismissal : "none";
      host.dataset.stage = dismissal?.stage || (state.revealing ? "delivery" : "ready");
      host.dataset.runsCompleted = String(battingRun?.completed || 0);
      host.dataset.fielder = dismissal ? String(delivery.fielderIndex) : "none";
      host.dataset.toss = state.tossStage;
      host.dataset.cheering = cheering || "none";
      host.dataset.ceremony = state.ceremony || "none";
      host.dataset.teams = `${teamKits.you.color.getHexString()},${teamKits.computer.color.getHexString()}`;
      host.dataset.battingKit = battingKit.color.getHexString();
      host.dataset.bowlingKit = bowlingKit.color.getHexString();
      host.dataset.umpireKit = umpireKit.color.getHexString();
      host.dataset.coinHeight = coin.position.y.toFixed(2);
      host.dataset.squadPlayers = String(squads.flat().filter((player) => player.visible).length);
      host.dataset.presenterVisible = String(presenter.visible);
      host.dataset.umpireVisible = String(umpire.visible);
      host.dataset.shotSector = currentShot?.sector || "none";
      host.dataset.shotTarget = currentShot ? JSON.stringify(currentShot.target) : "none";
      host.dataset.ceremonyOrigin = state.ceremony ? JSON.stringify(CEREMONY_ORIGIN) : "none";
      host.dataset.ceremonyPlayerPositions = state.ceremony ? JSON.stringify(squads.flat().filter((player) => player.visible).map((player) => player.position.toArray())) : "[]";
      host.dataset.movingFielders = currentShot?.chase && !state.revealing && !state.ceremony ? "1" : "0";
      host.dataset.ceremonyElapsed = String(Math.round(ceremonyElapsed));
      host.dataset.presentationElapsed = String(Math.round(actionElapsed));
      host.dataset.winner = state.winner;
      if (state.ceremony === "handshakes") {
        const line = handshakeLineFrame(5, 0, state.motion ? ceremonyElapsed : POST_MATCH_MS / 2);
        if (line.partner !== null) {
          squads[0][5].updateWorldMatrix(true, true);
          squads[1][line.partner].updateWorldMatrix(true, true);
          squads[0][5].userData.hands[0].getWorldPosition(handContact);
          squads[1][line.partner].userData.hands[0].getWorldPosition(otherHand);
          host.dataset.lineContactGap = handContact.distanceTo(otherHand).toFixed(3);
        } else delete host.dataset.lineContactGap;
      }
      if (state.tossStage === "handshake" || state.tossStage === "complete") {
        captains.forEach((captain) => captain.updateWorldMatrix(true, true));
        captains[0].userData.hands[0].getWorldPosition(handContact);
        captains[1].userData.hands[0].getWorldPosition(otherHand);
        host.dataset.handshakeGap = handContact.distanceTo(otherHand).toFixed(3);
      } else delete host.dataset.handshakeGap;
      renderer.render(scene, camera);
      if (running && !document.hidden && state.motion && !state.revealing && delivery && !state.ceremony && actionElapsed >= currentPresentationMs && completedDelivery !== delivery) {
        completedDelivery = delivery;
        state.onPresentationComplete?.(delivery);
      }
      const ceremonyDuration = state.ceremony === "victory" ? VICTORY_MS : state.ceremony === "handshakes" ? POST_MATCH_MS : Infinity;
      if (running && !document.hidden && state.motion && ceremonyElapsed >= ceremonyDuration && completedCeremony !== state.ceremony) {
        completedCeremony = state.ceremony;
        state.onCeremonyComplete?.(state.ceremony);
      }
      frame++;
      host.dataset.frame = String(frame);
    }

    function resize() {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    }
    function syncLoop() {
      renderer.setAnimationLoop(running && stateRef.current.motion && !document.hidden && !lost ? render : null);
      if (running && !document.hidden) resize();
    }
    function contextLost(event) {
      event.preventDefault();
      lost = true;
      renderer.setAnimationLoop(null);
      setUnavailable(true);
    }
    function contextRestored() {
      lost = false;
      setUnavailable(false);
      syncLoop();
    }
    function pointerMove(event) {
      const bounds = host.getBoundingClientRect();
      pointer.x = (event.clientX - bounds.left) / bounds.width - 0.5;
    }
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    host.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    renderer.domElement.addEventListener("webglcontextrestored", contextRestored);
    document.addEventListener("visibilitychange", syncLoop);
    engineRef.current = { render: syncLoop, setActive(value) { running = value; syncLoop(); } };
    resize();

    return () => {
      renderer.setAnimationLoop(null);
      engineRef.current = null;
      observer.disconnect();
      host.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", contextRestored);
      document.removeEventListener("visibilitychange", syncLoop);
      resources.forEach((resource) => resource.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => { engineRef.current?.setActive(active); }, [active]);

  return <div className="cricket-scene" ref={hostRef} data-renderer={unavailable ? "fallback" : "threejs"}>
    {unavailable && <div className="arena-fallback" role="status"><span className="fallback-crease" />3D view unavailable. The match is still in play.</div>}
  </div>;
}