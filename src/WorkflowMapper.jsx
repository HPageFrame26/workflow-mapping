import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

/* Zero-dependency version — icons are inline SVG, so this file imports
   nothing but React. Nothing to install. */

const NODE_W = 178;
const HEADER_MID = 17;

/* ---- tiny inline icon set (replaces lucide-react) ---- */
const Ic = {
  play:   "M8 5v14l11-7z",
  flag:   "M4 21V4h11l-1 3h6v9h-9l-1-3H6v8z",
  hand:   "M7 11V6a1.5 1.5 0 0 1 3 0m0 0V4.5a1.5 1.5 0 0 1 3 0V10m0-4a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-3.5a1.6 1.6 0 0 1 2.6-1.8L7 11",
  zap:    "M13 2L4 14h7l-2 8 9-12h-7z",
  branch: "M6 3v12a4 4 0 0 0 4 4h4m0 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM6 3a2 2 0 1 0-4 0 2 2 0 0 0 4 0z",
  server: "M4 5h16v5H4zM4 14h16v5H4zM7 7.5h.01M7 16.5h.01",
  plus:   "M12 5v14M5 12h14",
  trash:  "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  x:      "M6 6l12 12M18 6L6 18",
  reset:  "M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5",
  link:   "M9 15l6-6M10 6l1-1a4 4 0 0 1 6 6l-1 1m-4 4l-1 1a4 4 0 0 1-6-6l1-1",
  arrow:  "M5 12h14M13 6l6 6-6 6",
};
function Icon({ d, size = 14, color = "currentColor", fill = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={fill ? color : "none"} stroke={fill ? "none" : color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: "none" }}>
      <path d={d} />
    </svg>
  );
}

const TYPES = {
  start:     { name: "Start",     icon: "play",   fill: true,  color: "#64748b" },
  manual:    { name: "Manual",    icon: "hand",   fill: false, color: "#d97706" },
  automated: { name: "Automated", icon: "zap",    fill: true,  color: "#0d9488" },
  decision:  { name: "Decision",  icon: "branch", fill: false, color: "#7c3aed" },
  system:    { name: "System",    icon: "server", fill: false, color: "#2563eb" },
  end:       { name: "End",       icon: "flag",   fill: false, color: "#64748b" },
};
const TYPE_ORDER = ["start", "manual", "automated", "decision", "system", "end"];
const LEGEND = ["manual", "automated", "decision", "system"];

let _id = 100;
const uid = () => `n${_id++}`;
const e = (from, to) => ({ id: `${from}-${to}`, from, to });

const seed = () => ({
  current: {
    nodes: [
      { id: "c1", type: "start",    x: 40,  y: 24,  label: "Invoice arrives (email/post)" },
      { id: "c2", type: "manual",   x: 40,  y: 116, label: "Download & save the PDF" },
      { id: "c3", type: "manual",   x: 40,  y: 208, label: "Key data into the system" },
      { id: "c4", type: "manual",   x: 40,  y: 300, label: "Look up & apply VAT rate" },
      { id: "c5", type: "decision", x: 40,  y: 392, label: "VAT correct?" },
      { id: "c6", type: "manual",   x: 252, y: 392, label: "Fix & re-check" },
      { id: "c7", type: "manual",   x: 40,  y: 484, label: "File the invoice" },
      { id: "c8", type: "end",      x: 40,  y: 576, label: "Posted to ledger" },
    ],
    edges: [ e("c1","c2"), e("c2","c3"), e("c3","c4"), e("c4","c5"),
             e("c5","c6"), e("c6","c7"), e("c5","c7"), e("c7","c8") ],
  },
  proposed: {
    nodes: [
      { id: "p1", type: "start",     x: 40,  y: 24,  label: "Invoice hits shared inbox" },
      { id: "p2", type: "automated", x: 40,  y: 116, label: "AI extracts invoice data" },
      { id: "p3", type: "automated", x: 40,  y: 208, label: "Detect supplier country" },
      { id: "p4", type: "automated", x: 40,  y: 300, label: "AI classifies VAT treatment" },
      { id: "p5", type: "decision",  x: 40,  y: 392, label: "Confidence high?" },
      { id: "p6", type: "manual",    x: 252, y: 392, label: "Human reviews exception" },
      { id: "p7", type: "automated", x: 40,  y: 484, label: "Auto-post to ledger" },
      { id: "p8", type: "end",       x: 40,  y: 576, label: "Posted to ledger" },
    ],
    edges: [ e("p1","p2"), e("p2","p3"), e("p3","p4"), e("p4","p5"),
             e("p5","p7"), e("p5","p6"), e("p6","p7"), e("p7","p8") ],
  },
});

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&display=swap');
.wm-root{
  --ink:#1e293b; --ink-soft:#64748b; --ink-faint:#94a3b8;
  --line:#e7eaef; --line-soft:#eef1f5; --surface:#fff; --canvas:#f6f7f9; --field:#f1f5f9;
  height:100vh; display:flex; flex-direction:column; background:var(--surface);
  color:var(--ink); font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.wm-root *{box-sizing:border-box;}
.wm-num{font-variant-numeric:tabular-nums;}
.wm-head{display:flex;align-items:center;gap:14px;padding:12px 20px;border-bottom:1px solid var(--line);}
.wm-mark{height:30px;width:30px;border-radius:8px;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;flex:none;}
.wm-title{font-size:14px;font-weight:700;letter-spacing:-.01em;line-height:1;}
.wm-sub{font-size:11px;color:var(--ink-faint);margin-top:3px;letter-spacing:.01em;}
.wm-stat{display:flex;align-items:center;gap:14px;margin-left:auto;}
.wm-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;background:#f0fdfa;color:#0f766e;font-size:11px;font-weight:600;border:1px solid #cbeae4;}
.wm-delta{font-size:12px;color:var(--ink-soft);display:flex;align-items:center;gap:7px;}
.wm-delta b{color:var(--ink);font-weight:600;}
.wm-btn{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;border-radius:7px;padding:6px 11px;cursor:pointer;transition:background .15s,border-color .15s,color .15s;border:1px solid transparent;}
.wm-btn:focus-visible{outline:2px solid var(--ink);outline-offset:2px;}
.wm-ghost{background:#fff;border-color:var(--line);color:var(--ink-soft);}
.wm-ghost:hover{background:var(--field);color:var(--ink);}
.wm-primary{background:var(--ink);border-color:var(--ink);color:#fff;}
.wm-primary:hover{background:#0f172a;}
.wm-subbar{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:8px 20px;border-bottom:1px solid var(--line);background:#fbfcfd;}
.wm-legend{display:flex;align-items:center;gap:14px;}
.wm-leg{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--ink-soft);font-weight:500;}
.wm-dot{height:9px;width:9px;border-radius:3px;flex:none;}
.wm-hint{margin-left:auto;font-size:11px;color:var(--ink-faint);}
.wm-hint b{color:var(--ink-soft);font-weight:600;}
.wm-panels{display:flex;flex:1;overflow:hidden;}
.wm-panel{display:flex;flex-direction:column;flex:1;min-width:0;}
.wm-panel + .wm-panel{border-left:1px solid var(--line);}
.wm-phead{display:flex;align-items:center;gap:10px;padding:11px 18px;border-bottom:1px solid var(--line);}
.wm-eyebrow{font-size:11px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-soft);}
.wm-counts{display:flex;align-items:center;gap:7px;margin-left:auto;}
.wm-count{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--ink-soft);}
.wm-connect{display:flex;align-items:center;gap:8px;padding:7px 18px;background:#f5f3ff;color:#6d28d9;font-size:11.5px;font-weight:500;border-bottom:1px solid #e9e4fb;}
.wm-connect .x{margin-left:auto;display:inline-flex;align-items:center;gap:4px;cursor:pointer;font-weight:600;}
.wm-connect .x:hover{text-decoration:underline;}
.wm-canvas{position:relative;flex:1;overflow:auto;background:var(--canvas);}
.wm-inner{position:relative;width:470px;height:700px;background-image:radial-gradient(#dfe3ea 1px,transparent 1px);background-size:20px 20px;}
.wm-node{position:absolute;width:${NODE_W}px;background:var(--surface);border:1px solid var(--line);border-left-width:3px;border-radius:9px;box-shadow:0 1px 2px rgba(15,23,42,.05),0 1px 3px rgba(15,23,42,.04);transition:box-shadow .15s,transform .15s;}
.wm-node:hover{box-shadow:0 5px 16px rgba(15,23,42,.10);}
.wm-node.sel{box-shadow:0 0 0 1.5px var(--ink),0 6px 18px rgba(15,23,42,.12);}
.wm-node.tgt{cursor:pointer;box-shadow:0 0 0 1.5px #a78bfa;}
.wm-nhead{display:flex;align-items:center;gap:6px;padding:7px 9px 6px;cursor:grab;user-select:none;border-bottom:1px solid var(--line-soft);}
.wm-nhead:active{cursor:grabbing;}
.wm-tag{font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;}
.wm-conn{margin-left:auto;height:17px;width:17px;border-radius:999px;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);background:#fff;color:var(--ink-faint);cursor:pointer;transition:background .15s,border-color .15s,color .15s;}
.wm-conn:hover{border-color:var(--ink);color:var(--ink);}
.wm-conn.on{background:var(--ink);border-color:var(--ink);color:#fff;}
.wm-label{padding:8px 10px 9px;font-size:12.5px;line-height:1.35;color:var(--ink);}
.wm-edit{padding:9px;display:flex;flex-direction:column;gap:9px;}
.wm-input{width:100%;border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:12px;color:var(--ink);outline:none;font-family:inherit;}
.wm-input:focus{border-color:var(--ink);}
.wm-types{display:flex;flex-wrap:wrap;gap:5px;}
.wm-tbtn{height:26px;width:26px;border-radius:6px;border:1px solid var(--line);background:#fff;display:flex;align-items:center;justify-content:center;color:var(--ink-faint);cursor:pointer;transition:all .12s;}
.wm-tbtn:hover{color:var(--ink-soft);}
.wm-tbtn.on{border-color:var(--ink);background:var(--ink);color:#fff;}
.wm-del{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:6px;border-radius:6px;border:1px solid #f1d4d4;background:#fdf3f3;color:#c0392b;font-size:11px;font-weight:600;cursor:pointer;}
.wm-del:hover{background:#fbe9e9;}
@media (prefers-reduced-motion:reduce){.wm-root *{transition:none!important;}}
`;

function Edges({ nodes, edges }) {
  const pos = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  return (
    <svg width="100%" height="100%"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
      <defs>
        <marker id="wm-arrow" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1 L8 5 L1 9" fill="none" stroke="#9aa5b5"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      {edges.map((ed) => {
        const a = pos[ed.from], b = pos[ed.to];
        if (!a || !b) return null;
        const x1 = a.x + NODE_W, y1 = a.y + HEADER_MID;
        const x2 = b.x,          y2 = b.y + HEADER_MID;
        const dx = Math.max(42, Math.abs(x2 - x1) / 2);
        return (
          <path key={ed.id}
            d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
            fill="none" stroke="#c3cbd7" strokeWidth="1.7" markerEnd="url(#wm-arrow)" />
        );
      })}
    </svg>
  );
}

function NodeCard({ node, side, selected, connecting, onHeaderDown, onBodyClick,
                    onStartConnect, onEdit, onDelete }) {
  const t = TYPES[node.type];
  const isSource = connecting && connecting.side === side && connecting.fromId === node.id;
  const isTarget = connecting && connecting.side === side && connecting.fromId !== node.id;
  return (
    <div className={`wm-node${selected ? " sel" : ""}${isTarget ? " tgt" : ""}`}
      style={{ left: node.x, top: node.y, borderLeftColor: t.color }}
      onClick={(ev) => { ev.stopPropagation(); onBodyClick(node.id); }}>
      <div className="wm-nhead" onMouseDown={(ev) => onHeaderDown(ev, node)}>
        <Icon d={Ic[t.icon]} size={13} color={t.color} fill={t.fill} />
        <span className="wm-tag" style={{ color: t.color }}>{t.name}</span>
        <button className={`wm-conn${isSource ? " on" : ""}`} title="Draw an arrow to the next step"
          onMouseDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => { ev.stopPropagation(); onStartConnect(node.id); }}>
          <Icon d={Ic.link} size={10} />
        </button>
      </div>
      {selected ? (
        <div className="wm-edit" onMouseDown={(ev) => ev.stopPropagation()}>
          <input className="wm-input" autoFocus value={node.label}
            onChange={(ev) => onEdit(node.id, { label: ev.target.value })} />
          <div className="wm-types">
            {TYPE_ORDER.map((tk) => (
              <button key={tk} title={TYPES[tk].name}
                className={`wm-tbtn${node.type === tk ? " on" : ""}`}
                onClick={(ev) => { ev.stopPropagation(); onEdit(node.id, { type: tk }); }}>
                <Icon d={Ic[TYPES[tk].icon]} size={12} fill={TYPES[tk].fill && node.type === tk} />
              </button>
            ))}
          </div>
          <button className="wm-del" onClick={(ev) => { ev.stopPropagation(); onDelete(node.id); }}>
            <Icon d={Ic.trash} size={11} /> Delete step
          </button>
        </div>
      ) : (
        <div className="wm-label">{node.label}</div>
      )}
    </div>
  );
}

function Panel({ side, title, data, selected, connecting, dispatch }) {
  const innerRef = useRef(null);
  const dragRef = useRef(null);
  useEffect(() => {
    const move = (ev) => {
      const d = dragRef.current;
      if (!d || !innerRef.current) return;
      const r = innerRef.current.getBoundingClientRect();
      dispatch({ t: "move", side, id: d.id,
        x: Math.max(0, ev.clientX - r.left - d.offX),
        y: Math.max(0, ev.clientY - r.top - d.offY) });
    };
    const up = () => (dragRef.current = null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [side, dispatch]);
  const onHeaderDown = (ev, node) => {
    ev.preventDefault();
    const r = innerRef.current.getBoundingClientRect();
    dragRef.current = { id: node.id, offX: ev.clientX - r.left - node.x, offY: ev.clientY - r.top - node.y };
  };
  const counts = useMemo(() => {
    const c = { manual: 0, automated: 0 };
    data.nodes.forEach((n) => { if (c[n.type] !== undefined) c[n.type]++; });
    return c;
  }, [data.nodes]);
  return (
    <div className="wm-panel">
      <div className="wm-phead">
        <span className="wm-eyebrow">{title}</span>
        <div className="wm-counts">
          <span className="wm-count"><span className="wm-dot" style={{ background: TYPES.manual.color }} /><span className="wm-num">{counts.manual}</span> manual</span>
          <span className="wm-count"><span className="wm-dot" style={{ background: TYPES.automated.color }} /><span className="wm-num">{counts.automated}</span> automated</span>
          <button className="wm-btn wm-primary" onClick={() => dispatch({ t: "add", side })}>
            <Icon d={Ic.plus} size={12} color="#fff" /> Add step
          </button>
        </div>
      </div>
      {connecting && connecting.side === side && (
        <div className="wm-connect">
          <Icon d={Ic.link} size={12} color="#6d28d9" /> Pick the step this connects to.
          <span className="x" onClick={() => dispatch({ t: "cancelConnect" })}><Icon d={Ic.x} size={11} color="#6d28d9" /> Cancel</span>
        </div>
      )}
      <div className="wm-canvas" onClick={() => dispatch({ t: "clearSel" })}>
        <div ref={innerRef} className="wm-inner">
          <Edges nodes={data.nodes} edges={data.edges} />
          {data.nodes.map((n) => (
            <NodeCard key={n.id} node={n} side={side}
              selected={selected && selected.side === side && selected.id === n.id}
              connecting={connecting}
              onHeaderDown={onHeaderDown}
              onBodyClick={(id) => dispatch({ t: "clickNode", side, id })}
              onStartConnect={(id) => dispatch({ t: "startConnect", side, id })}
              onEdit={(id, patch) => dispatch({ t: "edit", side, id, patch })}
              onDelete={(id) => dispatch({ t: "delete", side, id })} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WorkflowMapper() {
  const [diagrams, setDiagrams] = useState({
    current: { nodes: [], edges: [] },
    proposed: { nodes: [], edges: [] },
  });
  const [selected, setSelected] = useState(null);
  const [connecting, setConnecting] = useState(null);

  const dispatch = useCallback((a) => {
    switch (a.t) {
      case "move":
        setDiagrams((d) => ({ ...d, [a.side]: { ...d[a.side],
          nodes: d[a.side].nodes.map((n) => (n.id === a.id ? { ...n, x: a.x, y: a.y } : n)) } }));
        break;
      case "edit":
        setDiagrams((d) => ({ ...d, [a.side]: { ...d[a.side],
          nodes: d[a.side].nodes.map((n) => (n.id === a.id ? { ...n, ...a.patch } : n)) } }));
        break;
      case "add": {
        const n = { id: uid(), type: "manual", x: 40, y: 30, label: "New step" };
        setDiagrams((d) => ({ ...d, [a.side]: { ...d[a.side], nodes: [...d[a.side].nodes, n] } }));
        setSelected({ side: a.side, id: n.id });
        break;
      }
      case "delete":
        setDiagrams((d) => ({ ...d, [a.side]: {
          nodes: d[a.side].nodes.filter((n) => n.id !== a.id),
          edges: d[a.side].edges.filter((ed) => ed.from !== a.id && ed.to !== a.id) } }));
        setSelected(null);
        break;
      case "startConnect":
        setSelected(null); setConnecting({ side: a.side, fromId: a.id });
        break;
      case "cancelConnect":
        setConnecting(null);
        break;
      case "clickNode":
        if (connecting && connecting.side === a.side && connecting.fromId !== a.id) {
          const from = connecting.fromId, to = a.id;
          setDiagrams((d) => {
            if (d[a.side].edges.some((ed) => ed.from === from && ed.to === to)) return d;
            return { ...d, [a.side]: { ...d[a.side], edges: [...d[a.side].edges, e(from, to)] } };
          });
          setConnecting(null);
        } else {
          setConnecting(null); setSelected({ side: a.side, id: a.id });
        }
        break;
      case "clearSel":
        setSelected(null); setConnecting(null);
        break;
      case "reset":
        setDiagrams(seed()); setSelected(null); setConnecting(null);
        break;
      default: break;
    }
  }, [connecting]);

  useEffect(() => {
    const key = (ev) => { if (ev.key === "Escape") dispatch({ t: "clearSel" }); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [dispatch]);

  const curManual = diagrams.current.nodes.filter((n) => n.type === "manual").length;
  const propManual = diagrams.proposed.nodes.filter((n) => n.type === "manual").length;
  const propAuto = diagrams.proposed.nodes.filter((n) => n.type === "automated").length;

  return (
    <div className="wm-root">
      <style>{CSS}</style>
      <header className="wm-head">
        <div className="wm-mark"><Icon d={Ic.arrow} size={16} color="#fff" /></div>
        <div>
          <div className="wm-title">Process Mapper</div>
          <div className="wm-sub">Scoping — current vs proposed</div>
        </div>
        <div className="wm-stat">
          <span className="wm-delta">
            <span className="wm-num"><b>{curManual}</b></span>
            <Icon d={Ic.arrow} size={13} color="#94a3b8" />
            <span className="wm-num"><b>{propManual}</b></span> manual steps
          </span>
          {propAuto > 0 && (
            <span className="wm-pill"><Icon d={Ic.zap} size={12} color="#0f766e" fill /> <span className="wm-num">{propAuto}</span> automated</span>
          )}
          <button className="wm-btn wm-ghost" onClick={() => dispatch({ t: "reset" })}>
            <Icon d={Ic.reset} size={12} /> Reset
          </button>
        </div>
      </header>
      <div className="wm-subbar">
        <div className="wm-legend">
          {LEGEND.map((tk) => (
            <span key={tk} className="wm-leg">
              <span className="wm-dot" style={{ background: TYPES[tk].color }} /> {TYPES[tk].name}
            </span>
          ))}
        </div>
        <div className="wm-hint">
          <b>Drag</b> a step by its header · <b>click</b> to edit · use the link button to <b>connect</b> steps
        </div>
      </div>
      <div className="wm-panels">
        <Panel side="current"  title="Current process"  data={diagrams.current}  selected={selected} connecting={connecting} dispatch={dispatch} />
        <Panel side="proposed" title="Proposed process" data={diagrams.proposed} selected={selected} connecting={connecting} dispatch={dispatch} />
      </div>
    </div>
  );
}