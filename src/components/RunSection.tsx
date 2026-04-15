import { STAGES } from '@/lib/moleculeData';

interface LogEntry { time: string; msg: string; type: string; }

interface Props {
  running: boolean;
  onGenerate: () => void;
  onReset: () => void;
  processingVisible: boolean;
  stageIdx: number;
  progress: number;
  progressLabel: string;
  logs: LogEntry[];
  stats: { gen: number; valid: number; qed: string; status: string; statusColor: string };
  startTime: string;
  complete: boolean;
}

export default function RunSection(props: Props) {
  return (
    <section className="py-14 border-b border-pmdm-border" id="run">
      <div className="max-w-[1400px] mx-auto px-8">
        <div className="font-mono text-[10px] font-semibold tracking-[0.12em] uppercase text-pmdm-accent mb-1.5">03 / Mission Control</div>
        <div className="text-xl font-semibold text-pmdm-text mb-1">Generate Molecules</div>
        <p className="text-[13px] text-pmdm-text2 mb-6">Initiate the dual diffusion pipeline. Processing occurs inline — do not navigate away.</p>

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={props.onGenerate}
            disabled={props.running}
            className="inline-flex items-center gap-2.5 px-7 py-3 bg-pmdm-accent text-pmdm-bg font-mono text-[13px] font-bold tracking-[0.08em] uppercase border border-pmdm-accent hover:bg-transparent hover:text-pmdm-accent disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 110 16A8 8 0 018 0zm.93 6.588L6.69 11.86l4.97-5.272h-2.73zm-.02-1.334L10.91 2h-2.33L8.91 5.254z" /></svg>
            Generate Molecules
          </button>
          <button
            onClick={props.onReset}
            className="inline-flex items-center gap-2 px-5 py-3 bg-transparent text-pmdm-text2 font-mono text-xs font-medium tracking-[0.06em] uppercase border border-pmdm-border hover:border-pmdm-border2 hover:text-pmdm-text transition-all duration-150"
          >
            Reset
          </button>
        </div>

        {props.processingVisible && (
          <div className="border border-pmdm-border bg-pmdm-bg2 max-w-[800px] animate-fade-in overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-pmdm-border bg-pmdm-bg3">
              <div className="font-mono text-[11px] font-bold tracking-[0.08em] uppercase text-pmdm-accent flex items-center gap-2">
                <span className={props.complete ? 'text-pmdm-green' : 'animate-spin-custom inline-block'}>
                  {props.complete ? '✓' : '⟳'}
                </span>
                {props.complete ? 'Pipeline Complete' : 'Pipeline Running'}
              </div>
              <div className="font-mono text-[10px] text-pmdm-text3">Started: {props.startTime}</div>
            </div>

            {/* Stages */}
            <div className="flex px-5 py-3.5 border-b border-pmdm-border overflow-x-auto">
              {STAGES.map((s, i) => (
                <div key={s.id} className="flex items-center flex-1 min-w-0">
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className={`w-2 h-2 rounded-full transition-all duration-150 ${
                      i < props.stageIdx ? 'bg-pmdm-green shadow-[0_0_6px_hsl(var(--green-main))]' :
                      i === props.stageIdx ? 'bg-pmdm-accent shadow-[0_0_8px_hsl(var(--accent-main))] animate-pulse-glow' :
                      'bg-pmdm-bg4 border border-pmdm-border2'
                    }`} />
                    <span className={`font-mono text-[9px] whitespace-nowrap ${
                      i < props.stageIdx ? 'text-pmdm-green' :
                      i === props.stageIdx ? 'text-pmdm-accent' : 'text-pmdm-text3'
                    }`}>{s.label}</span>
                  </div>
                  {i < STAGES.length - 1 && (
                    <div className={`flex-1 h-px mx-1 transition-colors ${i < props.stageIdx ? 'bg-pmdm-green' : 'bg-pmdm-border'}`} />
                  )}
                </div>
              ))}
            </div>

            {/* Progress */}
            <div className="px-5 py-3.5 border-b border-pmdm-border">
              <div className="flex justify-between mb-1.5">
                <span className="font-mono text-[11px] text-pmdm-text2">{props.progressLabel}</span>
                <span className="font-mono text-[11px] text-pmdm-accent font-semibold">{props.progress}%</span>
              </div>
              <div className="h-[3px] bg-pmdm-bg4 overflow-hidden">
                <div className="h-full bg-pmdm-accent transition-[width] duration-500 relative" style={{ width: `${props.progress}%` }}>
                  <div className="absolute right-0 top-0 h-full w-10 bg-gradient-to-r from-transparent to-white/40 animate-[shimmer_1.5s_infinite]" />
                </div>
              </div>
            </div>

            {/* Log */}
            <div>
              <div className="flex items-center justify-between px-5 py-2 border-b border-pmdm-border bg-pmdm-bg3">
                <span className="font-mono text-[10px] font-semibold tracking-[0.08em] uppercase text-pmdm-text3">Live Output</span>
              </div>
              <div className="px-5 py-3 max-h-[140px] overflow-y-auto font-mono text-[11px] leading-[1.8] scrollbar-thin">
                {props.logs.map((l, i) => (
                  <div key={i} className="flex gap-3 animate-fade-in">
                    <span className="text-pmdm-text3 shrink-0">[{l.time}]</span>
                    <span className={l.type === 'accent' ? 'text-pmdm-accent' : l.type === 'success' ? 'text-pmdm-green' : l.type === 'error' ? 'text-pmdm-red' : 'text-pmdm-text2'}>{l.msg}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 border-t border-pmdm-border">
              {[
                { label: 'Generated', value: String(props.stats.gen), color: 'text-pmdm-accent' },
                { label: 'Valid', value: String(props.stats.valid), color: 'text-pmdm-green' },
                { label: 'QED Mean', value: props.stats.qed, color: 'text-pmdm-text' },
                { label: 'Status', value: props.stats.status, color: props.stats.statusColor },
              ].map(s => (
                <div key={s.label} className="px-4 py-3 border-r border-pmdm-border last:border-r-0">
                  <div className="font-mono text-[9px] font-semibold tracking-[0.1em] uppercase text-pmdm-text3 mb-1">{s.label}</div>
                  <div className={`font-mono text-lg font-bold ${s.color}`}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
