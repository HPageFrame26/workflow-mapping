import React, { useState, useRef } from "react";

// --- Design tokens ---
const T = {
  bg:        "#f6f7fb",
  canvas:    "#eef1f7",
  surface:   "#ffffff",
  border:    "#e4e8f0",
  borderMed: "#cdd4e0",
  text:      "#1f2733",
  textSoft:  "#647085",
  textFaint: "#9aa5b6",
  // FRAME gold is the interactive accent (selection, handles, focus, connectors)
  primary:   "#b8902e",
  primarySoft:"#f5eed6",
  gold:      "#b8902e",
  goldDeep:  "#8f6e1f",
  toolbar:   "#161b26",
  toolbarTop:"#1c2230",
  toolbarBtn:"#242c3b",
  danger:    "#e5484d",
};

const MIN_W = 120;
const MIN_H = 56;

function getAnchor(node, side) {
  const w = node.width || 180;
  const h = node.height || 70;
  switch (side) {
    case "top":    return { x: node.x + w / 2, y: node.y };
    case "bottom": return { x: node.x + w / 2, y: node.y + h };
    case "left":   return { x: node.x,         y: node.y + h / 2 };
    case "right":  return { x: node.x + w,     y: node.y + h / 2 };
    default:       return { x: node.x + w,     y: node.y + h / 2 };
  }
}

function bestSides(a, b) {
  const aw = a.width || 180, ah = a.height || 70;
  const bw = b.width || 180, bh = b.height || 70;
  const acx = a.x + aw / 2, acy = a.y + ah / 2;
  const bcx = b.x + bw / 2, bcy = b.y + bh / 2;
  const dx = bcx - acx, dy = bcy - acy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ["right", "left"] : ["left", "right"];
  } else {
    return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
  }
}

function curvePath(x1, y1, x2, y2, fromSide, toSide) {
  const offset = 60;
  let c1x = x1, c1y = y1, c2x = x2, c2y = y2;
  if (fromSide === "right")  c1x += offset;
  if (fromSide === "left")   c1x -= offset;
  if (fromSide === "bottom") c1y += offset;
  if (fromSide === "top")    c1y -= offset;
  if (toSide === "left")    c2x -= offset;
  if (toSide === "right")   c2x += offset;
  if (toSide === "top")     c2y -= offset;
  if (toSide === "bottom")  c2y += offset;
  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}

// --- Text wrapping: reflow label to fit node width ---
function wrapLabel(text, width, fontPx = 13.5, pad = 36) {
  const charW = fontPx * 0.58;
  const maxChars = Math.max(1, Math.floor((width - pad) / charW));
  const words = String(text).split(/\\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const cand = line ? line + " " + word : word;
    if (cand.length <= maxChars) {
      line = cand;
    } else {
      if (line) lines.push(line);
      if (word.length > maxChars) {
        let rest = word;
        while (rest.length > maxChars) {
          lines.push(rest.slice(0, maxChars));
          rest = rest.slice(maxChars);
        }
        line = rest;
      } else {
        line = word;
      }
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

const NODE_STYLES = {
  process:  { header: "#4f46e5", border: "#c7cbf5", tint: "#f3f4fe", glyph: "#4f46e5" },
  decision: { header: "#d97706", border: "#f4d9a8", tint: "#fffaf0", glyph: "#b45309" },
  start:    { header: "#0d9488", border: "#b6e5df", tint: "#f0fbf9", glyph: "#0d9488" },
  end:      { header: "#e5484d", border: "#f6c8ca", tint: "#fef3f3", glyph: "#e5484d" },
};

export default function WorkflowMapper() {
  const [view, setView] = useState("current");
  const [nodes, setNodes] = useState({
    current: [
      { id: "1", x: 80,  y: 120, label: "Start",    type: "start",    branches: [], width: 180, height: 70 },
      { id: "2", x: 340, y: 120, label: "Process A", type: "process",  branches: [], width: 180, height: 70 },
      { id: "3", x: 600, y: 120, label: "Check",     type: "decision", branches: [{ id: "b1", label: "Yes" }, { id: "b2", label: "No" }], width: 180, height: 70 },
      { id: "4", x: 600, y: 280, label: "End",       type: "end",      branches: [], width: 180, height: 70 },
    ],
    proposed: [],
  });
  const [edges, setEdges] = useState({
    current: [
      { id: "e1", from: "1", to: "2", fromSide: "right",  toSide: "left", label: "" },
      { id: "e2", from: "2", to: "3", fromSide: "right",  toSide: "left", label: "" },
      { id: "e3", from: "3", to: "4", fromSide: "bottom", toSide: "top",  label: "No" },
    ],
    proposed: [],
  });

  const [selected, setSelected]   = useState(null);
  const [dragging, setDragging]   = useState(null);
  const [resizing, setResizing]   = useState(null);
  const [connecting, setConnecting] = useState(null);
  const svgRef       = useRef(null);
  const nodeCounter  = useRef(10);
  const edgeCounter  = useRef(10);

  const curNodes = nodes[view];
  const curEdges = edges[view];

  const setViewNodes = (fn) =>
    setNodes(prev => ({ ...prev, [view]: typeof fn === "function" ? fn(prev[view]) : fn }));
  const setViewEdges = (fn) =>
    setEdges(prev => ({ ...prev, [view]: typeof fn === "function" ? fn(prev[view]) : fn }));

  // -- Pointer-capture drag --
  const onNodePointerDown = (e, nodeId) => {
    if (e.target.dataset.handle) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const node = nodes[view].find(n => n.id === nodeId);
    const rect = svgRef.current.getBoundingClientRect();
    setDragging({ nodeId, offsetX: e.clientX - rect.left - node.x, offsetY: e.clientY - rect.top - node.y });
  };
  const onNodePointerMove = (e, nodeId) => {
    if (resizing && resizing.nodeId === nodeId) {
      e.preventDefault();
      const rect = svgRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      setViewNodes(prev => prev.map(n =>
        n.id === nodeId
          ? { ...n, width: Math.max(MIN_W, mx - n.x), height: Math.max(MIN_H, my - n.y) }
          : n
      ));
      return;
    }
    if (!dragging || dragging.nodeId !== nodeId) return;
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    setViewNodes(prev => prev.map(n =>
      n.id === nodeId
        ? { ...n, x: e.clientX - rect.left - dragging.offsetX, y: e.clientY - rect.top - dragging.offsetY }
        : n
    ));
  };
  const onNodePointerUp = (e, nodeId) => {
    if (resizing && resizing.nodeId === nodeId) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setResizing(null);
      return;
    }
    if (!dragging || dragging.nodeId !== nodeId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(null);
  };

  // -- Resize handle --
  const onResizePointerDown = (e, nodeId) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setResizing({ nodeId });
  };

  // -- Connection handles --
  const onHandlePointerDown = (e, nodeId, side) => {
    e.stopPropagation();
    const rect = svgRef.current.getBoundingClientRect();
    setConnecting({ fromId: nodeId, fromSide: side, curX: e.clientX - rect.left, curY: e.clientY - rect.top });
  };
  const onSvgPointerMove = (e) => {
    if (!connecting) return;
    const rect = svgRef.current.getBoundingClientRect();
    setConnecting(prev => ({ ...prev, curX: e.clientX - rect.left, curY: e.clientY - rect.top }));
  };
  const onSvgPointerUp = (e) => {
    if (!connecting) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const target = curNodes.find(n =>
      n.id !== connecting.fromId &&
      mx >= n.x && mx <= n.x + (n.width || 180) &&
      my >= n.y && my <= n.y + (n.height || 70)
    );
    if (target) {
      const [, toSide] = bestSides(curNodes.find(n => n.id === connecting.fromId), target);
      edgeCounter.current += 1;
      setViewEdges(prev => [...prev, {
        id: `e${edgeCounter.current}`,
        from: connecting.fromId,
        to: target.id,
        fromSide: connecting.fromSide,
        toSide,
        label: "",
      }]);
    }
    setConnecting(null);
  };

  // -- Add / Delete --
  const addNode = (type) => {
    nodeCounter.current += 1;
    const newId = `n${nodeCounter.current}-${Date.now().toString(36)}`;
    setViewNodes(prev => [...prev, {
      id: newId,
      x: 120 + Math.random() * 300,
      y: 120 + Math.random() * 200,
      label: type.charAt(0).toUpperCase() + type.slice(1),
      type,
      branches: type === "decision"
        ? [{ id: "b1", label: "Yes" }, { id: "b2", label: "No" }]
        : [],
      width: 180,
      height: 70,
    }]);
  };
  const deleteSelected = () => {
    if (!selected) return;
    if (selected.type === "node") {
      setViewNodes(prev => prev.filter(n => n.id !== selected.id));
      setViewEdges(prev => prev.filter(e => e.from !== selected.id && e.to !== selected.id));
    } else {
      setViewEdges(prev => prev.filter(e => e.id !== selected.id));
    }
    setSelected(null);
  };

  // -- Export / Import --
  const exportSVG = () => {
    const svg = svgRef.current;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "workflow.svg"; a.click();
  };
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ nodes: curNodes, edges: curEdges }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "workflow.json"; a.click();
  };
  const importJSON = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { nodes: n, edges: ed } = JSON.parse(ev.target.result);

        // Bump counters past any imported IDs so new items never collide
        const maxNode = n.reduce((m, node) => {
          const num = parseInt(String(node.id).replace(/\D/g, ""), 10);
          return Number.isFinite(num) ? Math.max(m, num) : m;
        }, nodeCounter.current);
        const maxEdge = ed.reduce((m, edge) => {
          const num = parseInt(String(edge.id).replace(/\D/g, ""), 10);
          return Number.isFinite(num) ? Math.max(m, num) : m;
        }, edgeCounter.current);
        nodeCounter.current = maxNode;
        edgeCounter.current = maxEdge;

        setViewNodes(n); setViewEdges(ed);
        setSelected(null);
      } catch { alert("Invalid JSON"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // -- Selected helpers --
  const selNode = selected?.type === "node" ? curNodes.find(n => n.id === selected.id) : null;
  const selEdge = selected?.type === "edge" ? curEdges.find(e => e.id === selected.id) : null;
  const updateNode = (field, val) =>
    setViewNodes(prev => prev.map(n => n.id === selNode.id ? { ...n, [field]: val } : n));
  const updateEdge = (field, val) =>
    setViewEdges(prev => prev.map(e => e.id === selEdge.id ? { ...e, [field]: val } : e));
  const updateBranch = (bid, field, val) =>
    setViewNodes(prev => prev.map(n => n.id === selNode.id
      ? { ...n, branches: n.branches.map(b => b.id === bid ? { ...b, [field]: val } : b) }
      : n));
  const addBranch = () =>
    setViewNodes(prev => prev.map(n => n.id === selNode.id
      ? { ...n, branches: [...n.branches, { id: `b${Date.now()}`, label: "Branch" }] }
      : n));
  const removeBranch = (bid) =>
    setViewNodes(prev => prev.map(n => n.id === selNode.id
      ? { ...n, branches: n.branches.filter(b => b.id !== bid) }
      : n));

  const SIDES = ["top", "right", "bottom", "left"];

  const inputStyle = {
    width: "100%", padding: "7px 10px", border: `1px solid ${T.borderMed}`,
    borderRadius: 8, marginBottom: 12, boxSizing: "border-box", fontSize: 13,
    color: T.text, outline: "none", transition: "border-color .15s, box-shadow .15s",
  };
  const selectStyle = { ...inputStyle, background: "#fff", cursor: "pointer" };
  const labelStyle = {
    display: "block", marginBottom: 5, color: T.textSoft, fontSize: 11,
    fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em",
  };
  const tbBtn = (bg) => ({
    padding: "6px 13px", borderRadius: 8, border: "none", cursor: "pointer",
    background: bg, color: "#fff", fontSize: 12.5, fontWeight: 500,
    display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh",
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif", background: T.bg, color: T.text }}>

      <style>{`
        .wm-btn { transition: filter .15s, transform .05s, background .15s; }
        .wm-btn:hover { filter: brightness(1.08); }
        .wm-btn:active { transform: translateY(1px); }
        .wm-tab { transition: background .15s, color .15s; }
        .wm-input:focus { border-color: ${T.primary} !important; box-shadow: 0 0 0 3px ${T.primarySoft}; }
        .wm-node-shadow { filter: drop-shadow(0 4px 10px rgba(20,27,38,.10)); }
        .wm-handle { opacity: 0; transition: opacity .15s; }
        .wm-node-group:hover .wm-handle { opacity: 1; }
        .wm-handle.always { opacity: 1; }
        .wm-resize { opacity: 0; transition: opacity .15s; }
        .wm-node-group:hover .wm-resize { opacity: 1; }
        .wm-resize.always { opacity: 1; }
        .wm-brand {
          font-family: Georgia, 'Times New Roman', serif;
          font-weight: 700;
          font-size: 21px;
          letter-spacing: .22em;
          text-transform: uppercase;
          /* gold foil */
          background: linear-gradient(180deg,#f4e4ae 0%,#e5c56d 46%,#c69a3f 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: #d9b458; /* fallback */
          padding-left: .22em; /* offset the trailing letter-spacing so it reads centered */
          user-select: none;
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px",
        background: `linear-gradient(180deg,${T.toolbarTop},${T.toolbar})`, color: "#fff",
        flexShrink: 0, borderTop: `2px solid ${T.gold}`,
        boxShadow: "0 2px 8px rgba(10,13,20,.35)" }}>

        <div style={{ display: "flex", alignItems: "baseline", gap: 11, marginRight: 6 }}>
          <span className="wm-brand">Frame</span>
          <span style={{ width: 1, height: 18, background: "rgba(255,255,255,.16)",
            alignSelf: "center" }} />
          <span style={{ fontSize: 12.5, fontWeight: 500, color: "#aeb7c6",
            letterSpacing: ".02em" }}>Workflow Mapper</span>
        </div>

        <div style={{ display: "flex", background: "#0e121b", borderRadius: 9, padding: 3, gap: 3 }}>
          {["current", "proposed"].map(v => (
            <button key={v} className="wm-tab" onClick={() => { setView(v); setSelected(null); }}
              style={{ padding: "5px 15px", borderRadius: 7, border: "none", cursor: "pointer",
                background: view === v ? T.gold : "transparent",
                color: view === v ? "#1a1f2b" : "#9aa5b6", fontWeight: view === v ? 700 : 500, fontSize: 12.5 }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        <span style={{ flex: 1 }} />

        <div style={{ display: "flex", gap: 6, paddingRight: 10, marginRight: 4,
          borderRight: "1px solid rgba(255,255,255,.10)" }}>
          {["process", "decision", "start", "end"].map(t => (
            <button key={t} className="wm-btn" onClick={() => addNode(t)}
              style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                background: T.toolbarBtn, color: "#fff", fontSize: 12, fontWeight: 500,
                display: "inline-flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: NODE_STYLES[t].header }} />
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <button className="wm-btn" onClick={exportSVG} style={tbBtn(T.toolbarBtn)}>Save SVG</button>
        <button className="wm-btn" onClick={exportJSON} style={tbBtn(T.toolbarBtn)}>Export JSON</button>
        <label className="wm-btn" style={{ ...tbBtn(T.toolbarBtn), cursor: "pointer" }}>
          Import JSON
          <input type="file" accept=".json" onChange={importJSON} style={{ display: "none" }} />
        </label>

        {selected && (
          <button className="wm-btn" onClick={deleteSelected} style={tbBtn(T.danger)}>Delete</button>
        )}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        <svg ref={svgRef} style={{ flex: 1, background: T.canvas }}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onClick={() => setSelected(null)}>

          <defs>
            <marker id="arrow" markerWidth="9" markerHeight="9" refX="6.5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#8a93a6" />
            </marker>
            <marker id="arrowSel" markerWidth="9" markerHeight="9" refX="6.5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={T.primary} />
            </marker>
            <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
              <circle cx="1.2" cy="1.2" r="1.2" fill="#d3d9e4" />
            </pattern>
          </defs>

          <rect x="0" y="0" width="100%" height="100%" fill="url(#grid)" />

          {curEdges.map(edge => {
            const fn = curNodes.find(n => n.id === edge.from);
            const tn = curNodes.find(n => n.id === edge.to);
            if (!fn || !tn) return null;
            const a1 = getAnchor(fn, edge.fromSide);
            const a2 = getAnchor(tn, edge.toSide);
            const d  = curvePath(a1.x, a1.y, a2.x, a2.y, edge.fromSide, edge.toSide);
            const isSel = selected?.type === "edge" && selected.id === edge.id;
            return (
              <g key={edge.id} onClick={e => { e.stopPropagation(); setSelected({ type: "edge", id: edge.id }); }}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: "pointer" }} />
                <path d={d} fill="none" stroke={isSel ? T.primary : "#8a93a6"}
                  strokeWidth={isSel ? 2.5 : 1.75} strokeLinecap="round"
                  markerEnd={isSel ? "url(#arrowSel)" : "url(#arrow)"} />
                {edge.label && (
                  <g style={{ pointerEvents: "none" }}>
                    <rect x={(a1.x + a2.x) / 2 - edge.label.length * 3.6 - 6}
                      y={(a1.y + a2.y) / 2 - 18} rx={5}
                      width={edge.label.length * 7.2 + 12} height={18}
                      fill="#fff" stroke={T.border} strokeWidth={1} />
                    <text x={(a1.x + a2.x) / 2} y={(a1.y + a2.y) / 2 - 5}
                      textAnchor="middle" fontSize={11} fontWeight={600} fill={T.textSoft}>
                      {edge.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {connecting && (() => {
            const fn = curNodes.find(n => n.id === connecting.fromId);
            if (!fn) return null;
            const a = getAnchor(fn, connecting.fromSide);
            return <line x1={a.x} y1={a.y} x2={connecting.curX} y2={connecting.curY}
              stroke={T.primary} strokeWidth={2} strokeDasharray="5,4" strokeLinecap="round"
              style={{ pointerEvents: "none" }} />;
          })()}

          {curNodes.map(node => {
            const w = node.width || 180, h = node.height || 70;
            const s = NODE_STYLES[node.type] || NODE_STYLES.process;
            const isSel = selected?.type === "node" && selected.id === node.id;
            const lines = wrapLabel(node.label, w, 13.5, node.type === "decision" ? 40 : 46);
            const lineH = 17;
            const labelBlockH = lines.length * lineH;
            return (
              <g key={node.id} className="wm-node-group"
                onPointerDown={e => onNodePointerDown(e, node.id)}
                onPointerMove={e => onNodePointerMove(e, node.id)}
                onPointerUp={e => onNodePointerUp(e, node.id)}
                onClick={e => { e.stopPropagation(); setSelected({ type: "node", id: node.id }); }}
                style={{ cursor: dragging?.nodeId === node.id ? "grabbing" : "grab" }}>

                {node.type === "decision" ? (
                  <polygon className="wm-node-shadow"
                    points={`${node.x + w/2},${node.y} ${node.x + w},${node.y + h/2} ${node.x + w/2},${node.y + h} ${node.x},${node.y + h/2}`}
                    fill={s.tint} stroke={s.border} strokeWidth={1.5} />
                ) : (
                  <>
                    <rect className="wm-node-shadow" x={node.x} y={node.y} width={w} height={h} rx={10}
                      fill={T.surface} stroke={s.border} strokeWidth={1.5} />
                    <rect x={node.x} y={node.y} width={5} height={h} rx={2.5}
                      fill={s.header} style={{ pointerEvents: "none" }} />
                  </>
                )}

                {/* Wrapped label */}
                {node.type === "decision" ? (
                  <text x={node.x + w / 2}
                    y={node.y + h / 2 - labelBlockH / 2 + lineH - 4}
                    textAnchor="middle" fontSize={13.5} fontWeight={700} fill={s.glyph}
                    style={{ pointerEvents: "none", userSelect: "none" }}>
                    {lines.map((ln, i) => (
                      <tspan key={i} x={node.x + w / 2} dy={i === 0 ? 0 : lineH}>{ln}</tspan>
                    ))}
                  </text>
                ) : (
                  <text x={node.x + 18} y={node.y + 28}
                    textAnchor="start" fontSize={13.5} fontWeight={700} fill={T.text}
                    style={{ pointerEvents: "none", userSelect: "none" }}>
                    {lines.map((ln, i) => (
                      <tspan key={i} x={node.x + 18} dy={i === 0 ? 0 : lineH}>{ln}</tspan>
                    ))}
                  </text>
                )}

                {node.type !== "decision" && (
                  <text x={node.x + 18} y={node.y + 28 + labelBlockH + 4}
                    textAnchor="start" fontSize={10.5} fontWeight={600}
                    fill={s.glyph} letterSpacing=".05em"
                    style={{ pointerEvents: "none", userSelect: "none", textTransform: "uppercase" }}>
                    {node.type}
                  </text>
                )}

                {/* Connection handles */}
                {SIDES.map(side => {
                  const a = getAnchor(node, side);
                  return (
                    <circle key={side} className={`wm-handle${isSel ? " always" : ""}`}
                      cx={a.x} cy={a.y} r={5.5}
                      fill="#fff" stroke={T.primary} strokeWidth={2}
                      data-handle="true"
                      style={{ cursor: "crosshair" }}
                      onPointerDown={e => { e.stopPropagation(); onHandlePointerDown(e, node.id, side); }} />
                  );
                })}

                {/* Resize grip (bottom-right corner) */}
                <rect className={`wm-resize${isSel ? " always" : ""}`}
                  x={node.x + w - 14} y={node.y + h - 14} width={14} height={14} rx={3}
                  fill="#fff" stroke={T.primary} strokeWidth={1.5}
                  data-handle="true"
                  style={{ cursor: "nwse-resize" }}
                  onPointerDown={e => onResizePointerDown(e, node.id)}
                  onPointerMove={e => onNodePointerMove(e, node.id)}
                  onPointerUp={e => onNodePointerUp(e, node.id)} />
                <path className={`wm-resize${isSel ? " always" : ""}`}
                  d={`M ${node.x + w - 10} ${node.y + h - 3} L ${node.x + w - 3} ${node.y + h - 10}
                     M ${node.x + w - 6} ${node.y + h - 3} L ${node.x + w - 3} ${node.y + h - 6}`}
                  stroke={T.primary} strokeWidth={1.2} fill="none"
                  style={{ pointerEvents: "none" }} />
              </g>
            );
          })}
        </svg>

        <div style={{ width: 288, background: T.surface, borderLeft: `1px solid ${T.border}`,
          overflowY: "auto", padding: "20px 18px", fontSize: 13, color: T.text, flexShrink: 0 }}>

          {!selected && (
            <div style={{ color: T.textFaint, marginTop: 60, textAlign: "center", lineHeight: 1.7, fontSize: 13 }}>
              <div style={{ fontSize: 30, marginBottom: 10, opacity: .5 }}>&#9671;</div>
              Select a node or connection<br />to edit its properties
            </div>
          )}

          {selNode && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3,
                  background: (NODE_STYLES[selNode.type] || NODE_STYLES.process).header }} />
                <span style={{ fontWeight: 700, fontSize: 14.5 }}>Node Properties</span>
              </div>

              <label style={labelStyle}>Label</label>
              <input className="wm-input" value={selNode.label}
                onChange={e => updateNode("label", e.target.value)} style={inputStyle} />

              <label style={labelStyle}>Type</label>
              <select className="wm-input" value={selNode.type}
                onChange={e => updateNode("type", e.target.value)} style={selectStyle}>
                <option value="process">Process</option>
                <option value="decision">Decision</option>
                <option value="start">Start</option>
                <option value="end">End</option>
              </select>

              {selNode.type === "decision" && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10, color: T.text, fontSize: 13 }}>Branches</div>
                  {selNode.branches.map(b => (
                    <div key={b.id} style={{ background: T.bg, border: `1px solid ${T.border}`,
                      borderRadius: 9, padding: "8px", marginBottom: 9 }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input className="wm-input" placeholder="Label (e.g. Yes)" value={b.label}
                          onChange={e => updateBranch(b.id, "label", e.target.value)}
                          style={{ flex: 1, padding: "5px 8px", border: `1px solid ${T.borderMed}`,
                            borderRadius: 6, fontSize: 12, marginBottom: 0, boxSizing: "border-box" }} />
                        <button className="wm-btn" onClick={() => removeBranch(b.id)}
                          style={{ padding: "2px 9px", background: "#fdecec", border: "none",
                            borderRadius: 6, cursor: "pointer", color: T.danger, fontSize: 13, fontWeight: 600 }}>&#10005;</button>
                      </div>
                    </div>
                  ))}
                  <button className="wm-btn" onClick={addBranch}
                    style={{ width: "100%", padding: "7px 0", background: T.primarySoft,
                      border: `1px dashed ${T.primary}`, borderRadius: 8, cursor: "pointer",
                      color: T.primary, fontSize: 12.5, fontWeight: 600, marginTop: 2 }}>
                    + Add Branch
                  </button>
                </div>
              )}
            </div>
          )}

          {selEdge && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: T.primary }} />
                <span style={{ fontWeight: 700, fontSize: 14.5 }}>Connection Properties</span>
              </div>

              <label style={labelStyle}>Label</label>
              <input className="wm-input" value={selEdge.label}
                onChange={e => updateEdge("label", e.target.value)} style={inputStyle} />

              <label style={labelStyle}>From side</label>
              <select className="wm-input" value={selEdge.fromSide}
                onChange={e => updateEdge("fromSide", e.target.value)} style={selectStyle}>
                {SIDES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <label style={labelStyle}>To side</label>
              <select className="wm-input" value={selEdge.toSide}
                onChange={e => updateEdge("toSide", e.target.value)} style={selectStyle}>
                {SIDES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
