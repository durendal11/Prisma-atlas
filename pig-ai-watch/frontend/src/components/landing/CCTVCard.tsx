/**
 * PRISMA ATLAS — CCTV Card (Hero Visual)
 * Animated SVG detection overlay with scan-lines, pulsing polygons, and live clock
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function CCTVCard() {
  const [time, setTime] = useState('00:00:00');

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, x: 80, rotateY: 10 }}
      animate={{ opacity: 1, x: 0, rotateY: 0 }}
      transition={{ duration: 1, delay: 0.8, ease: 'easeOut' }}
      className="relative w-full max-w-lg mx-auto"
    >
      <div className="rounded-2xl overflow-hidden border border-white/10 bg-slate-900/80 backdrop-blur-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-white/5 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="text-red-400 font-semibold tracking-wider">REC</span>
          </div>
          <span className="text-white/50">CAM 01 — PEN A</span>
          <span className="text-emerald-400 tabular-nums">{time}</span>
        </div>

        {/* CCTV Body */}
        <div className="relative aspect-video bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden">
          {/* Scan lines */}
          <div
            className="pointer-events-none absolute inset-0 z-30 opacity-[0.04]"
            style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.05) 2px, rgba(255,255,255,0.05) 4px)',
            }}
          />
          {/* Grid */}
          <div
            className="pointer-events-none absolute inset-0 z-20 opacity-[0.06]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />

          {/* Detection SVG */}
          <svg className="absolute inset-0 w-full h-full z-10" viewBox="0 0 500 280" preserveAspectRatio="xMidYMid slice">
            {/* Sow polygon */}
            <motion.polygon
              points="80,100 180,85 220,95 240,130 235,180 220,200 180,210 100,200 70,170 65,140"
              fill="rgba(99,102,241,0.12)"
              stroke="#6366f1"
              strokeWidth="1.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
            <text x="150" y="155" fill="#a5b4fc" fontSize="11" fontFamily="monospace" textAnchor="middle" fontWeight="600">SOW-SLEEP</text>
            <text x="150" y="172" fill="#6366f1" fontSize="9" fontFamily="monospace" textAnchor="middle">98.2%</text>

            {/* Piglet polygons */}
            {[
              { points: '120,210 145,205 155,215 150,235 130,240 115,230', x: 135, y: 225 },
              { points: '200,200 225,195 240,205 235,225 215,230 195,220', x: 217, y: 215 },
              { points: '270,210 295,205 310,218 305,238 285,242 265,232', x: 287, y: 228 },
              { points: '320,195 345,190 360,200 355,220 335,225 315,215', x: 337, y: 210 },
            ].map((p, i) => (
              <g key={i}>
                <motion.polygon
                  points={p.points}
                  fill="rgba(244,114,182,0.12)"
                  stroke="#f472b6"
                  strokeWidth="1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.4, 0.9, 0.4] }}
                  transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.3 }}
                />
                <text x={p.x} y={p.y} fill="#f9a8d4" fontSize="8" fontFamily="monospace" textAnchor="middle">PIGLET</text>
              </g>
            ))}

            {/* Detection lines */}
            <line x1="135" y1="210" x2="180" y2="180" stroke="#fbbf24" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.5" />
            <line x1="217" y1="200" x2="200" y2="175" stroke="#fbbf24" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.5" />
            <line x1="287" y1="210" x2="230" y2="170" stroke="#34d399" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.4" />
            <line x1="337" y1="195" x2="235" y2="160" stroke="#34d399" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.4" />
          </svg>

          {/* Alert badge */}
          <motion.div
            className="absolute top-3 right-3 z-20 flex items-center gap-2 bg-red-500/20 border border-red-500/40 rounded-lg px-3 py-1.5"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" /></svg>
            <div className="text-xs font-mono">
              <div className="text-red-300 font-semibold">CRUSHING RISK</div>
              <div className="text-red-200 text-[11px]">72%</div>
            </div>
          </motion.div>

          {/* Bottom stats */}
          <div className="absolute bottom-3 left-3 z-20 flex gap-3 text-xs font-mono text-white/60">
            <span>🐷 1 Sow</span>
            <span>🐽 4 Piglets</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
