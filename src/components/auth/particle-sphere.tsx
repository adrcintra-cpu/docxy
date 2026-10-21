"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Esfera orgânica de pontos luminosos (tela de login).
 *
 * Desempenho
 * - Canvas 2D, um único path por quadro; nº de pontos escala com a área e o DPR é limitado a 2.
 * - Pausa quando a aba fica oculta ou o elemento sai da tela.
 * - Modo estático (um quadro só) com prefers-reduced-motion, poucos núcleos/memória
 *   ou quando o quadro passa de ~32 ms repetidamente.
 * - Antes do JS carregar, o fallback CSS mostra um brilho azul no mesmo lugar.
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
    const lowPower = (nav.hardwareConcurrency ?? 8) < 4 || (nav.deviceMemory ?? 8) < 4;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animate = !reduced && !lowPower;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let points: Float32Array = new Float32Array(0); // x, y, z por ponto (esfera unitária)

    function build() {
      const rect = canvas!.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Distribuição de Fibonacci: pontos uniformes na esfera.
      const count = Math.round(Math.min(9000, Math.max(2500, (width * height) / 55)));
      points = new Float32Array(count * 3);
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < count; i++) {
        const y = 1 - (i / (count - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const theta = golden * i;
        points[i * 3] = Math.cos(theta) * r;
        points[i * 3 + 1] = y;
        points[i * 3 + 2] = Math.sin(theta) * r;
      }
    }

    function draw(t: number) {
      const c = ctx!;
      c.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.42;
      const rot = t * 0.00008;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const tw = t * 0.0006;

      // Halo suave na borda (rim light).
      const halo = c.createRadialGradient(cx, cy, radius * 0.82, cx, cy, radius * 1.12);
      halo.addColorStop(0, "rgba(80,130,220,0)");
      halo.addColorStop(0.55, "rgba(110,160,240,0.22)");
      halo.addColorStop(1, "rgba(80,130,220,0)");
      c.fillStyle = halo;
      c.fillRect(0, 0, width, height);

      // Agrupa por brilho em 4 faixas: poucas trocas de fillStyle.
      const bands: number[][] = [[], [], [], []];
      for (let i = 0; i < points.length; i += 3) {
        const px = points[i]!;
        const py = points[i + 1]!;
        const pz = points[i + 2]!;
        // Deformação orgânica: ondas sobre a superfície.
        const wobble =
          1 +
          0.07 * Math.sin(3 * px + tw) * Math.cos(2 * py - tw * 0.8) +
          0.05 * Math.sin(4 * pz + py * 2 + tw * 1.3);
        const x = (px * cosR - pz * sinR) * wobble;
        const z = (px * sinR + pz * cosR) * wobble;
        const y = py * wobble;
        const depth = (z + 1.1) / 2.2; // 0 (fundo) … 1 (frente)
        // Borda mais brilhante (efeito de rim light das referências).
        const rim = Math.min(1, Math.pow(Math.hypot(x, y), 4) * 1.5);
        const light = Math.min(1, depth * 0.75 + rim * 0.7);
        const band = Math.min(3, Math.floor(light * 4));
        bands[band]!.push(cx + x * radius, cy + y * radius, 1 + depth * 1.5 + rim * 0.6);
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
    let slowFrames = 0;
    let visible = true;

    function loop(t: number) {
      if (last && t - last > 32) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      last = t;
      draw(t);
      if (slowFrames > 30) {
        animate = false; // dispositivo não acompanha: congela no quadro atual
        return;
      }
      if (animate && visible && !document.hidden) raf = requestAnimationFrame(loop);
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

    return () => {
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
