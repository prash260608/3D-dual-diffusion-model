import { useState } from 'react';
import type { Molecule } from '@/lib/moleculeData';

interface Props {
  visible: boolean;
  molecules: Molecule[];
  runId: string | null;
  onViewMolecule: (mol: Molecule) => void;
  selectedId: string | null;
}

function MolSVG({ atoms }: { atoms: string[] }) {
  const colors: Record<string, string> = { C: '#64748B', N: '#0EA5E9', O: '#F43F5E', S: '#EAB308', F: '#06B6D4', Cl: '#10B981', H: '#94A3B8' };
  const n = Math.min(atoms.length, 9);
  const size = 64;
  const r = size * 0.35;
  const cx = size / 2, cy = size / 2;

  const points: { x: number; y: number; sym: string }[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i / n) - Math.PI / 2;
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), sym: atoms[i] || 'C' });
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {n >= 3 && <polygon points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="hsl(var(--border-2))" strokeWidth="1.5" />}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill={colors[p.sym] || colors.C} />
          {p.sym !== 'H' && (
            <text x={p.x} y={p.y + 0.5} textAnchor="middle" dominantBaseline="middle" fill="hsl(var(--text-main))" fontSize="7" fontFamily="'JetBrains Mono', monospace" fontWeight="bold">{p.sym}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

export default function ResultsSection({ visible, molecules, runId, onViewMolecule, selectedId }: Props) {
  const [search, setSearch] = useState('');
  const [filterValidity, setFilterValidity] = useState('');
  const [filterLipinski, setFilterLipinski] = useState('');
  const [filterQed, setFilterQed] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  if (!visible) return null;

  const validMols = molecules.filter(m => m.valid);
  const topMols = [...validMols].sort((a, b) => b.qed - a.qed).slice(0, 20);

  // Full table filtering
  const filtered = molecules.filter(mol => {
    if (search && !mol.id.toLowerCase().includes(search.toLowerCase()) && !mol.protein.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterValidity === 'valid' && !mol.valid) return false;
    if (filterValidity === 'invalid' && mol.valid) return false;
    if (filterLipinski === 'pass' && !mol.lipinski) return false;
    if (filterLipinski === 'fail' && mol.lipinski) return false;
    if (filterQed && mol.qed < parseFloat(filterQed)) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const start = (page - 1) * pageSize;
  const pageData = filtered.slice(start, start + pageSize);
  const maxMW = Math.max(...(filtered.length ? filtered.map(m => m.mw) : [1]));
  const maxQED = Math.max(...(filtered.length ? filtered.map(m => m.qed) : [1]));

  return (
    <section className="py-16 border-b border-pmdm-border" id="results">
      <div className="max-w-[1400px] mx-auto px-8">
        <div className="font-mono text-[10px] font-semibold tracking-[0.12em] uppercase text-pmdm-accent mb-1.5">04 / Top Validated Molecules</div>
        <div className="text-xl font-semibold text-pmdm-text mb-5">Generation Results</div>

        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-pmdm-green/30 bg-pmdm-green-dim font-mono text-[11px] font-semibold text-pmdm-green">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="3" /></svg>
              {validMols.length} valid molecules
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-pmdm-accent-border bg-pmdm-accent-dim font-mono text-[11px] font-semibold text-pmdm-accent">
              Showing top {topMols.length} by QED score
            </span>
            <span className="inline-flex px-2.5 py-1 border border-pmdm-border bg-pmdm-bg2 font-mono text-[11px] text-pmdm-text3">
              Run: <span className="text-pmdm-text2 ml-1">{runId || '—'}</span>
            </span>
          </div>
        </div>

        {/* Top table */}
        <div className="overflow-x-auto border border-pmdm-border mb-14">
          <table className="w-full border-collapse font-mono text-xs">
            <thead className="sticky top-[52px] z-10">
              <tr>
                {['Candidate ID', 'Preview', 'Validity', 'QED', 'Lipinski', 'Mol. Weight', 'LogP', 'HBD', 'HBA', 'Action'].map(h => (
                  <th key={h} className="px-3.5 py-2.5 bg-pmdm-bg3 border-b border-pmdm-border text-pmdm-text3 text-[10px] font-semibold tracking-[0.08em] uppercase text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topMols.map(mol => (
                <tr
                  key={mol.id}
                  onClick={() => onViewMolecule(mol)}
                  className={`border-b border-pmdm-border cursor-pointer transition-colors hover:bg-pmdm-bg3 ${selectedId === mol.id ? 'bg-pmdm-accent-dim outline outline-1 outline-pmdm-accent-border -outline-offset-1' : ''}`}
                >
                  <td className="px-3.5 py-2 font-mono text-[11px] text-pmdm-text whitespace-nowrap">{mol.id}</td>
                  <td className="px-3.5 py-2"><div className="w-16 h-12 bg-pmdm-bg4 border border-pmdm-border flex items-center justify-center"><MolSVG atoms={mol.atoms} /></div></td>
                  <td className="px-3.5 py-2"><span className={`inline-flex items-center gap-1 px-[7px] py-0.5 font-mono text-[10px] font-semibold tracking-[0.05em] uppercase border ${mol.valid ? 'bg-pmdm-green-dim text-pmdm-green border-pmdm-green/25' : 'bg-pmdm-red-dim text-pmdm-red border-pmdm-red/25'}`}>{mol.valid ? '● VALID' : '● INVALID'}</span></td>
                  <td className="px-3.5 py-2 text-right font-mono text-xs text-pmdm-text relative">{mol.qed.toFixed(4)}<div className="absolute bottom-0 left-0 h-0.5 bg-pmdm-accent/30 rounded-sm" style={{ width: `${(mol.qed / maxQED * 100).toFixed(0)}%` }} /></td>
                  <td className="px-3.5 py-2"><span className={`inline-flex items-center gap-1 px-[7px] py-0.5 font-mono text-[10px] font-semibold uppercase border ${mol.lipinski ? 'bg-pmdm-green-dim text-pmdm-green border-pmdm-green/25' : 'bg-pmdm-red-dim text-pmdm-red border-pmdm-red/25'}`}>{mol.lipinski ? '✓ PASS' : '✗ FAIL'}</span></td>
                  <td className="px-3.5 py-2 text-right font-mono text-xs text-pmdm-text relative">{mol.mw.toFixed(2)}<div className="absolute bottom-0 left-0 h-0.5 bg-pmdm-accent/30 rounded-sm" style={{ width: `${(mol.mw / maxMW * 100).toFixed(0)}%` }} /></td>
                  <td className="px-3.5 py-2 text-right font-mono text-xs text-pmdm-text">{mol.logp.toFixed(3)}</td>
                  <td className="px-3.5 py-2 text-right font-mono text-xs text-pmdm-text">{mol.hbd}</td>
                  <td className="px-3.5 py-2 text-right font-mono text-xs text-pmdm-text">{mol.hba}</td>
                  <td className="px-3.5 py-2">
                    <button onClick={e => { e.stopPropagation(); onViewMolecule(mol); }} className="px-2.5 py-1 bg-transparent border border-pmdm-border text-pmdm-text2 font-mono text-[10px] font-semibold tracking-[0.06em] uppercase hover:border-pmdm-accent hover:text-pmdm-accent hover:bg-pmdm-accent-dim transition-all duration-150 whitespace-nowrap">View Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Full table */}
        <div className="font-mono text-[10px] font-semibold tracking-[0.12em] uppercase text-pmdm-accent mb-1.5">04b / Full Generated Set</div>
        <div className="text-xl font-semibold text-pmdm-text mb-1">All Generated Molecules</div>
        <p className="text-[13px] text-pmdm-text2 mb-5">Complete output with search, sort, and filter.</p>

        <div className="flex items-center gap-2.5 mb-3 flex-wrap">
          <div className="relative flex-1 max-w-[280px]">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-pmdm-text3 pointer-events-none"><path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.099zm-5.242 1.156a5.5 5.5 0 110-11 5.5 5.5 0 010 11z" /></svg>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search by Candidate ID…" className="pl-8 pr-3 py-[7px] bg-pmdm-bg2 border border-pmdm-border text-pmdm-text font-mono text-xs outline-none w-full focus:border-pmdm-accent transition-colors placeholder:text-pmdm-text3" />
          </div>
          {[
            { value: filterValidity, set: (v: string) => { setFilterValidity(v); setPage(1); }, opts: [['', 'All Validity'], ['valid', 'Valid only'], ['invalid', 'Invalid only']] },
            { value: filterLipinski, set: (v: string) => { setFilterLipinski(v); setPage(1); }, opts: [['', 'All Lipinski'], ['pass', 'Pass'], ['fail', 'Fail']] },
            { value: filterQed, set: (v: string) => { setFilterQed(v); setPage(1); }, opts: [['', 'All QED'], ['0.5', 'QED ≥ 0.5'], ['0.7', 'QED ≥ 0.7'], ['0.3', 'QED ≥ 0.3']] },
          ].map((f, i) => (
            <select key={i} value={f.value} onChange={e => f.set(e.target.value)} className="py-[7px] px-2.5 bg-pmdm-bg2 border border-pmdm-border text-pmdm-text2 font-mono text-[11px] outline-none cursor-pointer focus:border-pmdm-accent">
              {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
        </div>

        <div className="overflow-x-auto border border-pmdm-border">
          <table className="w-full border-collapse font-mono text-xs">
            <thead className="sticky top-[52px] z-10">
              <tr>
                {['Candidate ID', 'Preview', 'Protein', 'Validity', 'QED', 'Lipinski', 'MW (Da)', 'LogP', 'HBD', 'HBA', 'Action'].map(h => (
                  <th key={h} className="px-3.5 py-2.5 bg-pmdm-bg3 border-b border-pmdm-border text-pmdm-text3 text-[10px] font-semibold tracking-[0.08em] uppercase text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 ? (
                <tr><td colSpan={11} className="px-10 py-10 text-center text-pmdm-text3 font-mono text-xs">— No molecules match the current filter. —</td></tr>
              ) : pageData.map(mol => (
                <tr
                  key={mol.id}
                  onClick={() => onViewMolecule(mol)}
                  className={`border-b border-pmdm-border cursor-pointer transition-colors hover:bg-pmdm-bg3 ${selectedId === mol.id ? 'bg-pmdm-accent-dim outline outline-1 outline-pmdm-accent-border -outline-offset-1' : ''}`}
                >
                  <td className="px-3.5 py-2 font-mono text-[11px] text-pmdm-text whitespace-nowrap">{mol.id}</td>
                  <td className="px-3.5 py-2"><div className="w-16 h-12 bg-pmdm-bg4 border border-pmdm-border flex items-center justify-center"><MolSVG atoms={mol.atoms} /></div></td>
                  <td className="px-3.5 py-2 font-mono text-[11px] text-pmdm-text3">{mol.protein}</td>
                  <td className="px-3.5 py-2"><span className={`inline-flex items-center gap-1 px-[7px] py-0.5 font-mono text-[10px] font-semibold uppercase border ${mol.valid ? 'bg-pmdm-green-dim text-pmdm-green border-pmdm-green/25' : 'bg-pmdm-red-dim text-pmdm-red border-pmdm-red/25'}`}>{mol.valid ? '● VALID' : '● INVALID'}</span></td>
                  <td className="px-3.5 py-2 text-right font-mono text-xs text-pmdm-text">{mol.qed.toFixed(4)}</td>
                  <td className="px-3.5 py-2"><span className={`inline-flex items-center gap-1 px-[7px] py-0.5 font-mono text-[10px] font-semibold uppercase border ${mol.lipinski ? 'bg-pmdm-green-dim text-pmdm-green border-pmdm-green/25' : 'bg-pmdm-red-dim text-pmdm-red border-pmdm-red/25'}`}>{mol.lipinski ? '✓ PASS' : '✗ FAIL'}</span></td>
                  <td className="px-3.5 py-2 text-right font-mono text-xs text-pmdm-text">{mol.mw.toFixed(2)}</td>
                  <td className="px-3.5 py-2 text-right font-mono text-xs text-pmdm-text">{mol.logp.toFixed(3)}</td>
                  <td className="px-3.5 py-2 text-right font-mono text-xs text-pmdm-text">{mol.hbd}</td>
                  <td className="px-3.5 py-2 text-right font-mono text-xs text-pmdm-text">{mol.hba}</td>
                  <td className="px-3.5 py-2">
                    <button onClick={e => { e.stopPropagation(); onViewMolecule(mol); }} className="px-2.5 py-1 bg-transparent border border-pmdm-border text-pmdm-text2 font-mono text-[10px] font-semibold tracking-[0.06em] uppercase hover:border-pmdm-accent hover:text-pmdm-accent hover:bg-pmdm-accent-dim transition-all duration-150 whitespace-nowrap">View Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between py-2.5 mt-1">
          <span className="font-mono text-[11px] text-pmdm-text3">Showing {start + 1}–{Math.min(start + pageSize, filtered.length)} of {filtered.length} molecules</span>
          <div className="flex gap-1">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2.5 py-1 bg-pmdm-bg2 border border-pmdm-border text-pmdm-text2 font-mono text-[11px] hover:border-pmdm-accent hover:text-pmdm-accent disabled:opacity-30 disabled:cursor-not-allowed transition-all">← Prev</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-2.5 py-1 bg-pmdm-bg2 border border-pmdm-border text-pmdm-text2 font-mono text-[11px] hover:border-pmdm-accent hover:text-pmdm-accent disabled:opacity-30 disabled:cursor-not-allowed transition-all">Next →</button>
          </div>
        </div>
      </div>
    </section>
  );
}
