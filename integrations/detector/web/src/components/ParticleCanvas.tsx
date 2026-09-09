import { useRef, useEffect, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface ParticleBackgroundProps {
  particleCount?: number;
  showLines?: boolean;
}

interface ParticlesWithCustomData extends THREE.Points {
  _positions?: Float32Array;
  _velocities?: Float32Array;
}

function ParticleBackground({ particleCount = 3000, showLines = false }: ParticleBackgroundProps) {
  const pointsRef = useRef<ParticlesWithCustomData>(null!);
  const linesRef = useRef<THREE.LineSegments>(null!);
  const mouseRef = useRef({ x: 0, y: 0 });
  const mouseWorldRef = useRef(new THREE.Vector3());
  const targetRotRef = useRef({ x: 0, y: 0 });
  const rotRef = useRef({ x: 0, y: 0 });
  const timeRef = useRef(0);

  const vertexShader = `
    attribute float size;
    attribute vec3 customColor;
    varying vec3 vColor;
    void main() {
      vColor = customColor;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (200.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const fragmentShader = `
    varying vec3 vColor;
    void main() {
      vec2 center = gl_PointCoord - vec2(0.5);
      float dist = length(center);
      if (dist > 0.5) discard;
      float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
      gl_FragColor = vec4(vColor, alpha);
    }
  `;

  const particleSizes = useMemo(() => {
    const sizes = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      sizes[i] = 1.5 + Math.random() * 3.5;
    }
    return sizes;
  }, [particleCount]);

  const particleColors = useMemo(() => {
    const colors = new Float32Array(particleCount * 3);
    const colorPalette = [
      [0.7, 0.85, 1.0],
      [0.75, 0.8, 0.95],
      [0.8, 0.75, 0.9],
      [0.75, 0.85, 0.9],
      [0.85, 0.8, 0.9],
    ];
    for (let i = 0; i < particleCount; i++) {
      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      const brightness = 0.7 + Math.random() * 0.3;
      colors[i * 3] = color[0] * brightness;
      colors[i * 3 + 1] = color[1] * brightness;
      colors[i * 3 + 2] = color[2] * brightness;
    }
    return colors;
  }, [particleCount]);

  useEffect(() => {
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 35 + Math.random() * 65;
      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);
      velocities[i3] = (Math.random() - 0.5) * 0.008;
      velocities[i3 + 1] = (Math.random() - 0.5) * 0.008;
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.008;
    }
    pointsRef.current._positions = positions;
    pointsRef.current._velocities = velocities;
    const geo = pointsRef.current.geometry;
    (geo.attributes.position.array as Float32Array).set(positions);
    geo.attributes.position.needsUpdate = true;
  }, [particleCount]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      mouseRef.current = { x, y };
      mouseWorldRef.current.set(x * 60, y * 50, 0);
      targetRotRef.current = { x: y * 0.3, y: x * 0.3 };
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useFrame((_, delta) => {
    if (!pointsRef.current || !pointsRef.current._positions || !pointsRef.current._velocities) return;
    timeRef.current += delta;
    const positions = pointsRef.current._positions;
    const velocities = pointsRef.current._velocities;

    rotRef.current.x += (targetRotRef.current.x - rotRef.current.x) * 0.01;
    rotRef.current.y += (targetRotRef.current.y - rotRef.current.y) * 0.01;
    pointsRef.current.rotation.x = rotRef.current.x + timeRef.current * 0.015;
    pointsRef.current.rotation.y = rotRef.current.y + timeRef.current * 0.01;

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] += velocities[i3];
      positions[i3 + 1] += velocities[i3 + 1];
      positions[i3 + 2] += velocities[i3 + 2];

      const dx = positions[i3] - mouseWorldRef.current.x;
      const dy = positions[i3 + 1] - mouseWorldRef.current.y;
      const dz = positions[i3 + 2] - mouseWorldRef.current.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < 20 && dist > 0) {
        const force = (20 - dist) / 20 * 0.4;
        positions[i3] += (dx / dist) * force;
        positions[i3 + 1] += (dy / dist) * force;
        positions[i3 + 2] += (dz / dist) * force;
      }

      if (Math.abs(positions[i3]) > 100) velocities[i3] *= -1;
      if (Math.abs(positions[i3 + 1]) > 80) velocities[i3 + 1] *= -1;
      if (Math.abs(positions[i3 + 2]) > 80) velocities[i3 + 2] *= -1;
    }

    const geo = pointsRef.current.geometry;
    (geo.attributes.position.array as Float32Array).set(positions);
    geo.attributes.position.needsUpdate = true;

    if (showLines && linesRef.current) {
      linesRef.current.rotation.x = pointsRef.current.rotation.x;
      linesRef.current.rotation.y = pointsRef.current.rotation.y;

      const lineGeo = linesRef.current.geometry;
      const linePos = lineGeo.attributes.position.array as Float32Array;
      let lineIndex = 0;
      const maxDist = 9;

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const x1 = positions[i3];
        const y1 = positions[i3 + 1];
        const z1 = positions[i3 + 2];

        for (let j = i + 1; j < particleCount && lineIndex < 2000; j++) {
          const j3 = j * 3;
          const ddx = x1 - positions[j3];
          const ddy = y1 - positions[j3 + 1];
          const ddz = z1 - positions[j3 + 2];
          const d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);

          if (d < maxDist) {
            linePos[lineIndex++] = x1;
            linePos[lineIndex++] = y1;
            linePos[lineIndex++] = z1;
            linePos[lineIndex++] = positions[j3];
            linePos[lineIndex++] = positions[j3 + 1];
            linePos[lineIndex++] = positions[j3 + 2];
          }
        }
      }

      lineGeo.setDrawRange(0, lineIndex);
      lineGeo.attributes.position.needsUpdate = true;
    }
  });

  return (
    <>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array(particleCount * 3), 3]} />
          <bufferAttribute attach="attributes-size" args={[particleSizes, 1]} />
          <bufferAttribute attach="attributes-customColor" args={[particleColors, 3]} />
        </bufferGeometry>
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      {showLines && (
        <lineSegments ref={linesRef}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[new Float32Array(12000), 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#8090a0" transparent opacity={0.08} blending={THREE.AdditiveBlending} />
        </lineSegments>
      )}
    </>
  );
}

export interface ParticleCanvasProps {
  particleCount?: number;
  showLines?: boolean;
}

export default function ParticleCanvas({ particleCount = 3000, showLines = false }: ParticleCanvasProps) {
  return (
    <Canvas camera={{ position: [0, 0, 50], fov: 75 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <ParticleBackground particleCount={particleCount} showLines={showLines} />
    </Canvas>
  );
}
