import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { MAP_W, MAP_H, TILES } from './board-map.js?v=58';
import { charTexture } from './views.js?v=58';

const CYAN = '#81efff';
const GOLD = '#ffe18f';
const normal = new THREE.Vector3(0, 1, 0);
const color = new THREE.Color();
const dummy = new THREE.Object3D();

function tag(text, className, parent) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  const label = new CSS2DObject(el);
  parent.add(label);
  return label;
}

export class BoardScene {
  constructor(view, board) {
    this.view = view;
    this.r = view.world.geo.R;
    this.unit = Math.max(0.95, this.r * 0.029);
    this.height = this.unit * 0.42;
    this.board = board;
    this.group = new THREE.Group();
    this.pawns = new Map();
    this.ray = new THREE.Raycaster();
    this.points = board.tiles.map(({ x, y }) => new THREE.Vector3(
      (x / MAP_W - 0.5) * this.r * 2.0, this.height,
      (y / MAP_H - 0.5) * this.r * 2.16,
    ));
    const cylinder = new THREE.CylinderGeometry(1, 1.11, 0.48, 22);
    this.discs = new THREE.InstancedMesh(cylinder, new THREE.MeshBasicMaterial(), board.tiles.length);
    this.group.add(this.discs);
    this.labels = new THREE.Group();
    this.group.add(this.labels);

    const route = (edges, tint, width) => {
      const geometry = new THREE.BoxGeometry(1, 0.12, 1);
      const line = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color: tint }), edges.length);
      edges.forEach(([a, b], i) => {
        const A = this.points[a], B = this.points[b];
        dummy.position.copy(A).lerp(B, 0.5);
        dummy.position.y = this.height * 0.62;
        dummy.rotation.set(0, Math.atan2(B.x - A.x, B.z - A.z), 0);
        dummy.scale.set(this.unit * width, 1, A.distanceTo(B));
        dummy.updateMatrix();
        line.setMatrixAt(i, dummy.matrix);
      });
      this.group.add(line);
    };
    route(board.tiles.map((t) => [t.id, t.next]), '#416079', 0.48);
    route(board.tiles.flatMap((t) => t.links.filter((b) => b > t.id).map((b) => [t.id, b])), '#6cbdad', 0.33);
    this.auraGeometry = new THREE.RingGeometry(1.14, 1.35, 32);
    this.auraGeometry.rotateX(-Math.PI / 2);
    this.auraMaterial = new THREE.MeshBasicMaterial({ color: GOLD, side: THREE.DoubleSide });
    view.scene.add(this.group);
  }

  frame(point = null) {
    const { camera, controls } = this.view;
    // 島をほぼ真上から把握できる角度。観戦と同じ操作で回転・ズーム可能。
    const r = point ? Math.max(12, this.r * 0.35) : this.r * Math.max(1, 0.98 / camera.aspect);
    controls.target.copy(point ?? new THREE.Vector3());
    camera.position.copy(controls.target).add(new THREE.Vector3(r * 0.15, r * 2.28, r * 0.52));
    controls.update();
  }

  updateTiles(game, p) {
    const crystal = game.crystal(p.world);
    this.options = p.offer?.kind === 'branch' ? p.offer.data : [];
    const signature = [crystal, ...this.options].join('/');
    if (signature === this.signature) return;
    this.signature = signature;
    this.labels.clear();
    this.board.tiles.forEach((tile, i) => {
      const type = i === crystal ? 'crystal' : tile.type;
      const data = TILES[type], pass = data.pass;
      const position = this.points[i];
      dummy.position.copy(position);
      dummy.rotation.set(0, 0, 0);
      const scale = this.unit * (pass ? 0.31 : 1);
      dummy.scale.set(scale, this.unit * (pass ? 0.72 : 0.52), scale);
      dummy.updateMatrix();
      this.discs.setMatrixAt(i, dummy.matrix);
      this.discs.setColorAt(i, color.set(pass ? CYAN : data.color));
      const branch = this.options.indexOf(i);
      const symbol = type === 'crystal' ? '◆' : type === 'shop' ? '▣' : type === 'gate' ? '⟡' : '';
      const text = symbol || (['blue', 'red'].includes(type) ? '' : data.label);
      if (text || branch >= 0) {
        const style = branch >= 0 ? ' branch' : symbol ? '' : ' tile';
        const label = tag(branch >= 0 ? String(branch + 1) : text, 'board-map-label' + style, this.labels);
        label.position.copy(position);
        label.position.y += this.unit * 0.7;
      }
      if (branch >= 0 || type === 'crystal') {
        const ring = new THREE.Mesh(this.auraGeometry, this.auraMaterial);
        ring.position.copy(position);
        ring.position.y += this.unit * 0.2;
        ring.scale.setScalar(this.unit * (branch >= 0 ? 1.15 : 0.58));
        this.labels.add(ring);
      }
    });
    this.discs.instanceMatrix.needsUpdate = true;
    this.discs.instanceColor.needsUpdate = true;
    this.discs.computeBoundingSphere();
  }

  update(game, focus, dt) {
    this.updateTiles(game, focus);
    const players = game.state.players.filter((p) => p.world === focus.world);
    for (const p of players) {
      let pawn = this.pawns.get(p.id);
      if (!pawn) {
        const group = new THREE.Group(), char = game.char(p);
        const tex = charTexture(char);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.tex, alphaTest: 0.07, depthWrite: false }));
        sprite.center.set(0.5, 0);
        group.add(sprite);
        const baseMat = new THREE.MeshBasicMaterial({ color: p.color, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(this.auraGeometry, baseMat);
        ring.scale.setScalar(this.unit * 0.8);
        group.add(ring);
        const label = tag(char.name, 'board-pawn-label', group);
        label.element.style.setProperty('--pawn', p.color);
        group.position.copy(this.points[p.tile]);
        this.group.add(group);
        pawn = { group, sprite, tex, baseMat, label };
        this.pawns.set(p.id, pawn);
      }
      const same = players.filter((q) => q.tile === p.tile);
      const offset = (same.indexOf(p) - (same.length - 1) / 2) * this.unit * 1.36;
      pawn.group.position.lerp(dummy.position.copy(this.points[p.tile]).add(new THREE.Vector3(offset, this.unit * 0.23, 0)), Math.min(1, dt * 15));
      const size = this.unit * (p.id === focus.id ? 2.7 : 2.15);
      pawn.sprite.scale.set(size * Math.min(1.65, pawn.tex.aspect), size, 1);
      pawn.label.position.y = size * 1.03;
      pawn.label.element.classList.toggle('active', p.id === focus.id);
    }
    for (const [id, pawn] of this.pawns) if (!players.some((p) => p.id === id)) this.removePawn(id, pawn);

    // 地形と地面を共用し、魔物戦の両軍を止まったマスの上に配置する。
    const key = focus.battle ? focus.id + focus.battleStart : null;
    if (key !== (this.arena?.key ?? null)) {
      this.clearArena();
      if (key) {
        const group = new THREE.Group(), center = this.points[focus.tile].clone();
        group.position.copy(center);
        this.group.add(group);
        const g = new THREE.DodecahedronGeometry(this.unit * 0.68), units = [];
        const lanes = [0, 1, 2].map((lane) => {
          const floor = new THREE.Mesh(new THREE.BoxGeometry(this.unit * 12, 0.12, this.unit * 1.65), new THREE.MeshBasicMaterial({ color: '#263c57' }));
          floor.position.set(0, this.unit * 1.4, (lane - 1) * this.unit * 1.8);
          group.add(floor);
          return floor;
        });
        for (const [team, tint] of [[focus.battle.allies, focus.color], [focus.battle.enemies, '#ff849a']]) {
          for (const u of team) {
            const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: tint }));
            group.add(mesh);
            const label = tag(u.name, 'board-pawn-label', mesh);
            label.position.y = this.unit * 1.0;
            units.push({ mesh, label, tint });
          }
        }
        this.arena = { key, group, units, lanes };
        this.frame(center);
      } else this.frame();
    }
    if (this.arena) {
      const b = focus.battle;
      this.arena.lanes.forEach((lane, i) => lane.material.color.set(b.burst < 2 && i === b.lane ? '#b23660' : '#263c57'));
      [...b.allies, ...b.enemies].forEach((u, i) => {
        const { mesh, label, tint } = this.arena.units[i];
        mesh.position.set((u.x / 100 - 0.5) * this.unit * 12, this.unit * 2.08, (u.lane - 1) * this.unit * 1.8);
        mesh.material.color.set(u.hp <= 0 ? '#666579' : u.hit > 0 ? '#ffffff' : tint);
        mesh.rotation.y += dt;
        const name = u.name + ' ' + Math.round(100 * u.hp / u.max) + '%';
        if (label.element.textContent !== name) label.element.textContent = name;
      });
    }
  }

  pick(ndc) {
    this.ray.setFromCamera(ndc, this.view.camera);
    const p = this.ray.ray.intersectPlane(new THREE.Plane(normal, -this.height), new THREE.Vector3());
    if (!p) return null;
    const best = this.options?.map((id) => [id, p.distanceTo(this.points[id])]).sort((a, b) => a[1] - b[1])[0];
    return best && best[1] < this.unit * 1.8 ? best[0] : null;
  }

  removePawn(id, pawn) {
    pawn.label.removeFromParent();
    pawn.sprite.material.dispose();
    pawn.baseMat.dispose();
    pawn.group.removeFromParent();
    this.pawns.delete(id);
  }

  clearArena() {
    if (!this.arena) return;
    const { group, units, lanes } = this.arena;
    for (const { label, mesh } of units) { label.removeFromParent(); mesh.material.dispose(); }
    units[0]?.mesh.geometry.dispose();
    for (const floor of lanes) { floor.geometry.dispose(); floor.material.dispose(); }
    group.removeFromParent();
    this.arena = null;
  }

  dispose() {
    this.clearArena();
    for (const [id, pawn] of this.pawns) this.removePawn(id, pawn);
    this.labels.clear();
    this.group.removeFromParent();
    this.auraGeometry.dispose();
    this.auraMaterial.dispose();
    for (const mesh of this.group.children.filter((o) => o.isInstancedMesh)) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    }
  }
}
