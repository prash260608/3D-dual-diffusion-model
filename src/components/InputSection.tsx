import { useRef, useState } from 'react';

type SourceType = 'pdb' | 'zip' | 'random';

interface Props {
  source: SourceType;
  onSourceChange: (s: SourceType) => void;
  file: File | null;
  onFileChange: (f: File | null) => void;
}

const SOURCE_OPTIONS: { key: SourceType; title: string; desc: string; icon: 'pdb' | 'zip' | 'db'; accept: string }[] = [
  { key: 'pdb', title: 'Single PDB File', desc: 'Upload a single .pdb protein pocket file for targeted generation', icon: 'pdb', accept: '.pdb' },
  { key: 'zip', title: 'ZIP of PDB Files', desc: 'Upload a ZIP archive containing multiple _pocket.pdb and _ligand.sdf pairs', icon: 'zip', accept: '.zip' },
  { key: 'random', title: 'Random Dataset', desc: 'Use our built-in PDBBind reference set with 3 curated protein targets', icon: 'db', accept: '' },
];

function SourceIcon({ type }: { type: 'pdb' | 'zip' | 'db' }) {
  if (type === 'pdb') return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M12 18v-6" /><path d="M9 15h6" /></svg>;
  if (type === 'zip') return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>;
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>;
}

export default function InputSection({ source, onSourceChange, file, onFileChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');

  const currentOpt = SOURCE_OPTIONS.find(o => o.key === source)!;

  function handleFile(f: File) {
    if (source === 'pdb' && !f.name.endsWith('.pdb')) { setError('Error: Only .pdb files are accepted.'); return; }
    if (source === 'zip' && !f.name.endsWith('.zip')) { setError('Error: Only .zip files are accepted.'); return; }
    if (f.size > 500 * 1024 * 1024) { setError('Error: File exceeds 500 MB limit.'); return; }
    setError('');
    onFileChange(f);
  }

  return (
    <section className="py-16 border-b border-pmdm-border" id="input">
      <div className="max-w-[1400px] mx-auto px-8">
        <div className="font-mono text-[10px] font-semibold tracking-[0.12em] uppercase text-pmdm-accent mb-1.5">01 / Input Source</div>
        <div className="text-xl font-semibold text-pmdm-text mb-1">Dataset Configuration</div>
        <p className="text-[13px] text-pmdm-text2 mb-8">Select a molecule dataset source. Only one input mode is active at a time.</p>

        {/* 3-column source cards */}
        <div className="grid grid-cols-3 gap-3 max-w-[900px] mb-8">
          {SOURCE_OPTIONS.map(opt => (
            <div
              key={opt.key}
              onClick={() => { onSourceChange(opt.key); onFileChange(null); setError(''); }}
              className={`relative p-5 border cursor-pointer select-none transition-all duration-150 ${source === opt.key ? 'border-pmdm-accent bg-pmdm-accent-dim' : 'border-pmdm-border bg-pmdm-bg2 hover:border-pmdm-border2 hover:bg-pmdm-bg3'}`}
            >
              {source === opt.key && <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-pmdm-accent shadow-[0_0_8px_hsl(var(--accent-main))]" />}
              <div className={`mb-2.5 ${source === opt.key ? 'text-pmdm-accent' : 'text-pmdm-text3'}`}>
                <SourceIcon type={opt.icon} />
              </div>
              <div className={`font-mono text-xs font-bold tracking-[0.06em] uppercase mb-1 ${source === opt.key ? 'text-pmdm-accent' : 'text-pmdm-text2'}`}>
                {opt.title}
              </div>
              <div className="text-xs text-pmdm-text3 leading-relaxed">{opt.desc}</div>
            </div>
          ))}
        </div>

        {/* Upload panel for pdb / zip */}
        {source !== 'random' ? (
          <div className="animate-fade-in">
            <div
              className={`border border-dashed max-w-[560px] p-10 text-center cursor-pointer transition-all duration-150 relative ${dragOver ? 'border-pmdm-accent bg-pmdm-accent-dim' : 'border-pmdm-border2 bg-pmdm-bg2 hover:border-pmdm-accent hover:bg-pmdm-accent-dim'}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept={currentOpt.accept} className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
              <div className={`mb-3 ${dragOver ? 'text-pmdm-accent' : 'text-pmdm-text3'}`}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
              </div>
              <div className="text-sm font-medium text-pmdm-text2 mb-1.5">
                {source === 'pdb' ? 'Drop a .pdb file here or click to browse' : 'Drop a ZIP archive here or click to browse'}
              </div>
              <div className="font-mono text-[11px] text-pmdm-text3 leading-[1.8]">
                {source === 'pdb' ? (
                  <>Accepted: .pdb · Max size: 500 MB<br />Single protein pocket file for targeted molecule generation</>
                ) : (
                  <>Accepted: .zip · Max size: 500 MB<br />Structure: <span className="text-pmdm-accent">folder/pocket.pdb</span> + <span className="text-pmdm-accent">folder/ligand.sdf</span></>
                )}
              </div>
            </div>
            {file && (
              <div className="flex items-center gap-2.5 py-2.5 px-3.5 border border-pmdm-green bg-pmdm-green-dim max-w-[560px] mt-2">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-pmdm-green shrink-0"><path d="M10.97 4.97a.75.75 0 011.07 1.05l-3.99 4.99a.75.75 0 01-1.08.02L4.324 8.384a.75.75 0 111.06-1.06l2.094 2.093 3.473-4.425a.236.236 0 01.02-.022z" /></svg>
                <span className="font-mono text-xs text-pmdm-green flex-1">{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                <button onClick={(e) => { e.stopPropagation(); onFileChange(null); }} className="text-pmdm-text3 hover:text-pmdm-red text-base px-1 transition-colors">×</button>
              </div>
            )}
            {error && <div className="py-2.5 px-3.5 border-l-[3px] border-pmdm-red bg-pmdm-red-dim text-pmdm-red font-mono text-[11px] mt-2 max-w-[560px]">{error}</div>}
          </div>
        ) : (
          <div className="animate-fade-in">
            <div className="flex items-start gap-4 p-5 border border-pmdm-border bg-pmdm-bg2 max-w-[560px]">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-pmdm-accent shrink-0"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
              <div className="flex-1">
                <div className="font-mono text-[13px] font-bold text-pmdm-text mb-1">PDBBind Mock Reference Set</div>
                <div className="text-xs text-pmdm-text2 mb-2.5 leading-relaxed">Three curated protein targets (2HNI, 3EML, 4QAC) with pocket geometry and reference ligands. Suitable for demonstration and model evaluation.</div>
                <div className="flex gap-4">
                  {[['Targets', '3'], ['Pocket residues', '15–30'], ['Max atoms', '38']].map(([l, v]) => (
                    <span key={l} className="font-mono text-[11px] text-pmdm-text3">{l}: <span className="text-pmdm-accent font-semibold">{v}</span></span>
                  ))}
                </div>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-pmdm-green-dim border border-pmdm-green font-mono text-[10px] font-semibold text-pmdm-green tracking-[0.06em] uppercase shrink-0 mt-1">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="3" /></svg>
                Active
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
