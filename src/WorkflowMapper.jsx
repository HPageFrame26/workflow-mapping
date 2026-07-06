import React, { useState, useRef, useEffect, useCallback } from "react";

/* ─── Icons (inline SVG) ─────────────────────────────────────── */
const Icon = ({ d, size = 16, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);
const PlusIcon   = () => <Icon d="M12 5v14M5 12h14" />;
const TrashIcon  = () => <Icon d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />;
const SaveIcon   = () => <Icon d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8" />;
const DownloadIcon = () => <Icon d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />;
const UploadIcon = () => <Icon d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />;

/* ─── Helpers ────────────────────────────────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 9);

const NODE_W = 180;
const NODE_H = 72;

const ANCHORS = ["top", "right", "bottom", "left"];

function anchorPoint(node, side) {
  const cx = node.x + NODE_W / 2;
  const cy = node.y + NODE_H / 2;
  switch (side) {
    case "top":    return { x: cx,           y: node.y };
    case "bottom": return { x: cx,           y: node.y + NODE_H };
    case "left":   return { x: node.x,       y: cy };
    case "right":  return { x: node.x + NODE_W, y: cy };
    default:       return { x: cx,           y: cy };
  }
}

function bestAnchorPair(src, tgt) {
  let best = { srcSide: "right", tgtSide: "left", dist: Infinity };
  for (const ss of ANCHORS) {
    for (const ts of ANCHORS) {
      const sp = anchorPoint(src, ss);
      const tp = anchorPoint(tgt, ts);
      const d = Math.hypot(sp.x - tp.x, sp.y - tp.y);
      if (d < best.dist) best = { srcSide: ss, tgtSide: ts, dist: d };
    }
  }
  return best;
}

function cubicPath(p1, p2, s1, s2) {
  const dx = Math.abs(p2.x - p1.x) * 0.5;
  const dy = Math.abs(p2.y - p1.y) * 0.5;
  const ctrl = (side) => {
    switch (side) {
      case "right":  return [dx, 0];
      case "left":   return [-dx, 0];
      case "bottom": return [0, dy];
      case "top":    return [0, -dy];
      default:       return [0, 0];
    }
  };
  const [c1x, c1y] = ctrl(s1);
  const [c2x, c2y] = ctrl(s2);
  return `M ${p1.x} ${p1.y} C ${p1.x + c1x} ${p1.y + c1y}, ${p2.x - c2x} ${p2.y - c2y}, ${p2.x} ${p2.y}`;
}

const COLORS = {
  process:  { bg: "#e0f2fe", border: "#0ea5e9", header: "#0284c7", text: "#0c4a6e" },
  decision: { bg: "#fef3c7", border: "#f59e0b", header: "#d97706", text: "#78350f" },
  start:    { bg: "#dcfce7", border: "#22c55e", header: "#16a34a", text: "#14532d" },
  end:      { bg: "#fee2e2", border: "#ef4444", header: "#dc2626", text: "#7f1d1d" },
};

const NODE_TYPES = ["process", "decision", "start", "end"];

const DEFAULT_NODES = [
  { id: "n1", type: "process",  label: "Start Process", x: 80,  y: 160, branches: [] },
  { id: "n2", type: "decision", label: "Check Condition?", x: 340, y: 140, branches: [
    { id: "b1", label: "Yes", logic: "Condition is met" },
    { id: "b2", label: "No",  logic: "Condition not met" },
  ]},
  { id: "n3", type: "process",  label: "Handle Yes", x: 600, y: 80,  branches: [] },
  { id: "n4", type: "process",  label: "Handle No",  x: 600, y: 240, branches: [] },
];

const DEFAULT_EDGES = [
  { id: "e1", src: "n1", tgt: "n2", srcSide: "right", tgtSide: "left",  label: "" },
  { id: "e2", src: "n2", tgt: "n3", srcSide: "right", tgtSide: "left",  label: "Yes", branchId: "b1" },
  { id: "e3", src: "n2", tgt: "n4", srcSide: "bottom", tgtSide: "left", label: "No",  branchId: "b2" },
];

/* ─── Main Component ─────────────────────────────────────────── */
export default function WorkflowMapper() {
  const [nodes, setNodes] = useState(DEFAULT_NODES);
  const [edges, setEdges] = useState(DEFAULT_EDGES);
  const [selected, setSelected] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [drawing, setDrawing] = useState(null);
  const [showHandles, setShowHandles] = useState(null);
  const svgRef = useRef(null);
  const importRef = useRef(null);
  const dragging = useRef(null);

  const onNodeMouseDown = (e, id) => {
    if (e.target.classList.contains("anchor-dot")) return;
    e.stopPropagation();
    setSelected(id);
    setSelectedEdge(null);
    const node = nodes.find(n => n.id === id);
    dragging.current = { id, ox: e.clientX - node.x, oy: e.clientY - node.y };
  };

  useEffect(() => {
    const onMove = (e) => {
      if (dragging.current) {
        const { id, ox, oy } = dragging.current;
        setNodes(ns => ns.map(n => n.id === id ? { ...n, x: e.clientX - ox, y: e.clientY - oy } : n));
      }
      if (drawing) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) setDrawing(d => ({ ...d, mouseX: e.clientX - rect.left, mouseY: e.clientY - rect.top }));
      }
    };
    const onUp = () => { dragging.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [drawing]);

  const startDraw = (e, srcId, srcSide) => {
    e.stopPropagation();
    const rect = svgRef.current?.getBoundingClientRect();
    setDrawing({ srcId, srcSide, mouseX: e.clientX - rect.left, mouseY: e.clientY - rect.top });
  };

  const finishDraw = (e, tgtId) => {
    e.stopPropagation();
    if (!drawing || drawing.srcId === tgtId) { setDrawing(null); return; }
    const src = nodes.find(n => n.id === drawing.srcId);
    const tgt = nodes.find(n => n.id === tgtId);
    const { tgtSide } = bestAnchorPair(src, tgt);
    const srcNode = nodes.find(n => n.id === drawing.srcId);
    let label = "";
    let branchId = null;
    if (srcNode.type === "decision" && srcNode.branches.length > 0) {
      const pick = srcNode.branches[0];
      label = pick.label;
      branchId = pick.id;
    }
    setEdges(es => [...es, { id: uid(), src: drawing.srcId, tgt: tgtId, srcSide: drawing.srcSide, tgtSide, label, branchId }]);
    setDrawing(null);
  };

  const cancelDraw = () => setDrawing(null);

  const addNode = (type) => {
    const id = uid();
    setNodes(ns => [...ns, { id, type, label: type.charAt(0).toUpperCase() + type.slice(1) + " Node", x: 200 + Math.random() * 200, y: 150 + Math.random() * 150, branches: [] }]);
    setSelected(id);
  };

  const deleteNode = (id) => {
    setNodes(ns => ns.filter(n => n.id !== id));
    setEdges(es => es.filter(e => e.src !== id && e.tgt !== id));
    if (selected === id) setSelected(null);
  };

  const deleteEdge = (id) => {
    setEdges(es => es.filter(e => e.id !== id));
    if (selectedEdge === id) setSelectedEdge(null);
  };

  const updateNode = (id, field, value) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, [field]: value } : n));

  const addBranch = (nodeId) => {
    setNodes(ns => ns.map(n => n.id === nodeId
      ? { ...n, branches: [...n.branches, { id: uid(), label: "Branch", logic: "" }] }
      : n));
  };

  const updateBranch = (nodeId, branchId, field, value) => {
    setNodes(ns => ns.map(n => n.id === nodeId
      ? { ...n, branches: n.branches.map(b => b.id === branchId ? { ...b, [field]: value } : b) }
      : n));
  };

  const deleteBranch = (nodeId, branchId) => {
    setNodes(ns => ns.map(n => n.id === nodeId
      ? { ...n, branches: n.branches.filter(b => b.id !== branchId) }
      : n));
  };

  const updateEdge = (id, field, value) =>
    setEdges(es => es.map(e => e.id === id ? { ...e, [field]: value } : e));

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ nodes, edges }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "workflow.json"; a.click();
  };

  const importJSON = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { nodes: ns, edges: es } = JSON.parse(ev.target.result);
        setNodes(ns); setEdges(es); setSelected(null); setSelectedEdge(null);
      } catch { alert("Invalid workflow JSON"); }
    };
    reader.readAsText(file);
  };

  const savePNG = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const canvas = document.createElement("canvas");
    const bbox = svgEl.getBoundingClientRect();
    canvas.width = bbox.width * 2;
    canvas.height = bbox.height * 2;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    const svgData = serializer.serializeToString(svgEl);
    const img = new Image();
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, bbox.width, bbox.height);
      const a = document.createElement("a");
      a.download = "workflow.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const renderEdges = () => edges.map(edge => {
    const src = nodes.find(n => n.id === edge.src);
    const tgt = nodes.find(n => n.id === edge.tgt);
    if (!src || !tgt) return null;
    const p1 = anchorPoint(src, edge.srcSide);
    const p2 = anchorPoint(tgt, edge.tgtSide);
    const path = cubicPath(p1, p2, edge.srcSide, edge.tgtSide);
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    const isSelected = selectedEdge === edge.id;
    return (
      <g key={edge.id} onClick={(e) => { e.stopPropagation(); setSelectedEdge(edge.id); setSelected(null); }}>
        <path d={path} fill="none" stroke="transparent" strokeWidth={10} style={{ cursor: "pointer" }} />
        <defs>
          <marker id={`arrow-${edge.id}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={isSelected ? "#6366f1" : "#94a3b8"} />
          </marker>
        </defs>
        <path d={path} fill="none" stroke={isSelected ? "#6366f1" : "#94a3b8"} strokeWidth={isSelected ? 2.5 : 1.5} markerEnd={`url(#arrow-${edge.id})`} />
        {edge.label && (
          <foreignObject x={mx - 36} y={my - 12} width={72} height={24}>
            <div xmlns="http://www.w3.org/1999/xhtml" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 11, textAlign: "center", padding: "1px 4px", color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {edge.label}
            </div>
          </foreignObject>
        )}
      </g>
    );
  });

  const renderHandles = (node) => ANCHORS.map(side => {
    const pt = anchorPoint(node, side);
    return (
      <circle key={side} className="anchor-dot" cx={pt.x} cy={pt.y} r={6}
        fill="#6366f1" stroke="#fff" strokeWidth={2}
        style={{ cursor: "crosshair" }}
        onMouseDown={(e) => startDraw(e, node.id, side)} />
    );
  });

  const renderNodes = () => nodes.map(node => {
    const c = COLORS[node.type] || COLORS.process;
    const isSelected = selected === node.id;
    const isHovered = showHandles === node.id;
    const isDecision = node.type === "decision";
    return (
      <g key={node.id}
        onMouseEnter={() => setShowHandles(node.id)}
        onMouseLeave={() => setShowHandles(null)}
        onMouseDown={(e) => onNodeMouseDown(e, node.id)}
        onMouseUp={(e) => finishDraw(e, node.id)}
        style={{ cursor: "grab" }}>
        {isDecision ? (
          <polygon
            points={`${node.x + NODE_W / 2},${node.y} ${node.x + NODE_W},${node.y + NODE_H / 2} ${node.x + NODE_W / 2},${node.y + NODE_H} ${node.x},${node.y + NODE_H / 2}`}
            fill={c.bg} stroke={isSelected ? "#6366f1" : c.border} strokeWidth={isSelected ? 2.5 : 1.5} />
        ) : (
          <rect x={node.x} y={node.y} width={NODE_W} height={NODE_H} rx={8}
            fill={c.bg} stroke={isSelected ? "#6366f1" : c.border} strokeWidth={isSelected ? 2.5 : 1.5} />
        )}
        <foreignObject x={node.x + (isDecision ? 30 : 0)} y={node.y + (isDecision ? 20 : 0)}
          width={NODE_W - (isDecision ? 60 : 0)} height={NODE_H - (isDecision ? 30 : 0)}>
          <div xmlns="http://www.w3.org/1999/xhtml" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "4px 8px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: c.header, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{node.type}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: c.text, textAlign: "center", wordBreak: "break-word", lineHeight: 1.3 }}>{node.label}</div>
          </div>
        </foreignObject>
        {(isHovered || isSelected) && renderHandles(node)}
      </g>
    );
  });

  const renderDrawing = () => {
    if (!drawing) return null;
    const src = nodes.find(n => n.id === drawing.srcId);
    if (!src) return null;
    const p1 = anchorPoint(src, drawing.srcSide);
    return <line x1={p1.x} y1={p1.y} x2={drawing.mouseX} y2={drawing.mouseY}
      stroke="#6366f1" strokeWidth={1.5} strokeDasharray="6 3" />;
  };

  const selectedNode = nodes.find(n => n.id === selected);
  const selectedEdgeObj = edges.find(e => e.id === selectedEdge);
  const srcNodeOfEdge = selectedEdgeObj ? nodes.find(n => n.id === selectedEdgeObj.src) : null;

  const labelStyle = { display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: "#64748b", fontWeight: 500 };
  const inputStyle = { padding: "6px 8px", borderRadius: 5, border: "1px solid #e2e8f0", fontSize: 12, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit" };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Inter', sans-serif", background: "#f8fafc" }}>
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Toolbar */}
        <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {NODE_TYPES.map(t => (
            <button key={t} onClick={() => addNode(t)}
              style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${COLORS[t].border}`, background: COLORS[t].bg, color: COLORS[t].header, fontWeight: 600, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <PlusIcon /> {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ position: "absolute", top: 12, right: 12, zIndex: 10, display: "flex", gap: 8 }}>
          <button onClick={savePNG} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", color: "#334155", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <DownloadIcon /> Save as PNG
          </button>
          <button onClick={exportJSON} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", color: "#334155", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <SaveIcon /> Export JSON
          </button>
          <button onClick={() => importRef.current?.click()} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", color: "#334155", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <UploadIcon /> Import JSON
          </button>
          <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={importJSON} />
        </div>
        {/* SVG Canvas */}
        <svg ref={svgRef} width="100%" height="100%"
          onClick={() => { setSelected(null); setSelectedEdge(null); }}
          onMouseMove={(e) => {
            if (drawing) {
              const rect = svgRef.current?.getBoundingClientRect();
              setDrawing(d => ({ ...d, mouseX: e.clientX - rect.left, mouseY: e.clientY - rect.top }));
            }
          }}
          onMouseUp={cancelDraw}
          style={{ display: "block" }}>
          {renderEdges()}
          {renderNodes()}
          {renderDrawing()}
        </svg>
      </div>

      {/* Side panel */}
      <div style={{ width: 280, background: "#fff", borderLeft: "1px solid #e2e8f0", overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {!selectedNode && !selectedEdgeObj && (
          <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 40, textAlign: "center" }}>
            Click a node or edge to edit.<br /><br />
            Hover a node to reveal connection handles, then drag from any handle to another node to create an arrow.
          </div>
        )}

        {selectedNode && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>Edit Node</div>
            <label style={labelStyle}>Label
              <input value={selectedNode.label} onChange={e => updateNode(selectedNode.id, "label", e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>Type
              <select value={selectedNode.type} onChange={e => updateNode(selectedNode.id, "type", e.target.value)} style={inputStyle}>
                {NODE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </label>
            {selectedNode.type === "decision" && (
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, color: "#475569", marginBottom: 6 }}>Branches / Logic</div>
                {selectedNode.branches.map(branch => (
                  <div key={branch.id} style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 6, padding: 8, marginBottom: 6 }}>
                    <input placeholder="Branch label (e.g. Yes / No)" value={branch.label}
                      onChange={e => updateBranch(selectedNode.id, branch.id, "label", e.target.value)}
                      style={{ ...inputStyle, marginBottom: 4 }} />
                    <textarea placeholder="Logic / condition (e.g. If amount > 1000)" value={branch.logic}
                      onChange={e => updateBranch(selectedNode.id, branch.id, "logic", e.target.value)}
                      rows={2} style={{ ...inputStyle, resize: "vertical" }} />
                    <button onClick={() => deleteBranch(selectedNode.id, branch.id)}
                      style={{ fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 2 }}>
                      Remove branch
                    </button>
                  </div>
                ))}
                <button onClick={() => addBranch(selectedNode.id)}
                  style={{ fontSize: 12, color: "#d97706", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 5, padding: "4px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  <PlusIcon /> Add Branch
                </button>
              </div>
            )}
            <button onClick={() => deleteNode(selectedNode.id)}
              style={{ marginTop: 4, padding: "7px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fee2e2", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <TrashIcon /> Delete Node
            </button>
          </div>
        )}

        {selectedEdgeObj && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>Edit Arrow</div>
            <label style={labelStyle}>Label
              <input value={selectedEdgeObj.label} onChange={e => updateEdge(selectedEdgeObj.id, "label", e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>Source side
              <select value={selectedEdgeObj.srcSide} onChange={e => updateEdge(selectedEdgeObj.id, "srcSide", e.target.value)} style={inputStyle}>
                {ANCHORS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={labelStyle}>Target side
              <select value={selectedEdgeObj.tgtSide} onChange={e => updateEdge(selectedEdgeObj.id, "tgtSide", e.target.value)} style={inputStyle}>
                {ANCHORS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            {srcNodeOfEdge?.type === "decision" && srcNodeOfEdge.branches.length > 0 && (
              <label style={labelStyle}>Branch
                <select value={selectedEdgeObj.branchId || ""} onChange={e => {
                  const branch = srcNodeOfEdge.branches.find(b => b.id === e.target.value);
                  updateEdge(selectedEdgeObj.id, "branchId", e.target.value);
                  if (branch) updateEdge(selectedEdgeObj.id, "label", branch.label);
                }} style={inputStyle}>
                  <option value="">None</option>
                  {srcNodeOfEdge.branches.map(b => <option key={b.id} value={b.id}>{b.label} — {b.logic}</option>)}
                </select>
              </label>
            )}
            <button onClick={() => deleteEdge(selectedEdgeObj.id)}
              style={{ marginTop: 4, padding: "7px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fee2e2", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <TrashIcon /> Delete Arrow
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
