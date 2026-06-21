/**
 * Escena 3D con FISICA REAL (cannon-es).
 *
 * Cada dado se lanza con posicion, rotacion y velocidades iniciales generadas a
 * partir del `seed` enviado por el servidor, y rueda con un motor de fisica
 * (cuerpos rigidos, gravedad, colisiones con la mesa y las paredes). Cuando los
 * dados se duermen, se hace un breve "asentado" (slerp) hacia la orientacion que
 * muestra la cara con el resultado AUTORITATIVO del servidor: asi el tumbado es
 * fisico y realista, pero todos los participantes acaban viendo el mismo numero.
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createDie, resultForFace, D6_SIZE, D12_RADIUS } from './dice.js';
import { VERTICES, FACES } from './dodecahedron.js';
import { DiceAudio } from './audio.js';

const UP = new THREE.Vector3(0, 1, 0);
const ARENA = 5.4; // semilado de la zona de juego (paredes invisibles)

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function convexDodecaShape(radius) {
  const verts = VERTICES.map((v) => new CANNON.Vec3(v[0] * radius, v[1] * radius, v[2] * radius));
  const faces = FACES.map((f) => f.slice());
  return new CANNON.ConvexPolyhedron({ vertices: verts, faces });
}

export class DiceScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.dice = [];          // { die, body, ... }
    this.phase = 'idle';     // idle | rolling | done
    this.elapsed = 0;
    this.silent = false;     // true al reproducir el historial (sin avisar resultado)
    this.onSettled = null;   // callback(results) cuando los dados se detienen
    this.clock = new THREE.Clock();
    this.audio = new DiceAudio();

    this._initRenderer();
    this._initScene();
    this._initLights();
    this._initTable();
    this._initPhysics();

    window.addEventListener('resize', () => this._onResize());
    this._onResize();
    this._loop();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 9.5, 7.5);
    this.camera.lookAt(0, 0, 0);
  }

  _initLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xfff1d6, 1.15);
    key.position.set(5, 13, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 45;
    key.shadow.camera.left = -10;
    key.shadow.camera.right = 10;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -10;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb6ff, 0.4);
    rim.position.set(-6, 5, -5);
    this.scene.add(rim);
  }

  _initTable() {
    const table = new THREE.Mesh(
      new THREE.CircleGeometry(7.5, 64),
      new THREE.MeshStandardMaterial({ color: 0x1b2a17, roughness: 0.95 })
    );
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    this.scene.add(table);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(7.2, 7.5, 64),
      new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 0.8 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.scene.add(ring);
  }

  _initPhysics() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -32, 0);
    this.world.allowSleep = true;
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 12;

    this.diceMat = new CANNON.Material('dice');
    this.groundMat = new CANNON.Material('ground');
    const contact = new CANNON.ContactMaterial(this.diceMat, this.groundMat, {
      friction: 0.35,
      restitution: 0.28,
    });
    this.world.addContactMaterial(contact);
    const diceDice = new CANNON.ContactMaterial(this.diceMat, this.diceMat, {
      friction: 0.25,
      restitution: 0.3,
    });
    this.world.addContactMaterial(diceDice);

    // Suelo
    const floor = new CANNON.Body({ mass: 0, material: this.groundMat });
    floor.addShape(new CANNON.Plane());
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(floor);

    // Paredes invisibles (4 cajas) para mantener los dados sobre la mesa
    const wallDefs = [
      { pos: [ARENA + 0.5, 2, 0], size: [0.5, 3, ARENA + 1] },
      { pos: [-ARENA - 0.5, 2, 0], size: [0.5, 3, ARENA + 1] },
      { pos: [0, 2, ARENA + 0.5], size: [ARENA + 1, 3, 0.5] },
      { pos: [0, 2, -ARENA - 0.5], size: [ARENA + 1, 3, 0.5] },
    ];
    for (const w of wallDefs) {
      const body = new CANNON.Body({ mass: 0, material: this.groundMat });
      body.addShape(new CANNON.Box(new CANNON.Vec3(w.size[0], w.size[1], w.size[2])));
      body.position.set(w.pos[0], w.pos[1], w.pos[2]);
      this.world.addBody(body);
    }
  }

  _onResize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || this.canvas.clientWidth || 800;
    const h = rect.height || this.canvas.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _clearDice() {
    for (const d of this.dice) {
      this.scene.remove(d.die.mesh);
      this.world.removeBody(d.body);
      d.die.dispose();
    }
    this.dice = [];
  }

  _startPositions(n) {
    const cols = Math.ceil(Math.sqrt(n));
    const spacing = 2.0;
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const rowItems = Math.min(cols, n - r * cols);
      const x = (c - (rowItems - 1) / 2) * spacing;
      const z = (r - (Math.ceil(n / cols) - 1) / 2) * spacing;
      out.push([x, z]);
    }
    return out;
  }

  /**
   * Lanza una tirada. Solo necesita el `seed`, los tipos de dado y el color:
   * el resultado lo determina la propia fisica de forma identica en todos los
   * clientes (misma semilla => misma simulacion => misma cara arriba).
   * @param {{seed:number, color:string, dice:Array<{type:string}>}} roll
   * @param {{silent?:boolean}} opts  silent: no notifica el resultado (historial)
   */
  playRoll(roll, opts = {}) {
    this._clearDice();
    this.silent = !!opts.silent;
    const rng = mulberry32(roll.seed || 1);
    const starts = this._startPositions(roll.dice.length);

    roll.dice.forEach((res, i) => {
      const die = createDie(res.type, roll.color);
      die.mesh.castShadow = true;
      die.mesh.traverse((o) => (o.castShadow = true));
      this.scene.add(die.mesh);

      const shape = res.type === 'd12'
        ? convexDodecaShape(D12_RADIUS)
        : new CANNON.Box(new CANNON.Vec3(D6_SIZE / 2, D6_SIZE / 2, D6_SIZE / 2));

      const body = new CANNON.Body({
        mass: res.type === 'd12' ? 1.3 : 1,
        material: this.diceMat,
        allowSleep: true,
        sleepSpeedLimit: 0.2,
        sleepTimeLimit: 0.25,
      });
      body.addShape(shape);

      const [sx, sz] = starts[i];
      body.position.set(sx + (rng() - 0.5) * 1.2, 4 + rng() * 2.2, sz + (rng() - 0.5) * 1.2);

      // Orientacion aleatoria (Shoemake)
      const u1 = rng(), u2 = rng(), u3 = rng();
      body.quaternion.set(
        Math.sqrt(1 - u1) * Math.sin(2 * Math.PI * u2),
        Math.sqrt(1 - u1) * Math.cos(2 * Math.PI * u2),
        Math.sqrt(u1) * Math.sin(2 * Math.PI * u3),
        Math.sqrt(u1) * Math.cos(2 * Math.PI * u3)
      );

      // Impulso inicial: hacia el centro + caida, con giro
      body.velocity.set(-sx * 0.6 + (rng() - 0.5) * 5, -2 - rng() * 3, -sz * 0.6 + (rng() - 0.5) * 5);
      body.angularVelocity.set((rng() - 0.5) * 22, (rng() - 0.5) * 22, (rng() - 0.5) * 22);

      const heavy = res.type === 'd12';
      body.addEventListener('collide', (e) => {
        const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (v > 1.2) this.audio.clack(Math.min(1, v / 9), heavy);
      });

      this.world.addBody(body);
      this.dice.push({ die, body, heavy });
    });

    this.phase = 'rolling';
    this.elapsed = 0;
  }

  setColor(color) {
    for (const d of this.dice) d.die.setColor(color);
  }

  _allSleeping() {
    return this.dice.every((d) => d.body.sleepState === CANNON.Body.SLEEPING);
  }

  /** Lee, para cada dado, la cara cuya normal apunta mas hacia arriba. */
  _readResults() {
    const n = new THREE.Vector3();
    return this.dice.map((d) => {
      let bestIndex = 0;
      let bestY = -Infinity;
      d.die.faceNormals.forEach((normal, idx) => {
        const y = n.copy(normal).applyQuaternion(d.die.mesh.quaternion).y;
        if (y > bestY) { bestY = y; bestIndex = idx; }
      });
      return resultForFace(d.die.type, bestIndex);
    });
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.phase === 'rolling') {
      this.world.step(1 / 60, dt, 4);
      for (const d of this.dice) {
        d.die.mesh.position.copy(d.body.position);
        d.die.mesh.quaternion.copy(d.body.quaternion);
      }
      this.elapsed += dt;
      // Los dados se quedan donde la fisica los deja: no hay correccion posterior.
      if ((this.elapsed > 0.8 && this._allSleeping()) || this.elapsed > 6) {
        this.phase = 'done';
        const results = this._readResults();
        if (!this.silent && this.onSettled) this.onSettled(results);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
