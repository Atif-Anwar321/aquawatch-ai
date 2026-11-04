export default function About() {
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2>About this project</h2>
        <p className="sub">
          AI-Driven Water Quality and Pollution Monitoring in Water Supply Systems — a Micro project developed by Atif Anwar, Vishal Kumar Ray and Yuvraj Gaur.
          the AI model is trained on that dataset, and the dashboard, WQI and alerts are pure software.
        </p>
        <p>
           This system replaces periodic lab reports with a dashboard that classifies every
          sample, tracks trends per supply zone, and raises alerts when water becomes unsafe — using data
          that already exists, instead of new hardware.
        </p>
        <p className="muted">Aligned with UN Sustainable Development Goal 6 (Clean Water and Sanitation), and supporting SDG 3 (Good Health and Well-being) and SDG 11 (Sustainable Cities and Communities).</p>
      </div>

      

      <div className="card">
        <h2>System architecture </h2>
        <div className="flow">
          <span className="step">1. Public dataset<br />(Kaggle, CSV)</span><span className="arrow">→</span>
          <span className="step">2. Pre-processing<br />(median imputation, split)</span><span className="arrow">→</span>
          <span className="step">3. ML intelligence<br />(Random Forest + WQI)</span><span className="arrow">→</span>
          <span className="step">4. Flask API<br />(/api/* endpoints)</span><span className="arrow">→</span>
          <span className="step">5. React dashboard<br />(zones, charts, predictor)</span><span className="arrow">→</span>
          <span className="step">6. Alerts<br />(in-app, from latest readings)</span>
        </div>
        
      </div>

      <div className="card">
        <h2>Contamination Spread Simulator </h2>
        <p className="sub">
          The “Contamination Simulator” tab holds a virtual copy of the six-zone supply network.
          Inject a pollutant in one zone and watch it travel downstream hour by hour, then test a
          valve closure, a treatment boost, or a public advisory and compare the outcome with doing
          nothing. An animated map shows blue water droplets flowing along the pipes and coloured
          pollutant blobs spreading downstream (map positions are schematic, not real GPS locations).
          Each zone starts at its measured average WQI; pollution is diluted and decays as
          it travels, and the treatment plant removes part of what passes through it. It is a
          simplified planning model, not a hydraulic simulator — travel times and dilution factors
          live in <code>backend/simulation.py</code> and must be calibrated against measured flow
          data before operational use.
        </p>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>How to run it (VS Code)</h2>
          <p className="sub">Prerequisites: Node.js 18+ and Python 3.10+.</p>
          <pre>{`# Terminal 1 — backend (Flask + ML)
cd backend
python -m venv .venv
.venv\\Scripts\\activate     # Windows
# source .venv/bin/activate  # macOS / Linux
pip install -r requirements.txt
python app.py               # http://localhost:5000

# Terminal 2 — frontend (React + Vite)
cd frontend
npm install
npm run dev                 # http://localhost:5173`}</pre>
          <p className="muted">The backend trains/loads the model on first start (a few seconds) and serves <code>http://localhost:5000/api/health</code>. If the backend is not running, the site still opens with bundled snapshot data and a banner saying so — predictions then use the WQI only.</p>
          <h3>Pushing to GitHub</h3>
          <pre>{`git init
git add .
git commit -m "AI-driven water quality monitoring (software-only)"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo>.git
git push -u origin main`}</pre>
          <p className="muted">A <code>.gitignore</code> is included (it excludes <code>node_modules/</code>, <code>.venv/</code> and the trained <code>models/*.joblib</code> — the model retrains from the CSV on first run). See the project README for the full checklist.</p>
        </div>
        <div className="card">
          <h2>Data source &amp; limitations</h2>
          <ul className="clean">
            <li><strong>Source:</strong> Kaggle “Water Potability” dataset (adityakadiwal), 3,276 samples. Full provenance in <code>backend/data/DATA_SOURCE.md</code>; re-download with <code>scripts/download_dataset.py</code> or the Kaggle CLI.</li>
            <li><strong>Not live data:</strong> rows are replayed into six zones on a replay clock. Do not present this as a live sensor deployment.</li>
            <li><strong>Model accuracy is ~66%</strong> on the held-out test set. The WQI rule check is the primary safety signal; the model is a second opinion.</li>
            <li><strong>Solids scale:</strong> the dataset&apos;s Solids values are far above real TDS levels; the WQI treats Solids as a relative, log-scaled indicator (see Model &amp; WQI).</li>
            <li><strong>Missing parameters:</strong> dissolved oxygen, temperature, bacteria (E. coli), and heavy metals are not in this dataset and are not assessed.</li>
            <li><strong>Alerts are in-app only</strong> in this version; email/Telegram delivery is a planned extension, not yet implemented.</li>
          </ul>
          <h3>References (from the synopsis)</h3>
          <ul className="clean">
            <li>Kumar &amp; Sharma, IoT based real-time water quality monitoring system, ICCCA 2021.</li>
            <li>Khan &amp; See, Predicting and analyzing water quality using Machine Learning, IEEE LISAT 2016.</li>
            <li>Ali, Qadri &amp; Noor, Smart water quality monitoring system using GSM and sensor network, IJCA 2019.</li>
            <li>WHO, Guidelines for Drinking-Water Quality, 4th ed., 2017.</li>
            <li>United Nations, Sustainable Development Goal 6, sdgs.un.org.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
