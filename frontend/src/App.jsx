import React, { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowUpRight, BarChart3, Bot, BrainCircuit, Check,
  ChevronRight, Clock3, Database, Globe2, History, Layers3,
  Loader2, Menu, Network, Plus, Search, ShieldCheck, Sparkles,
  Target, TrendingUp, X, Zap, Orbit, Radar, Cpu, Gauge
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const demoCards = [
  ["AI copilots for Indian SMEs", "Competition + demand + product whitespace"],
  ["EV charging infrastructure in India", "Market growth + competitors + gaps"],
  ["Industrial IoT cybersecurity", "Enterprise demand + threat landscape"],
];

const agentNodes = [
  { label: "PLANNER", x: 50, y: 8, icon: BrainCircuit },
  { label: "WEB SCOUT", x: 88, y: 50, icon: Globe2 },
  { label: "ANALYST", x: 50, y: 92, icon: BarChart3 },
  { label: "DECISION", x: 12, y: 50, icon: Target },
];

function App() {
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState([]);
  const [active, setActive] = useState(null);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [health, setHealth] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const stages = [
    ["Planner", "Decomposing your research goal"],
    ["Web Scout", "Collecting fresh market evidence"],
    ["Analyst", "Cross-checking signals and competitors"],
    ["Decision Brief", "Turning evidence into actions"]
  ];

  const particles = useMemo(
    () => Array.from({ length: 34 }, (_, i) => ({
      left: `${(i * 37) % 100}%`,
      top: `${(i * 61) % 100}%`,
      delay: `${(i % 9) * 0.45}s`,
      duration: `${5 + (i % 6)}s`
    })),
    []
  );

  async function loadHistory() {
    try {
      const r = await fetch(`${API}/api/history`);
      if (!r.ok) throw new Error();
      setHistory(await r.json());
      setConnectionError(false);
    } catch {
      setConnectionError(true);
    }
  }

  async function loadHealth() {
    try {
      const r = await fetch(`${API}/api/health`);
      if (!r.ok) throw new Error();
      setHealth(await r.json());
      setConnectionError(false);
    } catch {
      setConnectionError(true);
    }
  }

  useEffect(() => {
    loadHistory();
    loadHealth();
  }, []);

  async function runResearch(customQuery = query) {
    const q = customQuery.trim();
    if (!q || running) return;

    setQuery(q);
    setError("");
    setRunning(true);
    setStage(0);
    setActive(null);

    const timers = [
      setTimeout(() => setStage(1), 1000),
      setTimeout(() => setStage(2), 3500),
      setTimeout(() => setStage(3), 6000)
    ];

    try {
      const response = await fetch(`${API}/api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Research failed");
      setActive(data);
      setError("");
      await loadHistory();
    } catch (e) {
      setError(e.message);
    } finally {
      timers.forEach(clearTimeout);
      setRunning(false);
      setStage(0);
    }
  }

  async function openReport(id) {
    setError("");
    try {
      const r = await fetch(`${API}/api/reports/${id}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Could not load report");
      setActive(data);
      setQuery(data.query);
    } catch (e) {
      setError(e.message);
    }
  }

  function resetResearch() {
    setActive(null);
    setQuery("");
    setError("");
    setMobileNav(false);
  }

  const report = active?.report;
  const sourceCount =
    active?.metadata?.sources_found || report?.sources?.length || 0;

  async function copyBrief() {
    if (!report) return;
    const text = [
      report.headline || "",
      report.executive_summary || "",
      ...(report.opportunities || []).map(x => `Opportunity: ${x}`),
      ...(report.risks || []).map(x => `Risk: ${x}`),
      ...(report.recommended_next_steps || []).map(x => `Next move: ${x}`)
    ].join("\n\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Clipboard access was blocked by the browser.");
    }
  }

  function handleTilt(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (py - 0.5) * -8, y: (px - 0.5) * 10 });
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <div className="noise-layer" />

      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>MarketPilot</strong>
            <span>Agentic Intelligence</span>
          </div>
        </div>

        <button className="new-research" onClick={resetResearch}>
          <Plus size={17} /> New research
        </button>

        <div className="side-section">
          <div className="side-label">
            <History size={14} /> Research history
          </div>
          <div className="history-list">
            {history.length === 0 && (
              <div className="empty-history">
                Your completed research will appear here.
              </div>
            )}
            {history.map(item => (
              <button
                key={item.id}
                className="history-item"
                onClick={() => {
                  openReport(item.id);
                  setMobileNav(false);
                }}
              >
                <span>{item.query}</span>
                <small>{new Date(item.created_at).toLocaleDateString()}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="agent-status">
            <span className="status-dot" />
            <div>
              <strong>Agent online</strong>
              <small>{health?.model || "OpenRouter"}</small>
            </div>
          </div>
          <div className="side-caption">Research • Evidence • Decisions</div>
        </div>
      </aside>

      {mobileNav && (
        <div className="mobile-overlay" onClick={() => setMobileNav(false)} />
      )}

      <main className="main">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={20} />
          </button>

          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <b>Market intelligence</b>
          </div>

          <div className="top-actions">
            <span className="live-pill">
              <span /> Live agent
            </span>
            <div className="avatar">DR</div>
          </div>
        </header>

        {connectionError && (
          <div className="connection-banner">
            <span className="connection-warning" />
            <div>
              <b>Backend not connected</b>
              <small>Start FastAPI on port 8000, then retry.</small>
            </div>
            <button onClick={() => { loadHealth(); loadHistory(); }}>
              Retry
            </button>
          </div>
        )}

        {!active && !running ? (
          <section className="hero">
            <div className="hero-copy-wrap">
              <div className="eyebrow">
                <span className="pulse" /> Autonomous market research workspace
              </div>

              <h1>
                Turn a question into
                <br />
                <em>decision-ready intelligence.</em>
              </h1>

              <p className="hero-copy">
                MarketPilot plans the research, scouts the web, cross-checks
                evidence, maps competitors and turns noisy information into a
                clear strategic brief.
              </p>

              <div className="search-panel">
                <div className="search-icon">
                  <Search size={21} />
                </div>
                <textarea
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      runResearch();
                    }
                  }}
                  placeholder="What market or opportunity do you want to understand?"
                  rows={2}
                />
                <button
                  className="research-btn"
                  onClick={() => runResearch()}
                  disabled={!query.trim()}
                >
                  Research <ArrowUpRight size={18} />
                </button>
                <div className="search-hint">Ctrl + Enter to run</div>
              </div>

              <div className="suggestions">
                <span>Try a research brief</span>
                {demoCards.map(([title, sub]) => (
                  <button key={title} onClick={() => runResearch(title)}>
                    <Target size={15} />
                    <div>
                      <b>{title}</b>
                      <small>{sub}</small>
                    </div>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>

              <div className="hero-proof">
                <div><span>LIVE WEB</span><b>Fresh evidence</b></div>
                <div><span>AGENTIC</span><b>4-stage reasoning</b></div>
                <div><span>TRACEABLE</span><b>Source-backed output</b></div>
              </div>
            </div>

            <div
              className="intelligence-stage"
              onMouseMove={handleTilt}
              onMouseLeave={() => setTilt({ x: 0, y: 0 })}
              style={{
                "--tilt-x": `${tilt.x}deg`,
                "--tilt-y": `${tilt.y}deg`
              }}
            >
              <div className="stage-grid" />
              <div className="stage-label">
                <span>MARKETPILOT CORE</span>
                <b>AI RESEARCH NETWORK</b>
              </div>

              {particles.map((p, i) => (
                <i
                  key={i}
                  className="particle"
                  style={{
                    left: p.left,
                    top: p.top,
                    animationDelay: p.delay,
                    animationDuration: p.duration
                  }}
                />
              ))}

              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="orbit orbit-three" />

              <div className="core-shell">
                <div className="core-ring ring-a" />
                <div className="core-ring ring-b" />
                <div className="core-ring ring-c" />
                <div className="core">
                  <div className="core-glow" />
                  <Cpu size={34} />
                  <strong>AI</strong>
                  <span>CORE</span>
                </div>
              </div>

              <svg className="agent-lines" viewBox="0 0 100 100">
                <line x1="50" y1="50" x2="50" y2="10" />
                <line x1="50" y1="50" x2="88" y2="50" />
                <line x1="50" y1="50" x2="50" y2="90" />
                <line x1="50" y1="50" x2="12" y2="50" />
              </svg>

              {agentNodes.map(({ label, x, y, icon: Icon }) => (
                <div
                  className="agent-node"
                  key={label}
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  <div className="node-icon"><Icon size={15} /></div>
                  <span>{label}</span>
                </div>
              ))}

              <div className="stage-footer">
                <span><i /> WEB SIGNALS</span>
                <span><i /> AI REASONING</span>
                <span><i /> TRACEABLE</span>
              </div>
            </div>

            <div className="value-grid">
              <ValueCard icon={<BrainCircuit />} number="01" title="Agentic planning" text="Breaks broad questions into focused research paths." />
              <ValueCard icon={<Globe2 />} number="02" title="Fresh evidence" text="Searches current sources instead of relying on memory." />
              <ValueCard icon={<BarChart3 />} number="03" title="Decision brief" text="Synthesizes signals, competition, risks and whitespace." />
            </div>
          </section>
        ) : running ? (
          <section className="running">
            <div className="running-visual">
              <div className="running-grid" />
              <div className="running-core">
                <div className="scanner" />
                <Radar size={52} />
                <span>SCANNING</span>
              </div>
              <div className="running-ping ping-one" />
              <div className="running-ping ping-two" />
              <div className="running-ping ping-three" />
            </div>

            <div className="eyebrow">
              <span className="pulse" /> Agent run in progress
            </div>
            <h1>Researching <em>“{query}”</em></h1>
            <p>
              Multiple specialist steps are working together while MarketPilot
              builds the brief.
            </p>

            <div className="pipeline">
              {stages.map(([name, desc], i) => (
                <div
                  className={`pipeline-step ${i < stage ? "done" : ""} ${i === stage ? "active" : ""}`}
                  key={name}
                >
                  <div className="step-icon">
                    {i < stage ? (
                      <Check size={17} />
                    ) : i === stage ? (
                      <Loader2 className="spin" size={17} />
                    ) : (
                      <span>{i + 1}</span>
                    )}
                  </div>
                  <div>
                    <b>{name}</b>
                    <small>
                      {i < stage ? "Complete" : i === stage ? desc : "Queued"}
                    </small>
                  </div>
                </div>
              ))}
            </div>

            <div className="terminal">
              <div className="terminal-top">
                <span /><span /><span />
                <label>agent.log</label>
              </div>
              <div className="terminal-line"><i>›</i> decomposing research objective...</div>
              {stage >= 1 && <div className="terminal-line"><i>›</i> scouting fresh market evidence...</div>}
              {stage >= 2 && <div className="terminal-line"><i>›</i> comparing entities and signals...</div>}
              {stage >= 3 && <div className="terminal-line"><i>›</i> synthesizing decision brief...</div>}
            </div>
          </section>
        ) : (
          <section className="report-page">
            <div className="report-head">
              <div>
                <div className="eyebrow">
                  <span className="pulse" /> Research brief #{active.id}
                </div>
                <h1>{report?.headline || "Market intelligence report"}</h1>
                <p className="query-line">Research question · {active.query}</p>
              </div>

              <div className="report-actions">
                <button className="secondary-btn" onClick={copyBrief}>
                  {copied ? <Check size={16} /> : <Database size={16} />}
                  {copied ? "Copied" : "Copy brief"}
                </button>
                <button className="secondary-btn primary-outline" onClick={resetResearch}>
                  <Plus size={16} /> New research
                </button>
              </div>
            </div>

            {error && <div className="error"><X size={17} />{error}</div>}

            <div className="report-metrics">
              <Metric icon={<Database />} label="Sources" value={sourceCount} />
              <Metric icon={<Clock3 />} label="Agent time" value={`${Math.round((active.metadata?.duration_ms || 0) / 1000)}s`} />
              <Metric icon={<Zap />} label="Confidence" value={`${report?.confidence ?? "—"}%`} />
              <Metric icon={<Network />} label="Pipeline" value="4 agents" />
            </div>

            <div className="report-grid">
              <article className="report-card executive">
                <SectionTitle icon={<Sparkles />} title="Executive synthesis" />
                <p className="lead">{report?.executive_summary}</p>
              </article>

              <article className="report-card">
                <SectionTitle icon={<Activity />} title="Market snapshot" />
                <div className="snapshot">
                  {(report?.market_snapshot || []).map((x, i) => (
                    <div className="snapshot-item" key={i}>
                      <small>{x.label}</small>
                      <b>{x.value}</b>
                      <span>{x.detail}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="report-card wide">
                <SectionTitle icon={<TrendingUp />} title="Signals & trends" />
                <div className="trend-list">
                  {(report?.key_trends || []).map((x, i) => (
                    <div className="trend" key={i}>
                      <div className={`impact ${String(x.impact).toLowerCase()}`}>{x.impact}</div>
                      <div><b>{x.title}</b><p>{x.evidence}</p></div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="report-card">
                <SectionTitle icon={<Layers3 />} title="Competitive landscape" />
                <div className="competitors">
                  {(report?.competitive_landscape || []).map((x, i) => (
                    <div className="competitor" key={i}>
                      <div className="company-dot">{String(x.name).slice(0, 1)}</div>
                      <div><b>{x.name}</b><small>{x.positioning}</small><span>{x.strength}</span></div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="report-card">
                <SectionTitle icon={<Target />} title="Opportunity map" />
                <BulletList items={report?.opportunities} />
              </article>

              <article className="report-card">
                <SectionTitle icon={<ShieldCheck />} title="Risks to watch" />
                <BulletList items={report?.risks} risk />
              </article>

              <article className="report-card wide">
                <SectionTitle icon={<Zap />} title="Recommended next moves" />
                <div className="moves">
                  {(report?.recommended_next_steps || []).map((x, i) => (
                    <div className="move" key={i}>
                      <span>0{i + 1}</span><p>{x}</p><ArrowUpRight size={16} />
                    </div>
                  ))}
                </div>
              </article>

              <article className="report-card wide sources">
                <SectionTitle icon={<Globe2 />} title={`Evidence base · ${sourceCount} sources`} />
                <div className="source-grid">
                  {(report?.sources || []).map((s, i) => (
                    <a href={s.url} target="_blank" rel="noreferrer" key={i}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <div><b>{s.title}</b><small>{s.why_it_matters}</small><em>{s.url}</em></div>
                      <ArrowUpRight size={15} />
                    </a>
                  ))}
                </div>
              </article>
            </div>
          </section>
        )}

        {error && !running && !active && (
          <div className="error global-error"><X size={17} />{error}</div>
        )}
      </main>
    </div>
  );
}

function ValueCard({ icon, number, title, text }) {
  return (
    <div className="value-card">
      <div className="value-top"><span>{number}</span><div>{icon}</div></div>
      <b>{title}</b><p>{text}</p>
    </div>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="metric">
      <div>{icon}</div><small>{label}</small><b>{value}</b>
    </div>
  );
}

function SectionTitle({ icon, title }) {
  return <div className="section-title"><div>{icon}</div><h2>{title}</h2></div>;
}

function BulletList({ items = [], risk = false }) {
  return (
    <div className="bullet-list">
      {(items || []).map((x, i) => (
        <div key={i}><span className={risk ? "risk-dot" : ""} /><p>{x}</p></div>
      ))}
    </div>
  );
}

export default App;
