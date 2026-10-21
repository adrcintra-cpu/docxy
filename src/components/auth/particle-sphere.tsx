"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Esfera orgânica de pontos luminosos (tela de login).
 *
 * Desempenho
 * - Canvas 2D, um único path por quadro; nº de pontos escala com a área e o DPR é limitado a 2.
 * - Pausa quando a aba fica oculta ou o elemento sai da tela.
 * - Qualidade adaptativa: se o quadro médio passar de ~40 ms (abaixo de 25 fps), a
 *   densidade de pontos cai em degraus até 35%. A animação nunca é desligada por
 *   desempenho; 30 fps (Safari em economia de bateria) é tratado como normal.
 * - Modo estático (um quadro só) apenas com prefers-reduced-motion.
 * - Antes do JS carregar, o fallback CSS mostra um brilho azul no mesmo lugar.
 *
 * Visual: pontos ligados aos 3 vizinhos mais próximos por linhas finas (malha).
 * Interação: a esfera inclina na direção do cursor e a superfície sob ele afunda
 * para trás, com atraso suave. Funciona também com toque (arrastar).
 */
export function ParticleSphere({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const nav = navigator as Navigator & { deviceMemory?: number };
    const lowPower = (nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animate = !reduced;
    /** Fração da densidade máxima de pontos (1 = cheia). Aparelhos modestos começam mais leves. */
    let quality = lowPower ? 0.6 : 1;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let points: Float32Array = new Float32Array(0); // x, y, z por ponto (esfera unitária)
    let links: Uint32Array = new Uint32Array(0); // pares (i, j) de vizinhos ligados por linha
    let screen: Float32Array = new Float32Array(0); // por ponto: x e y na tela, profundidade (0–1)

    /** Liga cada ponto aos seus vizinhos mais próximos (hash espacial 3D, O(n)). */
    function buildLinks(count: number) {
      const NEIGHBORS = 3;
      const cell = Math.sqrt((4 * Math.PI) / count) * 1.6;
      const cells = Math.ceil(2 / cell) + 1;
      const key = (x: number, y: number, z: number) =>
        (Math.floor((x + 1) / cell) * cells + Math.floor((y + 1) / cell)) * cells + Math.floor((z + 1) / cell);
      const grid = new Map<number, number[]>();
      for (let i = 0; i < count; i++) {
        const k = key(points[i * 3]!, points[i * 3 + 1]!, points[i * 3 + 2]!);
        const list = grid.get(k);
        if (list) list.push(i);
        else grid.set(k, [i]);
      }
      const pairs = new Set<number>();
      const out: number[] = [];
      const best: [number, number][] = [];
      for (let i = 0; i < count; i++) {
        const x = points[i * 3]!;
        const y = points[i * 3 + 1]!;
        const z = points[i * 3 + 2]!;
        const gx = Math.floor((x + 1) / cell);
        const gy = Math.floor((y + 1) / cell);
        const gz = Math.floor((z + 1) / cell);
        best.length = 0;
        for (let ax = -1; ax <= 1; ax++)
          for (let ay = -1; ay <= 1; ay++)
            for (let az = -1; az <= 1; az++) {
              const list = grid.get(((gx + ax) * cells + gy + ay) * cells + gz + az);
              if (!list) continue;
              for (const j of list) {
                if (j === i) continue;
                const dx = points[j * 3]! - x;
                const dy = points[j * 3 + 1]! - y;
                const dz = points[j * 3 + 2]! - z;
                best.push([dx * dx + dy * dy + dz * dz, j]);
              }
            }
        best.sort((m, n) => m[0] - n[0]);
        for (let k = 0; k < Math.min(NEIGHBORS, best.length); k++) {
          const j = best[k]![1];
          const id = i < j ? i * count + j : j * count + i;
          if (pairs.has(id)) continue;
          pairs.add(id);
          out.push(i, j);
        }
      }
      links = Uint32Array.from(out);
    }

    function build() {
      const rect = canvas!.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Distribuição de Fibonacci: pontos uniformes na esfera.
      const full = Math.min(8100, Math.max(2250, (width * height) / 61));
      const count = Math.max(1100, Math.round(full * quality));
      points = new Float32Array(count * 3);
      screen = new Float32Array(count * 3);
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < count; i++) {
        const y = 1 - (i / (count - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const theta = golden * i;
        points[i * 3] = Math.cos(theta) * r;
        points[i * 3 + 1] = y;
        points[i * 3 + 2] = Math.sin(theta) * r;
      }
      buildLinks(count);
    }

    // Interação com o ponteiro: posição bruta + valores suavizados a cada quadro.
    const pointer = { x: 0, y: 0, inside: false };
    let tiltX = 0;
    let tiltY = 0;
    let focusX = 0;
    let focusY = 0;
    let focus = 0; // 0 = sem ponteiro, 1 = ponteiro presente

    function draw(t: number) {
      const c = ctx!;
      c.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.42;

      // Inclina na direção do cursor e segue o ponto de foco com atraso (movimento orgânico).
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      const targetX = pointer.inside ? clamp((pointer.x - cx) / (width * 0.75)) : 0;
      const targetY = pointer.inside ? clamp((pointer.y - cy) / (height * 0.75)) : 0;
      tiltX += (targetX - tiltX) * 0.05;
      tiltY += (targetY - tiltY) * 0.05;
      focusX += (pointer.x - focusX) * 0.12;
      focusY += (pointer.y - focusY) * 0.12;
      focus += ((pointer.inside ? 1 : 0) - focus) * 0.06;

      const rot = t * 0.00008 + tiltX * 0.6;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const tilt = -tiltY * 0.45;
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);
      const tw = t * 0.0006;
      const reach = radius * 0.5;
      const reach2 = reach * reach;
      // Perspectiva leve: o que está atrás fica um pouco menor e mais perto do centro.
      const persp = (z: number) => 1 + z * 0.12;

      // Halo suave na borda (rim light).
      const halo = c.createRadialGradient(cx, cy, radius * 0.82, cx, cy, radius * 1.12);
      halo.addColorStop(0, "rgba(80,130,220,0)");
      halo.addColorStop(0.55, "rgba(110,160,240,0.22)");
      halo.addColorStop(1, "rgba(80,130,220,0)");
      c.fillStyle = halo;
      c.fillRect(0, 0, width, height);

      // Agrupa por brilho em 4 faixas: poucas trocas de fillStyle.
      const bands: number[][] = [[], [], [], []];
      const n = points.length / 3;
      for (let i = 0; i < n; i++) {
        const px = points[i * 3]!;
        const py = points[i * 3 + 1]!;
        const pz = points[i * 3 + 2]!;
        // Deformação orgânica: ondas sobre a superfície.
        let wobble =
          1 +
          0.07 * Math.sin(3 * px + tw) * Math.cos(2 * py - tw * 0.8) +
          0.05 * Math.sin(4 * pz + py * 2 + tw * 1.3);
        let x = (px * cosR - pz * sinR) * wobble;
        let z0 = (px * sinR + pz * cosR) * wobble;
        let y0 = py * wobble;
        let y = y0 * cosT - z0 * sinT;
        let z = y0 * sinT + z0 * cosT;
        let dent = 0;

        // Perto do cursor, a superfície visível afunda para dentro (amassado suave).
        if (focus > 0.01 && z > -0.15) {
          const p = persp(z);
          const dx = cx + x * radius * p - focusX;
          const dy = cy + y * radius * p - focusY;
          const d2 = dx * dx + dy * dy;
          if (d2 < reach2) {
            const f = (1 - Math.sqrt(d2) / reach) ** 2 * focus;
            const sink = 1 - f * 0.42 * Math.max(0, z); // empurra em direção ao centro
            wobble *= sink;
            x *= sink;
            y *= sink;
            z = z * sink - f * 0.7; // e para trás, longe do observador
            dent = f;
          }
        }

        const depth = Math.max(0, Math.min(1, (z + 1.1) / 2.2)); // 0 (fundo) … 1 (frente)
        // Borda mais brilhante (efeito de rim light das referências).
        const rim = Math.min(1, Math.pow(Math.hypot(x, y), 4) * 1.5);
        // No fundo do amassado os pontos ficam menores e mais escuros, como se estivessem na sombra.
        const light = (depth * 0.75 + rim * 0.7) * (1 - dent * 0.55);
        const size = (0.9 + depth * 1.5 + rim * 0.6) * (1 - dent * 0.35);
        const p = persp(z);
        const sx = cx + x * radius * p;
        const sy = cy + y * radius * p;
        screen[i * 3] = sx;
        screen[i * 3 + 1] = sy;
        screen[i * 3 + 2] = depth;

        const band = Math.min(3, Math.floor(Math.min(1, light) * 4));
        bands[band]!.push(sx, sy, size);
      }

      // Linhas entre vizinhos: atrás quase invisíveis, na frente mais nítidas.
      const lineBands: Path2D[] = [new Path2D(), new Path2D(), new Path2D()];
      for (let k = 0; k < links.length; k += 2) {
        const a = links[k]! * 3;
        const b = links[k + 1]! * 3;
        const d = (screen[a + 2]! + screen[b + 2]!) / 2;
        const path = lineBands[d < 0.42 ? 0 : d < 0.68 ? 1 : 2]!;
        path.moveTo(screen[a]!, screen[a + 1]!);
        path.lineTo(screen[b]!, screen[b + 1]!);
      }
      c.lineWidth = 0.6;
      const lineColors = ["rgba(80,125,205,0.07)", "rgba(110,155,235,0.16)", "rgba(160,200,255,0.3)"];
      for (let l = 0; l < 3; l++) {
        c.strokeStyle = lineColors[l]!;
        c.stroke(lineBands[l]!);
      }

      const colors = ["rgba(60,105,190,0.35)", "rgba(90,145,230,0.6)", "rgba(140,190,255,0.85)", "rgba(215,232,255,1)"];
      for (let b = 0; b < 4; b++) {
        const list = bands[b]!;
        c.fillStyle = colors[b]!;
        c.beginPath();
        for (let i = 0; i < list.length; i += 3) {
          const s = list[i + 2]!;
          c.rect(list[i]! - s / 2, list[i + 1]! - s / 2, s, s);
        }
        c.fill();
      }
    }

    let raf = 0;
    let last = 0;
    let avgFrame = 16; // média móvel do intervalo entre quadros, em ms
    let frames = 0;
    let visible = true;

    function loop(t: number) {
      const dt = last ? t - last : 16;
      last = t;
      // Ignora pausas longas (troca de aba, janela em segundo plano).
      if (dt < 250) avgFrame = avgFrame * 0.92 + dt * 0.08;
      frames++;
      // A cada ~1 s, se estiver abaixo de 25 fps, reduz a densidade em vez de parar.
      if (frames % 60 === 0 && avgFrame > 40 && quality > 0.35) {
        quality = Math.max(0.35, quality * 0.7);
        build();
        avgFrame = 16;
      }
      draw(t);
      if (visible && !document.hidden) raf = requestAnimationFrame(loop);
    }

    function start() {
      cancelAnimationFrame(raf);
      last = 0;
      if (animate) raf = requestAnimationFrame(loop);
      else draw(12000);
    }

    build();
    start();
    setReady(true);

    const ro = new ResizeObserver(() => {
      build();
      if (!animate) draw(12000);
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) start();
      else cancelAnimationFrame(raf);
    });
    io.observe(canvas);

    const onVisibility = () => (document.hidden ? cancelAnimationFrame(raf) : start());
    document.addEventListener("visibilitychange", onVisibility);

    // O canvas fica atrás do painel (pointer-events: none), então ouvimos a janela.
    // Em modo estático (movimento reduzido ou aparelho fraco) não há interação.
    const onPointerMove = (e: PointerEvent) => {
      if (!animate) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      if (!pointer.inside) {
        focusX = pointer.x;
        focusY = pointer.y;
      }
      pointer.inside = true;
    };
    const onPointerLeave = () => {
      pointer.inside = false;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("blur", onPointerLeave);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onPointerLeave);
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className={className} aria-hidden>
      {/* Fallback estático (antes do JS / sem canvas) */}
      <div
        className="absolute inset-[12%] rounded-full transition-opacity duration-700"
        style={{
          opacity: ready ? 0 : 1,
          background:
            "radial-gradient(circle at 50% 50%, rgba(60,95,160,.15) 0%, rgba(60,95,160,.08) 55%, rgba(150,190,255,.35) 68%, transparent 72%)",
        }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full transition-opacity duration-700"
        style={{ opacity: ready ? 1 : 0 }}
      />
    </div>
  );
}
