// PBR material library — pastel, fabric-soft, photoreal response.
import * as THREE from 'three';

export const PALETTE = {
  wall: 0xd7e8f6,
  wallSun: 0xe4eef8,
  trim: 0xf1f7fc,
  floor: 0xffffff,
  woodLight: 0xd9b183,
  woodMid: 0xc49a6c,
  woodDark: 0x9a6f49,
  linen: 0xf8fbff,
  blueStripe: 0xb9d6f2,
  mint: 0xbfe6d4,
  rugYellow: 0xf6ce6f,
  rugMint: 0xbfe7d5,
  desk: 0xb2a3ba,
  metalGrey: 0xa9a2b2,
  brass: 0xc8a35f,
  paper: 0xfdfbf4,
  cardboard: 0xd3b087,
  potPurple: 0xa678d6,
  leaf: 0x5f9e58,
  leafLight: 0x86c078,
  soil: 0x4a3428,
  pink: 0xf2b3c7,
  green: 0xa9d59b,
  lavender: 0xb9a8d8,
  cream: 0xf6efdf,
  lampYellow: 0xf7d98a,
  glass: 0xd8efff,
  black: 0x2b2a36
};

export function createMaterials(lib) {
  const T = (n, o) => lib.get(n, o);
  const floor = T('floor');
  const wall = T('wall');
  const ceiling = T('ceiling');
  const fabric = T('fabric');
  const duvetTex = T('duvet');
  const pillowTex = T('pillowStripe');
  const rugY = T('rugYellow');
  const rugM = T('rugMint');
  const paperTex = T('paper');
  const metalTex = T('metal');
  const cardboardTex = T('cardboard');
  const ceramicTex = T('ceramic');
  const woodLightTex = T('wood', { color: '#d8ae7e', contrast: 0.8 });
  const woodMidTex = T('wood', { color: '#c7a072', contrast: 0.85 });
  const woodDarkTex = T('wood', { color: '#9b7452', contrast: 1.05 });
  const plushTex = T('plush');

  const fabricPhysical = (color, { sheen = 0.55, rough = 0.92, tex = fabric, repeat = null, normalScale = 0.6 } = {}) => {
    const m = new THREE.MeshPhysicalMaterial({
      color, roughness: rough, metalness: 0,
      map: tex.map, normalMap: tex.normalMap,
      normalScale: new THREE.Vector2(normalScale, normalScale),
      sheen, sheenRoughness: 0.75, sheenColor: new THREE.Color(0xffffff),
      envMapIntensity: 0.55
    });
    if (repeat) { m.map = tex.map.clone(); m.normalMap = tex.normalMap.clone(); m.map.repeat.set(repeat[0], repeat[1]); m.normalMap.repeat.set(repeat[0], repeat[1]); }
    return m;
  };

  const mat = new THREE.MeshStandardMaterial({
    color: 0xe4eefb, roughness: 0.86, metalness: 0,
    map: wall.map, normalMap: wall.normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 0.55
  });

  const m = {
    wall: mat,
    wallNorth: mat.clone(),
    wallEast: mat.clone(),
    ceiling: new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.95, metalness: 0,
      map: ceiling.map, envMapIntensity: 0.3, emissive: 0xf7f9ff, emissiveIntensity: 0.08
    }),
    trim: new THREE.MeshStandardMaterial({ color: PALETTE.trim, roughness: 0.42, metalness: 0.02, envMapIntensity: 0.7 }),
    trimWarm: new THREE.MeshStandardMaterial({ color: 0xf3f0e6, roughness: 0.45, metalness: 0.02 }),
    baseboard: new THREE.MeshStandardMaterial({ color: 0xeaf4fb, roughness: 0.38, metalness: 0.02, envMapIntensity: 0.7 }),

    floor: new THREE.MeshStandardMaterial({
      color: 0xffffff, map: floor.map, normalMap: floor.normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughnessMap: floor.roughnessMap, roughness: 1, metalness: 0,
      envMapIntensity: 0.55
    }),
    floorAlt: null,

    woodLight: new THREE.MeshStandardMaterial({
      color: 0xffffff, map: woodLightTex.map, normalMap: woodLightTex.normalMap,
      normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.52, metalness: 0, envMapIntensity: 0.6
    }),
    woodMid: new THREE.MeshStandardMaterial({
      color: 0xffffff, map: woodMidTex.map, normalMap: woodMidTex.normalMap,
      normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.5, metalness: 0, envMapIntensity: 0.6
    }),
    woodDark: new THREE.MeshStandardMaterial({
      color: 0xffffff, map: woodDarkTex.map, normalMap: woodDarkTex.normalMap,
      normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.55, metalness: 0, envMapIntensity: 0.5
    }),
    woodHeadboard: new THREE.MeshStandardMaterial({
      color: 0xffffff, map: woodMidTex.map, normalMap: woodMidTex.normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.42, metalness: 0, envMapIntensity: 0.65
    }),

    duvet: new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: duvetTex.map, normalMap: duvetTex.normalMap,
      normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.9, metalness: 0,
      sheen: 0.7, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xdfeeff), envMapIntensity: 0.5
    }),
    sheet: fabricPhysical(0xfdfeff, { sheen: 0.5, rough: 0.95 }),
    pillow: new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: pillowTex.map, normalMap: pillowTex.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.92, metalness: 0,
      sheen: 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffffff), envMapIntensity: 0.5
    }),
    mattress: fabricPhysical(0xf9fcff, { sheen: 0.35, rough: 0.85 }),
    mint: new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: rugM.map, normalMap: rugM.normalMap,
      normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.95, metalness: 0,
      sheen: 0.35, sheenRoughness: 0.9
    }),
    rugYellow: new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: rugY.map, normalMap: rugY.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.97, metalness: 0,
      sheen: 0.4, sheenRoughness: 0.9
    }),
    rugMint: new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: rugM.map, normalMap: rugM.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.97, metalness: 0,
      sheen: 0.4, sheenRoughness: 0.9
    }),
    curtain: new THREE.MeshPhysicalMaterial({
      color: 0xfcfdff, map: T('sheer').map, normalMap: T('fabric').normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughness: 0.98, metalness: 0,
      transparent: false, opacity: 1, transmission: 0, side: THREE.DoubleSide,
      sheen: 0.2, sheenRoughness: 0.9, sheenColor: new THREE.Color(0xfff8ee),
      depthWrite: true, envMapIntensity: 0.05, specularIntensity: 0.08
    }),

    whitePlastic: new THREE.MeshStandardMaterial({ color: 0xf7f6f2, roughness: 0.32, metalness: 0.02, envMapIntensity: 0.9 }),
    acBody: new THREE.MeshStandardMaterial({ color: 0xf4f2ea, roughness: 0.35, metalness: 0.02, envMapIntensity: 0.9 }),
    cream: new THREE.MeshStandardMaterial({ color: 0xf3ecdd, roughness: 0.48, metalness: 0 }),
    offWhite: new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.55, metalness: 0 }),

    metalGrey: new THREE.MeshStandardMaterial({
      color: 0xbfb9c6, roughness: 0.32, metalness: 0.75,
      roughnessMap: metalTex.roughnessMap, envMapIntensity: 1.0
    }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x6d6a78, roughness: 0.35, metalness: 0.8, envMapIntensity: 1.0 }),
    metalSoft: new THREE.MeshStandardMaterial({ color: 0xb5aebc, roughness: 0.5, metalness: 0.55, envMapIntensity: 0.9 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a45c, roughness: 0.28, metalness: 0.9, envMapIntensity: 1.15 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd8d9de, roughness: 0.12, metalness: 1.0, envMapIntensity: 1.3 }),

    deskTop: new THREE.MeshPhysicalMaterial({
      color: 0xb7a9be, roughness: 0.34, metalness: 0.15, clearcoat: 0.5,
      clearcoatRoughness: 0.25, envMapIntensity: 0.9
    }),
    deskEdge: new THREE.MeshStandardMaterial({ color: 0x9d8fa6, roughness: 0.4, metalness: 0.2 }),

    paper: new THREE.MeshStandardMaterial({
      color: 0xffffff, map: paperTex.map, roughness: 0.95, metalness: 0,
      side: THREE.DoubleSide, envMapIntensity: 0.3
    }),
    cardboard: new THREE.MeshStandardMaterial({
      color: 0xffffff, map: cardboardTex.map, roughness: 0.92, metalness: 0, envMapIntensity: 0.3
    }),
    cardboardEdge: new THREE.MeshStandardMaterial({ color: 0xc7a172, roughness: 0.95, metalness: 0 }),

    ceramicPurple: new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: ceramicTex.map, roughness: 0.18, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.1
    }),
    ceramicMug: new THREE.MeshPhysicalMaterial({
      color: 0xf2d9c9, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.0
    }),
    ceramicWhite: new THREE.MeshPhysicalMaterial({
      color: 0xf9f7f1, roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.0
    }),
    soil: new THREE.MeshStandardMaterial({ color: PALETTE.soil, roughness: 1, metalness: 0 }),
    leaf: new THREE.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: false, roughness: 0.55, metalness: 0,
      side: THREE.DoubleSide, sheen: 0.4, sheenColor: new THREE.Color(0xbfe0a8), envMapIntensity: 0.5
    }),
    leafDark: new THREE.MeshStandardMaterial({ color: 0x4c8449, roughness: 0.55, side: THREE.DoubleSide }),
    stem: new THREE.MeshStandardMaterial({ color: 0x6f9a5b, roughness: 0.7 }),

    glass: new THREE.MeshPhysicalMaterial({
      color: 0xdcefff, roughness: 0.04, metalness: 0,
      transparent: true, opacity: 0.028, envMapIntensity: 0.12,
      side: THREE.DoubleSide, depthWrite: false,
      clearcoat: 0.35, clearcoatRoughness: 0.08
    }),
    lampShade: new THREE.MeshPhysicalMaterial({
      color: 0xffe3a8, emissive: 0xffcf7a, emissiveIntensity: 0.0,
      roughness: 0.55, metalness: 0, transparent: true, opacity: 0.96,
      sheen: 0.4, side: THREE.DoubleSide, envMapIntensity: 0.7
    }),
    lampShadeCool: new THREE.MeshPhysicalMaterial({
      color: 0xf2f6ff, emissive: 0xcfe2ff, emissiveIntensity: 0.0,
      roughness: 0.5, metalness: 0, side: THREE.DoubleSide
    }),
    bulb: new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffdca0, emissiveIntensity: 3, roughness: 0.4 }),
    blackGloss: new THREE.MeshPhysicalMaterial({ color: 0x2c2b33, roughness: 0.15, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }),
    clockFace: new THREE.MeshStandardMaterial({ color: 0xfbf7ec, roughness: 0.5 }),
    pink: new THREE.MeshStandardMaterial({ color: PALETTE.pink, roughness: 0.7 }),
    green: new THREE.MeshStandardMaterial({ color: PALETTE.green, roughness: 0.75 }),
    lavender: new THREE.MeshStandardMaterial({ color: PALETTE.lavender, roughness: 0.7 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd8b46a, roughness: 0.35, metalness: 0.65 }),
    plush: new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: plushTex.map, normalMap: plushTex.normalMap,
      normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.98, metalness: 0,
      sheen: 1.0, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffffff), envMapIntensity: 0.35
    }),
    star: new THREE.MeshPhysicalMaterial({
      color: 0xffdd8a, roughness: 0.6, metalness: 0.05, emissive: 0xffc75a, emissiveIntensity: 0.12,
      sheen: 0.8, sheenColor: new THREE.Color(0xfff3b0)
    }),
    darkFabric: fabricPhysical(0x8a7f9c, { sheen: 0.3, rough: 0.95 }),

    // editable practical-lamp emissives (copies so each lamp can toggle independently)
    bedLampShade: null,
    deskLampShade: null,
    ceilingDome: null
  };

  m.floorAlt = m.floor.clone();

  // hue-varied book covers
  const bookPalette = [
    0xd66f7a, 0x7f9fd8, 0x8fbf88, 0xe0b25f, 0x9d7fc4, 0x5fa8a4,
    0xd98f68, 0xb8c9dd, 0xc4a3b8, 0x7f8f6a, 0xe6cf7c, 0x8d7fb0,
    0xcf8f9a, 0x6f9bc4, 0xa8c58f, 0xd4a06a
  ];
  m.bookColors = bookPalette.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.62, metalness: 0 }));
  m.bookPages = new THREE.MeshStandardMaterial({ color: 0xf6f1e2, roughness: 0.9, metalness: 0 });

  // per-lamp materials
  m.bedLampShade = m.lampShade.clone();
  m.deskLampShade = m.lampShade.clone();
  m.ceilingDome = new THREE.MeshPhysicalMaterial({
    color: 0xfdfbf4, emissive: 0xffe7c0, emissiveIntensity: 0.0,
    roughness: 0.45, metalness: 0, transparent: true, opacity: 0.92, envMapIntensity: 0.6
  });

  return m;
}
