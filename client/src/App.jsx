import { useState } from 'react';
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

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--color-canvas)' }}>
      {/* Sidebar — 遵循 Linear top-nav 规范 */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r" style={{ borderColor: 'var(--color-hairline)', backgroundColor: 'var(--color-canvas)' }}>
        {/* Logo area — 对应 DESIGN.md top-nav height 56px */}
        <div className="flex items-center gap-3 px-5" style={{ height: 56, borderBottom: '1px solid var(--color-hairline)' }}>
          <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--color-primary)' }}>
            <span className="text-white font-semibold text-sm tracking-tight">G</span>
          </div>
          <span className="font-semibold text-lg tracking-[-0.4px]" style={{ color: 'var(--color-ink)' }}>Gold Trade</span>
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

        <div className="px-5 py-3 text-xs tracking-wide" style={{ color: 'var(--color-ink-tertiary)', borderTop: '1px solid var(--color-hairline)' }}>
          v1.0.0
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
