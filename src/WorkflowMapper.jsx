import React, { useState, useRef, useCallback } from "react";

// ─── Utility: get anchor point on a node ────────────────────────────────────
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

// Pick closest pair of sides between two nodes
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

// Curved SVG path between two points
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

// ─── Node colour by type ─────────────────────────────────────────────────────
const NODE_STYLES = {
  process:  { header: "#3b82f6", border: "#2563eb" },
  decision: { header: "#f59e0b", border: "#d97706" },
  start:    { header: "#10b981", border: "#059669" },
  end:      { header: "#ef4444", border: "#dc2626" },
};

// ─── Main component ──────────────────────────────────────────────────────────
export default function WorkflowMapper() {
  const [view, setView] = useState("current");
  const [nodes, setNodes] = useState({
    current: [
      { id: "1", x: 80,  y: 120, label: "Start",    type: "start",    branches: [], width: 180, height: 70 },
      { id: "2", x: 340, y: 120, label: "Process A", type: "process",  branches: [], width: 180, height: 70 },
      { id: "3", x: 600, y: 120, label: "Check",     type: "decision", branches: [{ id: "b1", label: "Yes", logic: "" }, { id: "b2", label: "No", logic: "" }], width: 180, height: 70 },
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

  // ── Pointer-capture drag (fixes stuck-dragging bug) ────────────────────────
  const onNodePointerDown = (e, nodeId) => {
    if (e.target.dataset.handle) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const node = nodes[view].find(n => n.id === nodeId);
    const rect = svgRef.current.getBoundingClientRect();
    setDragging({ nodeId, offsetX: e.clientX - rect.left - node.x, offsetY: e.clientY - rect.top - node.y });
  };
  const onNodePointerMove = (e, nodeId) => {
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
    if (!dragging || dragging.nodeId !== nodeId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(null);
  };

  // ── Connection handles ─────────────────────────────────────────────────────
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

  // ── Add / Delete ───────────────────────────────────────────────────────────
  const addNode = (type) => {
    nodeCounter.current += 1;
    setViewNodes(prev => [...prev, {
      id: `${nodeCounter.current}`,
      x: 120 + Math.random() * 300,
      y: 120 + Math.random() * 200,
      label: type.charAt(0).toUpperCase() + type.slice(1),
      type,
      branches: type === "decision"
        ? [{ id: "b1", label: "Yes", logic: "" }, { id: "b2", label: "No", logic: "" }]
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

  // ── Export ─────────────────────────────────────────────────────────────────
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
        setViewNodes(n); setViewEdges(ed);
      } catch { alert("Invalid JSON"); }
    };
    reader.readAsText(file);
  };

  // ── Selected helpers ───────────────────────────────────────────────────────
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
      ? { ...n, branches: [...n.branches, { id: `b${Date.now()}`, label: "Branch", logic: "" }] }
      : n));
  const removeBranch = (bid) =>
    setViewNodes(prev => prev.map(n => n.id === selNode.id
      ? { ...n, branches: n.branches.filter(b => b.id !== bid) }
      : n));

  const SIDES = ["top", "right", "bottom", "left"];
  const inputStyle = { width: "100%", padding: "5px 8px", border: "1px solid #cbd5e1", borderRadius: 6, marginBottom: 10, boxSizing: "border-box", fontSize: 13 };
  const selectStyle = { ...inputStyle, background: "#fff" };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui, sans-serif", background: "#f8fafc" }}>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "#1e293b", color: "#fff", flexShrink: 0 }}>
        <strong style={{ fontSize: 15, marginRight: 8 }}>Workflow Mapper</strong>

        {["current", "proposed"].map(v => (
          <button key={v} onClick={() => { setView(v); setSelected(null); }}
            style={{ padding: "4px 14px", borderRadius: 6, border: "none", cursor: "pointer",
              background: view === v ? "#3b82f6" : "#334155", color: "#fff", fontWeight: view === v ? 700 : 400, fontSize: 13 }}>
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}

        <span style={{ flex: 1 }} />

        {["process", "decision", "start", "end"].map(t => (
          <button key={t} onClick={() => addNode(t)}
            style={{ padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer",
              background: NODE_STYLES[t].header, color: "#fff", fontSize: 12 }}>
            + {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}

        <button onClick={exportSVG}
          style={{ padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: "#6366f1", color: "#fff", fontSize: 12 }}>
          Save SVG
        </button>
        <button onClick={exportJSON}
          style={{ padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: "#0891b2", color: "#fff", fontSize: 12 }}>
          Export JSON
        </button>
        <label style={{ padding: "4px 12px", borderRadius: 6, background: "#0891b2", color: "#fff", fontSize: 12, cursor: "pointer" }}>
          Import JSON <input type="file" accept=".json" onChange={importJSON} style={{ display: "none" }} />
        </label>

        {selected && (
          <button onClick={deleteSelected}
            style={{ padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: "#ef4444", color: "#fff", fontSize: 12 }}>
            Delete
          </button>
        )}
      </div>

      {/* Canvas + Panel */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* SVG canvas */}
        <svg ref={svgRef} style={{ flex: 1, background: "#f1f5f9" }}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onClick={() => setSelected(null)}>

          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#64748b" />
            </marker>
          </defs>

          {/* Edges */}
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
                <path d={d} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: "pointer" }} />
                <path d={d} fill="none" stroke={isSel ? "#3b82f6" : "#64748b"}
                  strokeWidth={isSel ? 2.5 : 1.5} markerEnd="url(#arrow)" />
                {edge.label && (
                  <text x={(a1.x + a2.x) / 2} y={(a1.y + a2.y) / 2 - 7}
                    textAnchor="middle" fontSize={11} fill="#475569"
                    style={{ pointerEvents: "none", userSelect: "none" }}>{edge.label}</text>
                )}
              </g>
            );
          })}

          {/* In-progress connection */}
          {connecting && (() => {
            const fn = curNodes.find(n => n.id === connecting.fromId);
            if (!fn) return null;
            const a = getAnchor(fn, connecting.fromSide);
            return <line x1={a.x} y1={a.y} x2={connecting.curX} y2={connecting.curY}
              stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5,3"
              style={{ pointerEvents: "none" }} />;
          })()}

          {/* Nodes */}
          {curNodes.map(node => {
            const w = node.width || 180, h = node.height || 70;
            const s = NODE_STYLES[node.type] || NODE_STYLES.process;
            const isSel = selected?.type === "node" && selected.id === node.id;
            return (
              <g key={node.id}
                onPointerDown={e => onNodePointerDown(e, node.id)}
                onPointerMove={e => onNodePointerMove(e, node.id)}
                onPointerUp={e => onNodePointerUp(e, node.id)}
                onClick={e => { e.stopPropagation(); setSelected({ type: "node", id: node.id }); }}
                style={{ cursor: dragging?.nodeId === node.id ? "grabbing" : "grab" }}>

                {node.type === "decision" ? (
                  <polygon
                    points={`${node.x + w/2},${node.y} ${node.x + w},${node.y + h/2} ${node.x + w/2},${node.y + h} ${node.x},${node.y + h/2}`}
                    fill="#fffbeb" stroke={isSel ? "#3b82f6" : s.border} strokeWidth={isSel ? 2.5 : 1.5} />
                ) : (
                  <>
                    <rect x={node.x} y={node.y} width={w} height={h} rx={8}
                      fill="#fff" stroke={isSel ? "#3b82f6" : s.border} strokeWidth={isSel ? 2.5 : 1.5} />
                    <rect x={node.x} y={node.y} width={w} height={26} rx={8}
                      fill={s.header} style={{ pointerEvents: "none" }} />
                    <rect x={node.x} y={node.y + 18} width={w} height={8}
                      fill={s.header} style={{ pointerEvents: "none" }} />
                  </>
                )}

                {/* Label */}
                <text x={node.x + w / 2}
                  y={node.type === "decision" ? node.y + h / 2 + 5 : node.y + 17}
                  textAnchor="middle" fontSize={12} fontWeight={600}
                  fill={node.type === "decision" ? "#92400e" : "#fff"}
                  style={{ pointerEvents: "none", userSelect: "none" }}>
                  {node.label}
                </text>

                {node.type !== "decision" && (
                  <text x={node.x + w / 2} y={node.y + 50}
                    textAnchor="middle" fontSize={11} fill="#94a3b8"
                    style={{ pointerEvents: "none", userSelect: "none" }}>
                    {node.type}
                  </text>
                )}

                {/* Connection handles */}
                {SIDES.map(side => {
                  const a = getAnchor(node, side);
                  return (
                    <circle key={side} cx={a.x} cy={a.y} r={5}
                      fill="#fff" stroke="#6366f1" strokeWidth={1.5}
                      data-handle="true"
                      style={{ cursor: "crosshair" }}
                      onPointerDown={e => { e.stopPropagation(); onHandlePointerDown(e, node.id, side); }} />
                  );
                })}
              </g>
            );
          })}
        </svg>

        {/* Side panel */}
        <div style={{ width: 270, background: "#fff", borderLeft: "1px solid #e2e8f0",
          overflowY: "auto", padding: "16px 14px", fontSize: 13, color: "#1e293b", flexShrink: 0 }}>

          {!selected && (
            <div style={{ color: "#94a3b8", marginTop: 48, textAlign: "center", lineHeight: 1.6 }}>
              Click a node or arrow<br />to view its properties
            </div>
          )}

          {selNode && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>Node Properties</div>

              <label style={{ display: "block", marginBottom: 3, color: "#64748b", fontSize: 12 }}>Label</label>
              <input value={selNode.label} onChange={e => updateNode("label", e.target.value)} style={inputStyle} />

              <label style={{ display: "block", marginBottom: 3, color: "#64748b", fontSize: 12 }}>Type</label>
              <select value={selNode.type} onChange={e => updateNode("type", e.target.value)} style={selectStyle}>
                <option value="process">Process</option>
                <option value="decision">Decision</option>
                <option value="start">Start</option>
                <option value="end">End</option>
              </select>

              {selNode.type === "decision" && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: "#475569", fontSize: 13 }}>Branches</div>
                  {selNode.branches.map(b => (
                    <div key={b.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0",
                      borderRadius: 6, padding: "8px 8px 6px", marginBottom: 8 }}>
                      <div style={{ display: "flex", gap: 5, marginBottom: 5 }}>
                        <input placeholder="Label (e.g. Yes)" value={b.label}
                          onChange={e => updateBranch(b.id, "label", e.target.value)}
                          style={{ flex: 1, padding: "3px 6px", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 12 }} />
                        <button onClick={() => removeBranch(b.id)}
                          style={{ padding: "2px 8px", background: "#fee2e2", border: "none",
                            borderRadius: 4, cursor: "pointer", color: "#ef4444", fontSize: 12 }}>✕</button>
                      </div>
                      <input placeholder="Condition / logic (e.g. amount > 1000)" value={b.logic}
                        onChange={e => updateBranch(b.id, "logic", e.target.value)}
                        style={{ width: "100%", padding: "3px 6px", border: "1px solid #cbd5e1",
                          borderRadius: 4, fontSize: 11, boxSizing: "border-box", color: "#475569" }} />
                    </div>
                  ))}
                  <button onClick={addBranch}
                    style={{ width: "100%", padding: "5px 0", background: "#f1f5f9",
                      border: "1px dashed #94a3b8", borderRadius: 6, cursor: "pointer",
                      color: "#475569", fontSize: 12, marginTop: 2 }}>
                    + Add Branch
                  </button>
                </div>
              )}
            </div>
          )}

          {selEdge && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>Arrow Properties</div>

              <label style={{ display: "block", marginBottom: 3, color: "#64748b", fontSize: 12 }}>Label</label>
              <input value={selEdge.label} onChange={e => updateEdge("label", e.target.value)} style={inputStyle} />

              <label style={{ display: "block", marginBottom: 3, color: "#64748b", fontSize: 12 }}>From side</label>
              <select value={selEdge.fromSide} onChange={e => updateEdge("fromSide", e.target.value)} style={selectStyle}>
                {SIDES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <label style={{ display: "block", marginBottom: 3, color: "#64748b", fontSize: 12 }}>To side</label>
              <select value={selEdge.toSide} onChange={e => updateEdge("toSide", e.target.value)} style={selectStyle}>
                {SIDES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
