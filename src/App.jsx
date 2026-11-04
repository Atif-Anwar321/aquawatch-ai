import { useEffect, useState } from 'react';
import './App.css';
import { fetchSummary } from './api';
import Dashboard from './components/Dashboard.jsx';
import Zones from './components/Zones.jsx';
import Simulator from './components/Simulator.jsx';
import Predictor from './components/Predictor.jsx';
import Explorer from './components/Explorer.jsx';
import ModelPage from './components/ModelPage.jsx';
import About from './components/About.jsx';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'zones', label: 'Network Zones' },
  { id: 'simulator', label: 'Contamination Simulator' },
  { id: 'predictor', label: 'AI Predictor' },
  { id: 'explorer', label: 'Dataset Explorer' },
  { id: 'model', label: 'Model & WQI' },
  { id: 'about', label: 'About & How to Run' },
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [selectedZone, setSelectedZone] = useState(3);
  const [backendLive, setBackendLive] = useState(null);

  useEffect(() => {
    fetchSummary().then(({ live }) => setBackendLive(live));
  }, []);

  function goToZone(zoneId) {
    setSelectedZone(zoneId);
    setTab('zones');
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">💧</div>
            <div>
              <h1>AquaWatch AI</h1>
              <p>AI-driven water quality &amp; pollution monitoring in water supply systems</p>
            </div>
          </div>
          <div className="badges">
            {backendLive === true && <span className="pill live">Live backend connected</span>}
          </div>
        </div>
        <nav className="tabs" aria-label="Main sections">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="wrap">
        {tab === 'dashboard' && <Dashboard onSelectZone={goToZone} onGoTab={setTab} />}
        {tab === 'zones' && <Zones selectedZoneId={selectedZone} onSelectZone={setSelectedZone} />}
        {tab === 'simulator' && <Simulator />}
        {tab === 'predictor' && <Predictor />}
        {tab === 'explorer' && <Explorer />}
        {tab === 'model' && <ModelPage />}
        {tab === 'about' && <About />}
      </main>

      <footer className="footer">
        <p>
          AquaWatch AI — Micro project developed by Atif Anwar, Vishal Kumar Ray and Yuvraj Gaur.
        </p>
      </footer>
    </>
  );
}
