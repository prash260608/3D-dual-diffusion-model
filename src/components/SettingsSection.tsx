import { useState } from 'react';
import { SETTING_TOOLTIPS } from '@/lib/moleculeData';

interface Props {
  topN: number;
  setTopN: (n: number) => void;
  numSamples: number;
  setNumSamples: (n: number) => void;
  runAlias: string;
  setRunAlias: (s: string) => void;
  validOnly: boolean;
  setValidOnly: (b: boolean) => void;
  sampleSteps: number;
  setSampleSteps: (n: number) => void;
  temperature: number;
  setTemperature: (n: number) => void;
  batchSize: number;
  setBatchSize: (n: number) => void;
  qedThreshold: number;
  setQedThreshold: (n: number) => void;
}

function FieldLabel({ label }: { label: string }) {
  return (
    <div className="font-mono text-[11px] font-semibold tracking-[0.08em] uppercase text-pmdm-text3">{label}</div>
  );
}

function AdvFieldWithTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const tip = SETTING_TOOLTIPS[label];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-[11px] font-semibold tracking-[0.08em] uppercase text-pmdm-text">{label}</div>
      {tip && (
        <div className="font-mono text-[9px] leading-snug text-pmdm-text3 italic -mt-0.5">{tip}</div>
      )}
      {children}
    </div>
  );
}

export default function SettingsSection(props: Props) {
  const [advOpen, setAdvOpen] = useState(false);

  return (
    <section className="py-14 border-b border-pmdm-border" id="settings">
      <div className="max-w-[1400px] mx-auto px-8">
        <div className="font-mono text-[10px] font-semibold tracking-[0.12em] uppercase text-pmdm-accent mb-1.5">02 / Configuration</div>
        <div className="text-xl font-semibold text-pmdm-text mb-1">Generation Settings</div>
        <p className="text-[13px] text-pmdm-text2 mb-8">Configure sampling parameters before running the diffusion pipeline.</p>

        <div className="grid grid-cols-[320px_280px_1fr] gap-6 max-w-[900px] items-start">
          <div className="flex flex-col gap-1.5">
            <FieldLabel label="Top Validated Molecules to Preview" />
            <div className="flex justify-between items-center">
              <span className="font-mono text-xl font-bold text-pmdm-accent">{props.topN}</span>
              <span className="font-mono text-[10px] text-pmdm-text3">molecules shown</span>
            </div>
            <input
              type="range" min="5" max="100" step="5" value={props.topN}
              onChange={e => props.setTopN(parseInt(e.target.value))}
              className="w-full h-1 cursor-pointer bg-pmdm-border2 accent-pmdm-accent border-none"
            />
            <div className="flex justify-between mt-0.5">
              <span className="font-mono text-[10px] text-pmdm-text3">5</span>
              <span className="font-mono text-[10px] text-pmdm-text3">100</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="font-mono text-[11px] font-semibold tracking-[0.08em] uppercase text-pmdm-text3">Run Alias (optional)</div>
            <input
              type="text" value={props.runAlias}
              onChange={e => props.setRunAlias(e.target.value)}
              placeholder="e.g. experiment-01"
              className="mt-[30px] px-3 py-2 bg-pmdm-bg2 border border-pmdm-border text-pmdm-text font-mono text-[13px] outline-none focus:border-pmdm-accent transition-colors placeholder:text-pmdm-text3"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <FieldLabel label="Samples per Protein" />
            <input
              type="number" value={props.numSamples}
              onChange={e => props.setNumSamples(parseInt(e.target.value) || 1)}
              min={1} max={200}
              className="mt-[30px] px-3 py-2 bg-pmdm-bg2 border border-pmdm-border text-pmdm-text font-mono text-[13px] outline-none focus:border-pmdm-accent transition-colors"
            />
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer p-2.5 border border-pmdm-border bg-pmdm-bg2 max-w-[560px] mt-6 hover:border-pmdm-border2 transition-colors">
          <input type="checkbox" checked={props.validOnly} onChange={e => props.setValidOnly(e.target.checked)} className="accent-pmdm-accent w-3.5 h-3.5" />
          <span className="text-[13px] text-pmdm-text2">Download only valid molecules (Lipinski + RDKit validated)</span>
        </label>

        <button
          onClick={() => setAdvOpen(!advOpen)}
          className="flex items-center gap-2 bg-transparent border border-pmdm-border text-pmdm-text3 font-mono text-[11px] font-medium tracking-[0.06em] uppercase py-[7px] px-3.5 mt-6 hover:text-pmdm-accent hover:border-pmdm-accent-border hover:bg-pmdm-accent-dim transition-all duration-150"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className={`transition-transform duration-200 ${advOpen ? 'rotate-180' : ''}`}>
            <path d="M1.646 4.646a.5.5 0 01.708 0L8 10.293l5.646-5.647a.5.5 0 01.708.708l-6 6a.5.5 0 01-.708 0l-6-6a.5.5 0 010-.708z" />
          </svg>
          Advanced Settings
        </button>

        {advOpen && (
          <div className="mt-4 p-5 border border-pmdm-border bg-pmdm-bg2 max-w-[560px] animate-fade-in">
            <div className="grid grid-cols-2 gap-5">
              <AdvFieldWithTooltip label="Sample Steps">
                <input type="number" value={props.sampleSteps} onChange={e => props.setSampleSteps(parseInt(e.target.value) || 10)} min={10} max={1000}
                  className="px-3 py-2 bg-pmdm-bg border border-pmdm-border text-pmdm-text font-mono text-[13px] outline-none focus:border-pmdm-accent transition-colors" />
              </AdvFieldWithTooltip>
              <AdvFieldWithTooltip label="Temperature">
                <input type="number" value={props.temperature} onChange={e => props.setTemperature(parseFloat(e.target.value) || 0.1)} min={0.1} max={2.0} step={0.1}
                  className="px-3 py-2 bg-pmdm-bg border border-pmdm-border text-pmdm-text font-mono text-[13px] outline-none focus:border-pmdm-accent transition-colors" />
              </AdvFieldWithTooltip>
              <AdvFieldWithTooltip label="Batch Size">
                <input type="number" value={props.batchSize} onChange={e => props.setBatchSize(parseInt(e.target.value) || 1)} min={1} max={64}
                  className="px-3 py-2 bg-pmdm-bg border border-pmdm-border text-pmdm-text font-mono text-[13px] outline-none focus:border-pmdm-accent transition-colors" />
              </AdvFieldWithTooltip>
              <AdvFieldWithTooltip label="Target QED Threshold">
                <input type="number" value={props.qedThreshold} onChange={e => props.setQedThreshold(parseFloat(e.target.value) || 0)} min={0} max={1} step={0.05}
                  className="px-3 py-2 bg-pmdm-bg border border-pmdm-border text-pmdm-text font-mono text-[13px] outline-none focus:border-pmdm-accent transition-colors" />
              </AdvFieldWithTooltip>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
