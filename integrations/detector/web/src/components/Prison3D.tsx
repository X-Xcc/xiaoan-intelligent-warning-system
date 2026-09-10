import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

// ── Types ──────────────────────────────────────────────────────────────────

interface Bldg {
  id: string; name: string;
  x: number; z: number; w: number; d: number;
  floors: number; intensity: number; alerts: number;
  top: string; zone: "back" | "front";
}

// ── Building Layout (direct 3D coords, origin = scene center) ──────────────

const BLDGS: Bldg[] = [
  // back row — detention
  { id: "A", name: "一监区监舍楼", x: -25, z: -15, w: 11, d: 6, floors: 4, intensity: 82, alerts: 18, top: "打架", zone: "back" },
  { id: "B", name: "二监区监舍楼", x: -8,  z: -15, w: 11, d: 6, floors: 4, intensity: 45, alerts: 7,  top: "人员聚集", zone: "back" },
  { id: "C", name: "三监区监舍楼", x: 9,   z: -15, w: 11, d: 6, floors: 4, intensity: 28, alerts: 3,  top: "跌倒", zone: "back" },
  { id: "D", name: "监控指挥中心", x: 13,  z: -6,  w: 7,  d: 5, floors: 3, intensity: 15, alerts: 1,  top: "跌倒", zone: "back" },
  // mid zone — labor / life
  { id: "E", name: "生产车间",     x: -25, z: 0,   w: 14, d: 7, floors: 1, intensity: 65, alerts: 12, top: "离岗", zone: "back" },
  { id: "F", name: "食堂",         x: -5,  z: 0,   w: 11, d: 7, floors: 1, intensity: 35, alerts: 5,  top: "打架", zone: "back" },
  // education zone
  { id: "G", name: "教学楼",       x: -25, z: 12,  w: 9,  d: 5, floors: 2, intensity: 20, alerts: 2,  top: "离岗", zone: "back" },
  { id: "H", name: "医务室",       x: -11, z: 12,  w: 7,  d: 5, floors: 1, intensity: 10, alerts: 1,  top: "跌倒", zone: "back" },
  { id: "I", name: "会见室",       x: 1,   z: 12,  w: 9,  d: 5, floors: 1, intensity: 30, alerts: 4,  top: "人员聚集", zone: "back" },
  // front zone — admin
  { id: "J", name: "行政办公楼",   x: -18, z: 22,  w: 11, d: 4, floors: 3, intensity: 0, alerts: 0, top: "—", zone: "front" },
  { id: "K", name: "武警营房",     x: -2,  z: 22,  w: 8,  d: 4, floors: 2, intensity: 0, alerts: 0, top: "—", zone: "front" },
  { id: "L", name: "备勤楼",       x: 12,  z: 22,  w: 8,  d: 4, floors: 2, intensity: 0, alerts: 0, top: "—", zone: "front" },
];

const BACK = BLDGS.filter(b => b.zone === "back");

// ── Heat Color ─────────────────────────────────────────────────────────────

function heatColor(t: number): THREE.Color {
  const c = Math.max(0, Math.min(1, t));
  if (c > 0.65) {
    return new THREE.Color(0x0fd9b5).lerp(new THREE.Color(0xef4444), (c - 0.65) / 0.35);
  }
  return new THREE.Color(0x0fd9b5).lerp(new THREE.Color(0xf59e0b), c / 0.65);
}

// ── Animated Heat Edge ─────────────────────────────────────────────────────

function HeatEdge({ w, h, d, color }: { w: number; h: number; d: number; color: THREE.Color }) {
  return (
    <mesh>
      <boxGeometry args={[w + 0.08, h + 0.08, d + 0.08]} />
      <meshBasicMaterial color={color} transparent opacity={0.18} wireframe />
    </mesh>
  );
}

// ── Heat Particles (GPU-instanced points) ──────────────────────────────────

function HeatParticles({ b, color }: { b: Bldg; color: THREE.Color }) {
  const count = Math.max(6, Math.round(b.intensity * 0.15));
  const positions = useMemo(() => {
    const hw = b.w * 0.35, hd = b.d * 0.35;
    return Array.from({ length: count * 3 }, (_, i) => {
      const axis = i % 3;
      if (axis === 0) return (Math.random() - 0.5) * hw * 2;
      if (axis === 1) return 0.3 + Math.random() * b.floors * 0.9;
      return (Math.random() - 0.5) * hd * 2;
    });
  }, [b, count]);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  return (
    <points geometry={geo}>
      <pointsMaterial color={color} size={0.15} transparent opacity={0.6} sizeAttenuation />
    </points>
  );
}

// ── Zone Divider ───────────────────────────────────────────────────────────

function ZoneDivider({ x1, z1, x2, z2 }: { x1: number; z1: number; x2: number; z2: number }) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  return (
    <mesh position={[(x1 + x2) / 2, 0.75, (z1 + z2) / 2]} rotation={[0, angle, 0]}>
      <boxGeometry args={[0.1, 1.5, len]} />
      <meshBasicMaterial color="#06b6d4" transparent opacity={0.35} />
    </mesh>
  );
}

// ── Watchtower ─────────────────────────────────────────────────────────────

function Watchtower({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 2, 0]}>
        <boxGeometry args={[1.2, 4, 1.2]} />
        <meshBasicMaterial color="#1e3a5f" transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 4.2, 0]}>
        <sphereGeometry args={[0.25, 12, 12]} />
        <meshBasicMaterial color="#f87171" />
      </mesh>
      <mesh position={[0, 4.2, 0]}>
        <sphereGeometry args={[0.5, 12, 12]} />
        <meshBasicMaterial color="#f87171" transparent opacity={0.25} />
      </mesh>
      <pointLight color="#f87171" intensity={0.8} distance={7} position={[0, 4.2, 0]} />
    </group>
  );
}

// ── Scan Curtain ───────────────────────────────────────────────────────────

function ScanCurtain() {
  return (
    <mesh position={[0, 2, 0]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[60, 4]} />
      <meshBasicMaterial color="#22d3ee" transparent opacity={0.05} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ── Building ───────────────────────────────────────────────────────────────

function Building({ b }: { b: Bldg }) {
  const isBack = b.zone === "back";
  const h = b.floors * 1.0;
  const wallColor = isBack ? "#155e75" : "#475569";
  const roofColor = isBack ? "#0891b2" : "#64748b";
  const heat = isBack ? heatColor(b.intensity / 100) : null;

  return (
    <group position={[b.x, h / 2, b.z]}>
      {/* body */}
      <mesh>
        <boxGeometry args={[b.w, h, b.d]} />
        <meshBasicMaterial color={wallColor} transparent opacity={0.9} />
      </mesh>

      {/* roof slab */}
      <mesh position={[0, h / 2 + 0.04, 0]}>
        <boxGeometry args={[b.w + 0.06, 0.08, b.d + 0.06]} />
        <meshBasicMaterial color={roofColor} />
      </mesh>

      {/* floor separators */}
      {b.floors > 1 && Array.from({ length: b.floors - 1 }, (_, i) => (
        <mesh key={i} position={[0, -h / 2 + (i + 1) * 1.0, 0]}>
          <boxGeometry args={[b.w + 0.02, 0.03, b.d + 0.02]} />
          <meshBasicMaterial color={roofColor} transparent opacity={0.6} />
        </mesh>
      ))}

      {/* heat glow */}
      {heat && <HeatEdge w={b.w} h={h} d={b.d} color={heat} />}

      {/* point light for high intensity */}
      {isBack && b.intensity > 50 && (
        <pointLight color={heat!.getStyle()} intensity={b.intensity * 0.025} distance={5} position={[0, h / 2, 0]} />
      )}

      {/* floating particles */}
      {isBack && b.intensity > 10 && <HeatParticles b={b} color={heat!} />}
    </group>
  );
}

// ── Label (projected from 3D → screen, NO Html drift) ──────────────────────

function Label({ x, y, z, lines, glow }: {
  x: number; y: number; z: number;
  lines: { text: string; color: string; size: number; weight?: number }[];
  glow?: string;
}) {
  return (
    <Html position={[x, y, z]} center style={{ pointerEvents: "none" }}>
      <div style={{
        background: "rgba(2,6,23,0.92)", border: "1px solid rgba(14,165,233,0.35)",
        borderRadius: 6, padding: "4px 8px", textAlign: "center",
        backdropFilter: "blur(8px)", whiteSpace: "nowrap",
        boxShadow: glow ? `0 0 14px ${glow}50` : "none",
      }}>
        {lines.map((l, i) => (
          <div key={i} style={{
            color: l.color, fontSize: l.size, fontWeight: l.weight ?? 400,
            fontFamily: "monospace", lineHeight: 1.35,
          }}>{l.text}</div>
        ))}
      </div>
    </Html>
  );
}

// ── HUD ────────────────────────────────────────────────────────────────────

function Hud() {
  const totalAlerts = BACK.reduce((s, b) => s + b.alerts, 0);
  const highRisk = BACK.filter(b => b.intensity > 60).length;

  return (
    <Html position={[32, 5, -22]} center={false} style={{ pointerEvents: "none" }}>
      <div style={{ textAlign: "right", minWidth: 110 }}>
        <div style={{ color: "rgba(34,211,238,0.5)", fontFamily: "monospace", fontSize: 9, letterSpacing: 2 }}>MONITORING</div>
        <div style={{ marginTop: 6 }}>
          {[
            { label: "ALERTS", val: totalAlerts, color: "#fbbf24" },
            { label: "HIGH_RISK", val: highRisk, color: "#f87171" },
            { label: "BUILDINGS", val: BLDGS.length, color: "#22d3ee" },
          ].map(r => (
            <div key={r.label} style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginBottom: 2 }}>
              <span style={{ color: "rgba(34,211,238,0.4)", fontFamily: "monospace", fontSize: 9 }}>{r.label}</span>
              <span style={{ color: r.color, fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>{r.val}</span>
            </div>
          ))}
        </div>
      </div>
    </Html>
  );
}

// ── Compass ────────────────────────────────────────────────────────────────

function Compass() {
  return (
    <Html position={[28, 0.1, 20]} center style={{ pointerEvents: "none" }}>
      <div style={{
        width: 26, height: 26, borderRadius: "50%",
        border: "1px solid rgba(14,165,233,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ color: "#22d3ee", fontSize: 10, fontWeight: 700, fontFamily: "monospace" }}>N</span>
      </div>
    </Html>
  );
}

// ── Legend ──────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <Html position={[28, 0.1, 24]} center style={{ pointerEvents: "none" }}>
      <div style={{
        background: "rgba(15,23,42,0.85)", backdropFilter: "blur(4px)",
        border: "1px solid rgba(21,94,117,0.3)", borderRadius: 8, padding: "7px 9px",
      }}>
        <p style={{ color: "rgba(34,211,238,0.5)", fontFamily: "monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 5px 0" }}>异常密度</p>
        <div style={{ width: 80, height: 4, borderRadius: 2, background: "linear-gradient(to right, #0fd9b5, #f59e0b, #ef4444)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "monospace", fontSize: 8, color: "rgba(34,211,238,0.4)", marginTop: 3 }}>
          <span>LOW</span><span>HIGH</span>
        </div>
      </div>
    </Html>
  );
}

// ── Main Scene ─────────────────────────────────────────────────────────────

function Scene() {
  const patrolRing = useMemo(() => {
    const corners: [number, number][] = [[-32, -20], [24, -20], [24, 26], [-32, 26]];
    return corners.map(([x, z]) => new THREE.Vector3(x, 0.08, z));
  }, []);

  return (
    <>
      {/* lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[15, 20, 10]} intensity={0.8} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024}
        shadow-camera-far={80} shadow-camera-left={-20} shadow-camera-right={20}
        shadow-camera-top={20} shadow-camera-bottom={-20} />
      <directionalLight position={[-10, 8, -5]} intensity={0.25} color="#60a5fa" />

      {/* ground + grid */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial color="#080e1a" />
      </mesh>
      <gridHelper args={[80, 40, "#0e2a47", "#0a1e36"]} position={[0, 0, 0]} />

      {/* perimeter walls */}
      <group>
        <mesh position={[0, 1.5, -22]}><boxGeometry args={[60, 3, 0.3]} /><meshBasicMaterial color="#2563eb" transparent opacity={0.5} /></mesh>
        <mesh position={[0, 1.5, 28]}><boxGeometry args={[60, 3, 0.3]} /><meshBasicMaterial color="#2563eb" transparent opacity={0.5} /></mesh>
        <mesh position={[-34, 1.5, 3]}><boxGeometry args={[0.3, 3, 53]} /><meshBasicMaterial color="#2563eb" transparent opacity={0.5} /></mesh>
        <mesh position={[26, 1.5, 3]}><boxGeometry args={[0.3, 3, 53]} /><meshBasicMaterial color="#2563eb" transparent opacity={0.5} /></mesh>
      </group>

      {/* gate */}
      <mesh position={[0, 1.5, 28]}>
        <boxGeometry args={[3.5, 3, 0.4]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.3} />
      </mesh>

      {/* patrol ring */}
      <lineLoop>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position"
            args={[new Float32Array(patrolRing.flatMap(p => [p.x, p.y, p.z])), 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#22d3ee" transparent opacity={0.1} />
      </lineLoop>

      {/* zone dividers */}
      <ZoneDivider x1={-32} z1={-7} x2={24} z2={-7} />
      <ZoneDivider x1={-32} z1={8}  x2={24} z2={8} />
      <ZoneDivider x1={-32} z1={18} x2={24} z2={18} />

      {/* scan curtain */}
      <ScanCurtain />

      {/* buildings */}
      {BLDGS.map(b => <Building key={b.id} b={b} />)}

      {/* building labels (pure Html, no drift) */}
      {BLDGS.map(b => {
        const h = b.floors * 1.0;
        const isBack = b.zone === "back";
        const heat = isBack ? heatColor(b.intensity / 100) : null;
        return (
          <Label key={b.id} x={b.x} y={h + 0.5} z={b.z}
            glow={isBack && b.intensity > 60 ? heat?.getStyle() : undefined}
            lines={[
              { text: b.name, color: isBack ? "#e2e8f0" : "#94a3b8", size: 10, weight: 700 },
              ...(isBack ? [{ text: `${b.intensity}% · ${b.alerts}告警 · ${b.top}`, color: heat!.getStyle(), size: 8 }] : []),
            ]}
          />
        );
      })}

      {/* zone labels */}
      <Html position={[-4, 4.5, -16]} center style={{ pointerEvents: "none" }}>
        <div style={{ color: "rgba(14,165,233,0.4)", fontSize: 10, fontFamily: "monospace", letterSpacing: 3, whiteSpace: "nowrap" }}>监管区（后区）</div>
      </Html>
      <Html position={[-4, 2, 0]} center style={{ pointerEvents: "none" }}>
        <div style={{ color: "rgba(14,165,233,0.4)", fontSize: 10, fontFamily: "monospace", letterSpacing: 3, whiteSpace: "nowrap" }}>劳动生活区</div>
      </Html>
      <Html position={[-4, 2.5, 12]} center style={{ pointerEvents: "none" }}>
        <div style={{ color: "rgba(14,165,233,0.4)", fontSize: 10, fontFamily: "monospace", letterSpacing: 3, whiteSpace: "nowrap" }}>教育服务区</div>
      </Html>
      <Html position={[-4, 3.5, 22]} center style={{ pointerEvents: "none" }}>
        <div style={{ color: "rgba(14,165,233,0.4)", fontSize: 10, fontFamily: "monospace", letterSpacing: 3, whiteSpace: "nowrap" }}>行政区（前区）</div>
      </Html>

      {/* watchtowers */}
      <Watchtower x={-30} z={-18} />
      <Watchtower x={22}  z={-18} />
      <Watchtower x={-30} z={25}  />
      <Watchtower x={22}  z={25}  />

      {/* HUD / Compass / Legend */}
      <Hud />
      <Compass />
      <Legend />

      {/* orbit controls */}
      <OrbitControls
        enablePan={false}
        minDistance={15} maxDistance={100}
        minPolarAngle={0.3} maxPolarAngle={Math.PI / 2.1}
        autoRotate autoRotateSpeed={0.4}
        target={[-3, 1, 2]}
      />
    </>
  );
}

// ── Export ──────────────────────────────────────────────────────────────────

export default function Prison3D() {
  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden bg-slate-950">
      <Canvas
        camera={{ position: [40, 32, 48], fov: 45, near: 0.1, far: 300 }}
        style={{ position: "absolute", inset: 0 }}
        gl={{ antialias: true }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
