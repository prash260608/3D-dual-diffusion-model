import { useEffect, useState } from 'react';

interface Props {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  running: boolean;
}

export default function StickyHeader({ theme, onToggleTheme, running }: Props) {
  return (
    <header className="sticky top-0 z-[100] h-[52px] border-b border-pmdm-border backdrop-blur-[12px] bg-pmdm-bg/[0.92]">
      <div className="max-w-[1400px] mx-auto px-8 flex items-center h-full">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mr-8 shrink-0">
          <div className="w-7 h-7">
            <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="1" className="text-pmdm-accent" />
              <circle cx="14" cy="7" r="3" fill="currentColor" className="text-pmdm-accent" />
              <circle cx="22" cy="19" r="3" fill="currentColor" className="text-pmdm-accent opacity-70" />
              <circle cx="6" cy="19" r="3" fill="currentColor" className="text-pmdm-accent opacity-70" />
              <line x1="14" y1="10" x2="20" y2="17" stroke="currentColor" strokeWidth="1" className="text-pmdm-accent opacity-50" />
              <line x1="14" y1="10" x2="8" y2="17" stroke="currentColor" strokeWidth="1" className="text-pmdm-accent opacity-50" />
              <line x1="8.5" y1="19" x2="19.5" y2="19" stroke="currentColor" strokeWidth="1" className="text-pmdm-accent opacity-50" />
            </svg>
          </div>
          <span className="font-mono text-[13px] font-bold tracking-[0.05em] text-pmdm-text">
            MINI<span className="text-pmdm-accent">PMDM</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="flex items-center flex-1">
          {[
            { href: '#input', label: 'Input' },
            { href: '#run', label: 'Processing' },
            { href: '#results', label: 'Results' },
            { href: '#export', label: 'Export' },
          ].map((link, i) => (
            <a
              key={link.href}
              href={link.href}
              className={`font-mono text-[11px] font-medium tracking-[0.08em] uppercase text-pmdm-text3 px-4 h-[52px] flex items-center border-r border-pmdm-border hover:text-pmdm-accent hover:bg-pmdm-accent-dim transition-all duration-150 ${i === 0 ? 'border-l border-pmdm-border' : ''}`}
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right */}
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-2 px-2.5 h-7 border border-pmdm-border bg-pmdm-bg2 font-mono text-[10px] font-semibold text-pmdm-text2 tracking-[0.06em]">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse-dot"
              style={{
                background: running ? 'hsl(var(--yellow-main))' : 'hsl(var(--green-main))',
                boxShadow: running ? '0 0 6px hsl(var(--yellow-main))' : '0 0 6px hsl(var(--green-main))',
              }}
            />
            <span>MODEL: MINI-PMDM-V1</span>
            <span>{running ? 'RUNNING' : 'READY'}</span>
          </div>
          <button
            onClick={onToggleTheme}
            className="w-8 h-8 flex items-center justify-center bg-pmdm-bg2 border border-pmdm-border text-pmdm-text2 hover:text-pmdm-accent hover:border-pmdm-accent-border hover:bg-pmdm-accent-dim transition-all duration-150"
            title="Toggle theme"
          >
            {theme === 'light' ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a.5.5 0 01.5.5v1a.5.5 0 01-1 0v-1A.5.5 0 018 1zm4.95 2.05a.5.5 0 010 .707l-.707.707a.5.5 0 11-.707-.707l.707-.707a.5.5 0 01.707 0zm-9.9 0a.5.5 0 01.707 0l.707.707a.5.5 0 11-.707.707L2.343 3.464a.5.5 0 010-.707zM8 4.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM15 8a.5.5 0 01-.5.5h-1a.5.5 0 010-1h1A.5.5 0 0115 8zM2.5 8.5a.5.5 0 000-1h-1a.5.5 0 000 1h1zm10.45 4.45a.5.5 0 01-.707 0l-.707-.707a.5.5 0 01.707-.707l.707.707a.5.5 0 010 .707zm-9.9 0a.5.5 0 010-.707l.707-.707a.5.5 0 01.707.707l-.707.707a.5.5 0 01-.707 0zM8 13a.5.5 0 01.5.5v1a.5.5 0 01-1 0v-1A.5.5 0 018 13z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6 .278a.768.768 0 01.08.858 7.208 7.208 0 00-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 01.81.316.733.733 0 01-.031.893A8.349 8.349 0 018.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 016 .278z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
