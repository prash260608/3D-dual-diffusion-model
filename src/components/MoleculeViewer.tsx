import { useEffect, useRef, useCallback } from 'react';
import type { Molecule } from '@/lib/moleculeData';
import { getAtomComposition, downloadBlob } from '@/lib/moleculeData';

interface Props {
  molecule: Molecule | null;
  runId: string | null;
  onClose: () => void;
}

const ATOM_COLORS: Record<string, string> = {
  C: '#64748B', N: '#0EA5E9', O: '#F43F5E', S: '#EAB308',
  F: '#06B6D4', Cl: '#10B981', H: '#94A3B8', Br: '#D97706',
  P: '#F97316', I: '#A855F7',
};

const ATOM_NAMES: Record<string, string> = {
  C: 'Carbon', N: 'Nitrogen', O: 'Oxygen', S: 'Sulfur',
  F: 'Fluorine', Cl: 'Chlorine', H: 'Hydrogen', Br: 'Bromine',
  P: 'Phosphorus', I: 'Iodine',
};

export default function MoleculeViewer({ molecule, runId, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const angleRef = useRef(0);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const rotX = useRef(0);
  const rotY = useRef(0);
  const zoomRef = useRef(1);

  const draw = useCallback(() => {
    if (!molecule || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    const isDark = document.documentElement.classList.contains('dark');
    ctx.fillStyle = isDark ? '#0B0E14' : '#F8FAFC';
    ctx.fillRect(0, 0, w, h);

    const { atoms, coords } = molecule;
    if (!coords.length) return;

    const cosA = Math.cos(rotY.current + angleRef.current);
    const sinA = Math.sin(rotY.current + angleRef.current);
    const cosB = Math.cos(rotX.current);
    const sinB = Math.sin(rotX.current);
    const scale = Math.min(w, h) * 0.18 * zoomRef.current;
    const cx = w / 2, cy = h / 2;

    // Center
    let sumX = 0, sumY = 0, sumZ = 0;
    coords.forEach(c => { sumX += c[0]; sumY += c[1]; sumZ += c[2]; });
    const n = coords.length;
    const meanX = sumX / n, meanY = sumY / n, meanZ = sumZ / n;

    // Project
    const projected = coords.map((c, i) => {
      const rx = c[0] - meanX, ry = c[1] - meanY, rz = c[2] - meanZ;
      const x2 = rx * cosA - rz * sinA;
      const z2 = rx * sinA + rz * cosA;
      const y2 = ry * cosB - z2 * sinB;
      const z3 = ry * sinB + z2 * cosB;
      return { sx: cx + x2 * scale, sy: cy + y2 * scale, z: z3, idx: i };
    }).sort((a, b) => a.z - b.z);

    // Draw bonds
    for (const p of projected) {
      for (const q of projected) {
        if (q.idx <= p.idx) continue;
        const dx = p.sx - q.sx, dy = p.sy - q.sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < scale * 3.5 && dist > 2) {
          ctx.beginPath();
          ctx.moveTo(p.sx, p.sy);
          ctx.lineTo(q.sx, q.sy);
          ctx.strokeStyle = isDark ? 'rgba(100,120,150,0.4)' : 'rgba(100,120,150,0.3)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    // Draw atoms with labels
    for (const p of projected) {
      const sym = atoms[p.idx] || 'C';
      const r = sym === 'H' ? 18 : 32;
      const depthFactor = 0.7 + 0.3 * ((p.z + 5) / 10);
      const col = ATOM_COLORS[sym] || ATOM_COLORS.C;

      // Atom sphere with glow
      const gradient = ctx.createRadialGradient(p.sx - r * 0.2, p.sy - r * 0.2, r * 0.1, p.sx, p.sy, r * depthFactor);
      gradient.addColorStop(0, col + 'DD');
      gradient.addColorStop(0.7, col);
      gradient.addColorStop(1, col + '88');

      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r * depthFactor, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label
      if (sym !== 'H') {
        ctx.font = `bold ${Math.round(20 * depthFactor)}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(sym, p.sx, p.sy);
      }
    }

    if (!isDragging.current) {
      angleRef.current += 0.005;
    }
    animRef.current = requestAnimationFrame(draw);
  }, [molecule]);

  useEffect(() => {
    if (!molecule) return;
    angleRef.current = 0;
    rotX.current = 0;
    rotY.current = 0;
    zoomRef.current = 1;
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [molecule, draw]);

  function handleMouseDown(e: React.MouseEvent) {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    rotY.current += dx * 0.01;
    rotX.current += dy * 0.01;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }
  function handleMouseUp() { isDragging.current = false; }
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    zoomRef.current = Math.max(0.3, Math.min(3, zoomRef.current - e.deltaY * 0.001));
  }

  function downloadSDF() {
    if (!molecule) return;
    const content = `CANDIDATE ${molecule.id}\nProtein: ${molecule.protein}\nRun: ${runId}\nQED: ${molecule.qed}\nMW: ${molecule.mw}\nLogP: ${molecule.logp}\nHBD: ${molecule.hbd}\nHBA: ${molecule.hba}\nValid: ${molecule.valid}\nLipinski: ${molecule.lipinski}\n\n$$$$\n`;
    downloadBlob(content, `${molecule.id}.sdf`, 'text/plain');
  }

  function downloadJSON() {
    if (!molecule) return;
    const data = {
      id: molecule.id, protein: molecule.protein, valid: molecule.valid,
      qed: molecule.qed, lipinski: molecule.lipinski, mw: molecule.mw,
      logp: molecule.logp, hbd: molecule.hbd, hba: molecule.hba,
      rotBonds: molecule.rotBonds, tpsa: molecule.tpsa, fsp3: molecule.fsp3,
      numAtoms: molecule.numAtoms, atoms: molecule.atoms, coords: molecule.coords,
      source: molecule.source, run_id: runId, model: 'MINI-PMDM-V1',
    };
    downloadBlob(JSON.stringify(data, null, 2), `${molecule.id}.json`, 'application/json');
  }

  if (!molecule) return null;

  const atomComp = getAtomComposition(molecule.atoms);

  return (
    <div className="fixed inset-0 z-[400] flex">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Content */}
      <div className="relative flex w-full h-full">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center bg-pmdm-bg3 border border-pmdm-border text-pmdm-text3 hover:text-pmdm-red hover:border-pmdm-red text-xl font-bold transition-all duration-150"
        >
          ×
        </button>

        {/* Left: 3D Viewer (70%) */}
        <div className="w-[70%] h-full relative bg-pmdm-bg">
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          />
          <div className="absolute top-4 left-4 px-2 py-1 bg-pmdm-accent-dim border border-pmdm-accent-border font-mono text-[9px] text-pmdm-accent font-semibold tracking-[0.08em] uppercase">
            3D INTERACTIVE · DRAG TO ROTATE · SCROLL TO ZOOM
          </div>
          <div className="absolute bottom-4 left-4 font-mono text-[11px] text-pmdm-text3">
            {molecule.id} · {molecule.numAtoms} atoms · {molecule.protein}
          </div>
          {/* Atom legend */}
          <div className="absolute bottom-4 right-4 flex gap-2 flex-wrap max-w-[300px]">
            {atomComp.map(([sym, cnt]) => (
              <div key={sym} className="flex items-center gap-1.5 px-2 py-1 bg-pmdm-bg2/80 border border-pmdm-border backdrop-blur-sm">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ATOM_COLORS[sym] || ATOM_COLORS.C }} />
                <span className="font-mono text-[10px] text-pmdm-text font-bold">{sym}</span>
                <span className="font-mono text-[9px] text-pmdm-text3">{ATOM_NAMES[sym] || sym} ×{cnt}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Properties (30%) */}
        <div className="w-[30%] h-full bg-pmdm-bg2 border-l border-pmdm-border overflow-y-auto flex flex-col">
          <div className="px-5 py-4 border-b border-pmdm-border bg-pmdm-bg3 shrink-0">
            <div className="font-mono text-[11px] font-bold tracking-[0.08em] uppercase text-pmdm-text2">
              Molecule Details · <span className="text-pmdm-accent">{molecule.id}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* Identity */}
            <SectionTitle>Molecular Identity</SectionTitle>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <DescItem label="Candidate ID" value={molecule.id} accent />
              <DescItem label="Protein Target" value={molecule.protein} />
              <DescItem label="Run ID" value={runId || '—'} small />
              <DescItem label="Source" value={molecule.source} small />
            </div>

            {/* Validation */}
            <SectionTitle>Validation Status</SectionTitle>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <div className={`p-2.5 bg-pmdm-bg3 border ${molecule.valid ? 'border-pmdm-green/30' : 'border-pmdm-red/30'}`}>
                <div className="font-mono text-[9px] font-semibold tracking-[0.1em] uppercase text-pmdm-text3 mb-1">Validity</div>
                <div className={`font-mono text-base font-bold ${molecule.valid ? 'text-pmdm-green' : 'text-pmdm-red'}`}>{molecule.valid ? '✓ VALID' : '✗ INVALID'}</div>
              </div>
              <div className={`p-2.5 bg-pmdm-bg3 border ${molecule.lipinski ? 'border-pmdm-green/30' : 'border-pmdm-red/30'}`}>
                <div className="font-mono text-[9px] font-semibold tracking-[0.1em] uppercase text-pmdm-text3 mb-1">Lipinski Ro5</div>
                <div className={`font-mono text-base font-bold ${molecule.lipinski ? 'text-pmdm-green' : 'text-pmdm-red'}`}>{molecule.lipinski ? '✓ PASS' : '✗ FAIL'}</div>
              </div>
            </div>

            {/* Properties */}
            <SectionTitle>Drug-likeness Properties</SectionTitle>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <DescItem label="QED Score" value={molecule.qed.toFixed(4)} accent />
              <DescItem label="Mol. Weight" value={`${molecule.mw.toFixed(2)} Da`} />
              <DescItem label="LogP" value={molecule.logp.toFixed(3)} />
              <DescItem label="TPSA" value={`${molecule.tpsa.toFixed(1)} Å²`} />
              <DescItem label="HBD" value={String(molecule.hbd)} />
              <DescItem label="HBA" value={String(molecule.hba)} />
              <DescItem label="Rot. Bonds" value={String(molecule.rotBonds)} />
              <DescItem label="Fsp3" value={molecule.fsp3.toFixed(3)} />
            </div>

            {/* Lipinski breakdown */}
            <SectionTitle>Lipinski Rule-of-5 Breakdown</SectionTitle>
            <div className="mb-5">
              {[
                ['MW ≤ 500 Da', molecule.mw <= 500, `${molecule.mw.toFixed(2)} Da`],
                ['LogP ≤ 5', molecule.logp <= 5, molecule.logp.toFixed(3)],
                ['HBD ≤ 5', molecule.hbd <= 5, `${molecule.hbd} donors`],
                ['HBA ≤ 10', molecule.hba <= 10, `${molecule.hba} acceptors`],
              ].map(([rule, pass, val]) => (
                <div key={rule as string} className="flex items-center justify-between py-[7px] px-3 border-b border-pmdm-border font-mono text-[11px] last:border-b-0">
                  <span className="text-pmdm-text2">{rule as string}</span>
                  <span className="text-pmdm-text3 text-[10px]">{val as string}</span>
                  <span className={`font-semibold ${pass ? 'text-pmdm-green' : 'text-pmdm-red'}`}>{pass ? '✓ PASS' : '✗ FAIL'}</span>
                </div>
              ))}
            </div>

            {/* Atom composition */}
            <SectionTitle>Atom Composition</SectionTitle>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {atomComp.map(([sym, cnt]) => (
                <div key={sym} className="px-2 py-1 bg-pmdm-bg3 border border-pmdm-border font-mono text-[11px]">
                  <span className="text-pmdm-accent">{sym}</span>
                  <span className="text-pmdm-text3 ml-1">×{cnt}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer downloads */}
          <div className="px-5 py-4 border-t border-pmdm-border bg-pmdm-bg3 shrink-0 flex flex-col gap-2">
            <button onClick={downloadSDF} className="flex items-center justify-center gap-2 w-full py-2.5 bg-pmdm-accent-dim border border-pmdm-accent-border text-pmdm-accent font-mono text-xs font-semibold tracking-[0.06em] uppercase hover:bg-pmdm-accent hover:text-pmdm-bg transition-all duration-150">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M.5 9.9a.5.5 0 01.5.5v2.5a1 1 0 001 1h12a1 1 0 001-1v-2.5a.5.5 0 011 0v2.5a2 2 0 01-2 2H2a2 2 0 01-2-2v-2.5a.5.5 0 01.5-.5z" /><path d="M7.646 11.854a.5.5 0 00.708 0l3-3a.5.5 0 00-.708-.708L8.5 10.293V1.5a.5.5 0 00-1 0v8.793L5.354 8.146a.5.5 0 10-.708.708l3 3z" /></svg>
              Download .SDF
            </button>
            <button onClick={downloadJSON} className="flex items-center justify-center gap-2 w-full py-2.5 bg-transparent border border-pmdm-border text-pmdm-text2 font-mono text-xs font-medium tracking-[0.06em] uppercase hover:text-pmdm-accent hover:border-pmdm-accent hover:bg-pmdm-accent-dim transition-all duration-150">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M.5 9.9a.5.5 0 01.5.5v2.5a1 1 0 001 1h12a1 1 0 001-1v-2.5a.5.5 0 011 0v2.5a2 2 0 01-2 2H2a2 2 0 01-2-2v-2.5a.5.5 0 01.5-.5z" /><path d="M7.646 11.854a.5.5 0 00.708 0l3-3a.5.5 0 00-.708-.708L8.5 10.293V1.5a.5.5 0 00-1 0v8.793L5.354 8.146a.5.5 0 10-.708.708l3 3z" /></svg>
              Download .JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] font-bold tracking-[0.1em] uppercase text-pmdm-text3 mb-2.5 pb-1.5 border-b border-pmdm-border">
      {children}
    </div>
  );
}

function DescItem({ label, value, accent, small }: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return (
    <div className="p-2.5 bg-pmdm-bg3 border border-pmdm-border">
      <div className="font-mono text-[9px] font-semibold tracking-[0.1em] uppercase text-pmdm-text3 mb-1">{label}</div>
      <div className={`font-mono font-bold ${accent ? 'text-pmdm-accent' : 'text-pmdm-text'} ${small ? 'text-[10px] pt-0.5' : 'text-base'}`}>{value}</div>
    </div>
  );
}
