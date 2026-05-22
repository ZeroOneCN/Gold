import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Trades from './pages/Trades';
import Calculator from './pages/Calculator';
import Capital from './pages/Capital';

const TABS = [
  { id: 'dashboard', label: '统计分析', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
  { id: 'trades', label: '交易记录', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z' },
  { id: 'calculator', label: '交易计算', icon: 'M11 17h2v-4h4v-2h-4V7h-2v4H7v2h4zm1 5q-2.075 0-3.537-1.463Q7 19.075 7 17V7q0-2.075 1.463-3.537Q9.925 2 12 2t3.538 1.463Q17 4.925 17 7v10q0 2.075-1.462 3.537Q14.075 22 12 22z' },
  { id: 'capital', label: '资金管理', icon: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z' },
];

function getTheme() {
  try { return localStorage.getItem('gold_theme') || 'dark'; }
  catch { return 'dark'; }
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState(getTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('gold_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--color-canvas)' }}>
      {/* Sidebar — 遵循 Linear top-nav 规范 */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r" style={{ borderColor: 'var(--color-hairline)', backgroundColor: 'var(--color-canvas)' }}>
        {/* Logo area — 对应 DESIGN.md top-nav height 56px */}
        <div className="flex items-center gap-3 px-5" style={{ height: 56, borderBottom: '1px solid var(--color-hairline)' }}>
          <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--color-primary)' }}>
            <span className="text-white font-semibold text-sm tracking-tight">TA</span>
          </div>
          <span className="font-semibold text-lg tracking-[-0.4px]" style={{ color: 'var(--color-ink)' }}>Trading Analysis</span>
        </div>

        {/* Navigation — 大号菜单 */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-left transition-colors"
              style={{
                backgroundColor: activeTab === tab.id ? 'var(--color-surface-1)' : 'transparent',
                color: activeTab === tab.id ? 'var(--color-ink)' : 'var(--color-ink-subtle)',
                fontWeight: activeTab === tab.id ? 500 : 400,
                fontSize: 16
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0">
                <path d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--color-hairline)' }}>
          <span className="text-xs tracking-wide" style={{ color: 'var(--color-ink-tertiary)' }}>v1.0.0</span>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 rounded-md px-2 py-1"
            style={{ backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-hairline)', fontSize: 12, color: 'var(--color-ink-subtle)' }}
          >
            {theme === 'dark' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"/></svg>
            )}
            {theme === 'dark' ? '日间' : '夜间'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'trades' && <Trades />}
        {activeTab === 'calculator' && <Calculator />}
        {activeTab === 'capital' && <Capital />}
      </main>
    </div>
  );
}
