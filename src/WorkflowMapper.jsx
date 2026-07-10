import React, { useState, useRef, useEffect } from "react";

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
  // FRAME gold is the interactive accent (handles, focus, connectors, selected edges)
  primary:   "#b8902e",
  primarySoft:"#f5eed6",
  gold:      "#b8902e",
  goldDeep:  "#8f6e1f",
  handle:    "#6b7688",
  toolbar:   "#161b26",
  toolbarTop:"#1c2230",
  toolbarBtn:"#242c3b",
  danger:    "#e5484d",
};

const GRID = 26;
const MIN_W = 120;
const MIN_H = 56;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2.5;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const snapV = (v) => Math.round(v / GRID) * GRID;

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

// Distance-scaled bezier so long / back-tracking edges bow around nodes.
function curvePath(x1, y1, x2, y2, fromSide, toSide) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const off = clamp(dist * 0.42, 44, 160);
  let c1x = x1, c1y = y1, c2x = x2, c2y = y2;
  if (fromSide === "right")  c1x += off;
  if (fromSide === "left")   c1x -= off;
  if (fromSide === "bottom") c1y += off;
  if (fromSide === "top")    c1y -= off;
  if (toSide === "left")    c2x -= off;
  if (toSide === "right")   c2x += off;
  if (toSide === "top")     c2y -= off;
  if (toSide === "bottom")  c2y += off;
  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}

// --- Text wrapping: reflow label to fit width (never splits words) ---
function wrapLabel(text, width, fontPx = 13.5, pad = 36) {
  const charW = fontPx * 0.58;
  const maxChars = Math.max(1, Math.floor((width - pad) / charW));
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const cand = line ? line + " " + word : word;
    if (cand.length <= maxChars) {
      line = cand;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

// --- Simple left-to-right layered auto-layout ---
function autoLayout(nodesArr, edgesArr) {
  if (!nodesArr.length) return nodesArr;
  const byId = Object.fromEntries(nodesArr.map(n => [n.id, n]));
  const indeg = {}, adj = {};
  nodesArr.forEach(n => { indeg[n.id] = 0; adj[n.id] = []; });
  edgesArr.forEach(e => {
    if (byId[e.from] && byId[e.to]) { adj[e.from].push(e.to); indeg[e.to] += 1; }
  });
  const layer = {};
  const roots = nodesArr.filter(n => indeg[n.id] === 0).map(n => n.id);
  roots.forEach(id => { layer[id] = 0; });
  const indegCopy = { ...indeg };
  const work = [...roots];
  let guard = 0;
  while (work.length && guard < 10000) {
    guard += 1;
    const id = work.shift();
    adj[id].forEach(t => {
      layer[t] = Math.max(layer[t] ?? 0, (layer[id] ?? 0) + 1);
      indegCopy[t] -= 1;
      if (indegCopy[t] === 0) work.push(t);
    });
  }
  nodesArr.forEach(n => { if (layer[n.id] === undefined) layer[n.id] = 0; });
  const layers = {};
  nodesArr.forEach(n => { (layers[layer[n.id]] ||= []).push(n); });
  const COLW = 10 * GRID, ROWH = 5 * GRID, X0 = 3 * GRID, Y0 = 3 * GRID;
  const out = nodesArr.map(n => ({ ...n }));
  const outById = Object.fromEntries(out.map(n => [n.id, n]));
  Object.keys(layers).map(Number).sort((a, b) => a - b).forEach(l => {
    layers[l].forEach((n, i) => {
      outById[n.id].x = X0 + l * COLW;
      outById[n.id].y = Y0 + i * ROWH;
    });
  });
  return out;
}

const NODE_STYLES = {
  process:  { header: "#4f46e5", border: "#c7cbf5", tint: "#f3f4fe", glyph: "#4f46e5" },
  decision: { header: "#d97706", border: "#f4d9a8", tint: "#fffaf0", glyph: "#b45309" },
  start:    { header: "#0d9488", border: "#b6e5df", tint: "#f0fbf9", glyph: "#0d9488" },
  end:      { header: "#e5484d", border: "#f6c8ca", tint: "#fef3f3", glyph: "#e5484d" },
};
const TYPES = ["process", "decision", "start", "end"];

export default function WorkflowMapper() {
  const [view, setView] = useState("current");
  const [nodes, setNodes] = useState({
    current: [
      { id: "1", x: 80,  y: 120, label: "Start",    type: "start",    branches: [], width: 180, height: 70, description: "" },
      { id: "2", x: 340, y: 120, label: "Process A", type: "process",  branches: [], width: 180, height: 70, description: "" },
      { id: "3", x: 600, y: 120, label: "Check",     type: "decision", branches: [{ id: "b1", label: "Yes" }, { id: "b2", label: "No" }], width: 180, height: 70, description: "" },
      { id: "4", x: 600, y: 280, label: "End",       type: "end",      branches: [], width: 180, height: 70, description: "" },
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

  const [selectedNodes, setSelectedNodes] = useState([]);
  const [selectedEdge, setSelectedEdge]   = useState(null);

  const [dragging, setDragging]     = useState(null);
  const [resizing, setResizing]     = useState(null);
  const [connecting, setConnecting] = useState(null);
  const [marquee, setMarquee]       = useState(null);
  const [panning, setPanning]       = useState(null);

  const [editing, setEditing]       = useState(null);   // { kind:'node'|'edge', id }
  const [notesFor, setNotesFor]     = useState(null);   // node id whose notes are open
  const [helpOpen, setHelpOpen]     = useState(false);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan]   = useState({ x: 0, y: 0 });
  const [snapOn, setSnapOn]     = useState(true);
  const [spaceDown, setSpaceDown] = useState(false);
  const [svgSize, setSvgSize]   = useState({ w: 900, h: 640 });

  const [past, setPast]     = useState([]);
  const [future, setFuture] = useState([]);

  const svgRef      = useRef(null);
  const wrapRef     = useRef(null);
  const nodeCounter = useRef(10);
  const edgeCounter = useRef(10);
  const movedRef    = useRef(false);
  const lastEditRef = useRef({ key: null, t: 0 });

  const nodesRef = useRef(nodes);   nodesRef.current = nodes;
  const edgesRef = useRef(edges);   edgesRef.current = edges;
  const zoomRef  = useRef(zoom);    zoomRef.current = zoom;
  const panRef   = useRef(pan);     panRef.current = pan;
  const viewRef  = useRef(view);    viewRef.current = view;

  const curNodes = nodes[view];
  const curEdges = edges[view];

  const setViewNodes = (fn) =>
    setNodes(prev => ({ ...prev, [view]: typeof fn === "function" ? fn(prev[view]) : fn }));
  const setViewEdges = (fn) =>
    setEdges(prev => ({ ...prev, [view]: typeof fn === "function" ? fn(prev[view]) : fn }));

  // --- History ---
  const snapshot = () => {
    setPast(p => [...p.slice(-59), { nodes: nodesRef.current, edges: edgesRef.current }]);
    setFuture([]);
  };
  const snapshotEdit = (key) => {
    const now = Date.now();
    if (lastEditRef.current.key === key && now - lastEditRef.current.t < 800) {
      lastEditRef.current.t = now; return;
    }
    lastEditRef.current = { key, t: now };
    snapshot();
  };
  const clearSelection = () => { setSelectedNodes([]); setSelectedEdge(null); setNotesFor(null); };
  const undo = () => {
    setPast(p => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setFuture(f => [{ nodes: nodesRef.current, edges: edgesRef.current }, ...f].slice(0, 60));
      setNodes(prev.nodes); setEdges(prev.edges);
      clearSelection(); setEditing(null);
      return p.slice(0, -1);
    });
  };
  const redo = () => {
    setFuture(f => {
      if (!f.length) return f;
      const next = f[0];
      setPast(p => [...p, { nodes: nodesRef.current, edges: edgesRef.current }].slice(-60));
      setNodes(next.nodes); setEdges(next.edges);
      clearSelection(); setEditing(null);
      return f.slice(1);
    });
  };

  // --- screen <-> canvas ---
  const toCanvas = (clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panRef.current.x) / zoomRef.current,
      y: (clientY - rect.top  - panRef.current.y) / zoomRef.current,
    };
  };
  const screenRect = (n) => ({
    x: n.x * zoom + pan.x,
    y: n.y * zoom + pan.y,
    w: (n.width || 180) * zoom,
    h: (n.height || 70) * zoom,
  });

  // -- Node pointer down (select + drag, multi-aware) --
  const onNodePointerDown = (e, nodeId) => {
    if (e.target.dataset.handle) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    movedRef.current = false;

    if (e.shiftKey) {
      setSelectedEdge(null);
      setSelectedNodes(prev =>
        prev.includes(nodeId) ? prev.filter(i => i !== nodeId) : [...prev, nodeId]);
      return;
    }
    setSelectedEdge(null);
    const keepGroup = selectedNodes.length > 1 && selectedNodes.includes(nodeId);
    const ids = keepGroup ? selectedNodes : [nodeId];
    if (!keepGroup) setSelectedNodes([nodeId]);

    const start = toCanvas(e.clientX, e.clientY);
    const initial = {};
    const nodesNow = nodesRef.current[viewRef.current];
    ids.forEach(id => {
      const n = nodesNow.find(x => x.id === id);
      if (n) initial[id] = { x: n.x, y: n.y };
    });
    setDragging({ grabId: nodeId, initial, start });
  };

  const onNodePointerMove = (e, nodeId) => {
    if (resizing && resizing.nodeId === nodeId) {
      e.preventDefault();
      if (!movedRef.current) { movedRef.current = true; snapshot(); }
      const p = toCanvas(e.clientX, e.clientY);
      setViewNodes(prev => prev.map(n => {
        if (n.id !== nodeId) return n;
        let w = p.x - n.x, h = p.y - n.y;
        if (snapOn) { w = snapV(w); h = snapV(h); }
        return { ...n, width: Math.max(MIN_W, w), height: Math.max(MIN_H, h) };
      }));
      return;
    }
    if (!dragging || dragging.grabId !== nodeId) return;
    e.preventDefault();
    if (!movedRef.current) { movedRef.current = true; snapshot(); }
    const p = toCanvas(e.clientX, e.clientY);
    const gi = dragging.initial[dragging.grabId];
    const rawX = gi.x + (p.x - dragging.start.x);
    const rawY = gi.y + (p.y - dragging.start.y);
    const gx = snapOn ? snapV(rawX) : rawX;
    const gy = snapOn ? snapV(rawY) : rawY;
    const edx = gx - gi.x, edy = gy - gi.y;
    setViewNodes(prev => prev.map(n =>
      dragging.initial[n.id]
        ? { ...n, x: dragging.initial[n.id].x + edx, y: dragging.initial[n.id].y + edy }
        : n));
  };

  const onNodePointerUp = (e, nodeId) => {
    if (resizing && resizing.nodeId === nodeId) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setResizing(null); return;
    }
    if (!dragging || dragging.grabId !== nodeId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (!movedRef.current && !e.shiftKey) setSelectedNodes([nodeId]);
    setDragging(null);
  };

  const onNodeDoubleClick = (e, nodeId) => {
    e.stopPropagation();
    setDragging(null);
    setSelectedEdge(null);
    setSelectedNodes([nodeId]);
    setEditing({ kind: "node", id: nodeId });
  };

  const onResizePointerDown = (e, nodeId) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    movedRef.current = false;
    setSelectedEdge(null);
    setSelectedNodes([nodeId]);
    setResizing({ nodeId });
  };

  const onHandlePointerDown = (e, nodeId, side) => {
    e.stopPropagation();
    try { svgRef.current.setPointerCapture(e.pointerId); } catch (_) {}
    const p = toCanvas(e.clientX, e.clientY);
    setConnecting({ fromId: nodeId, fromSide: side, curX: p.x, curY: p.y });
  };

  // -- SVG background --
  const onSvgPointerDown = (e) => {
    try { svgRef.current.setPointerCapture(e.pointerId); } catch (_) {}
    setHelpOpen(false);
    if (e.button === 1 || spaceDown) {
      setPanning({ startX: e.clientX, startY: e.clientY, orig: panRef.current });
      return;
    }
    const p = toCanvas(e.clientX, e.clientY);
    if (!e.shiftKey) clearSelection();
    setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y, additive: e.shiftKey, base: e.shiftKey ? selectedNodes : [] });
  };
  const onSvgPointerMove = (e) => {
    if (panning) {
      setPan({ x: panning.orig.x + (e.clientX - panning.startX), y: panning.orig.y + (e.clientY - panning.startY) });
      return;
    }
    if (marquee) {
      const p = toCanvas(e.clientX, e.clientY);
      setMarquee(m => ({ ...m, x1: p.x, y1: p.y }));
      return;
    }
    if (connecting) {
      const p = toCanvas(e.clientX, e.clientY);
      setConnecting(prev => ({ ...prev, curX: p.x, curY: p.y }));
    }
  };
  const onSvgPointerUp = (e) => {
    try { svgRef.current.releasePointerCapture(e.pointerId); } catch (_) {}
    if (panning) { setPanning(null); return; }
    if (marquee) {
      const x0 = Math.min(marquee.x0, marquee.x1), x1 = Math.max(marquee.x0, marquee.x1);
      const y0 = Math.min(marquee.y0, marquee.y1), y1 = Math.max(marquee.y0, marquee.y1);
      const moved = Math.abs(marquee.x1 - marquee.x0) > 3 || Math.abs(marquee.y1 - marquee.y0) > 3;
      if (moved) {
        const hit = curNodes.filter(n => {
          const w = n.width || 180, h = n.height || 70;
          return n.x < x1 && n.x + w > x0 && n.y < y1 && n.y + h > y0;
        }).map(n => n.id);
        setSelectedNodes(marquee.additive ? Array.from(new Set([...marquee.base, ...hit])) : hit);
      }
      setMarquee(null);
      return;
    }
    if (connecting) {
      const mx = connecting.curX, my = connecting.curY;
      const target = curNodes.find(n =>
        n.id !== connecting.fromId &&
        mx >= n.x && mx <= n.x + (n.width || 180) &&
        my >= n.y && my <= n.y + (n.height || 70)
      );
      if (target) {
        const [, toSide] = bestSides(curNodes.find(n => n.id === connecting.fromId), target);
        snapshot();
        edgeCounter.current += 1;
        setViewEdges(prev => [...prev, {
          id: `e${edgeCounter.current}`, from: connecting.fromId, to: target.id,
          fromSide: connecting.fromSide, toSide, label: "",
        }]);
      }
      setConnecting(null);
    }
  };

  // -- Add / delete / layout --
  const addNode = (type) => {
    snapshot();
    nodeCounter.current += 1;
    const id = `n${nodeCounter.current}-${Date.now().toString(36)}`;
    const cx = (svgSize.w / 2 - panRef.current.x) / zoomRef.current;
    const cy = (svgSize.h / 2 - panRef.current.y) / zoomRef.current;
    const jitter = (Math.random() - 0.5) * 60;
    let x = cx - 90 + jitter, y = cy - 35 + jitter;
    if (snapOn) { x = snapV(x); y = snapV(y); }
    setViewNodes(prev => [...prev, {
      id, x, y,
      label: type.charAt(0).toUpperCase() + type.slice(1),
      type,
      branches: type === "decision" ? [{ id: "b1", label: "Yes" }, { id: "b2", label: "No" }] : [],
      width: 180, height: 70, description: "",
    }]);
    setSelectedEdge(null);
    setSelectedNodes([id]);
  };
  const deleteSelected = () => {
    if (selectedEdge) {
      snapshot();
      setViewEdges(prev => prev.filter(e => e.id !== selectedEdge));
      setSelectedEdge(null); setEditing(null);
      return;
    }
    if (selectedNodes.length) {
      snapshot();
      const set = new Set(selectedNodes);
      setViewNodes(prev => prev.filter(n => !set.has(n.id)));
      setViewEdges(prev => prev.filter(e => !set.has(e.from) && !set.has(e.to)));
      setSelectedNodes([]); setNotesFor(null); setEditing(null);
    }
  };
  const runAutoLayout = () => {
    if (!curNodes.length) return;
    snapshot();
    setViewNodes(prev => autoLayout(prev, edgesRef.current[viewRef.current]));
    setTimeout(fitView, 0);
  };

  // -- View controls --
  const zoomBy = (factor) => {
    const cx = svgSize.w / 2, cy = svgSize.h / 2;
    const z = zoomRef.current;
    const nz = clamp(z * factor, ZOOM_MIN, ZOOM_MAX);
    const p = panRef.current;
    setZoom(nz);
    setPan({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) });
  };
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const fitView = () => {
    const ns = nodesRef.current[viewRef.current];
    if (!ns.length) { resetView(); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ns.forEach(n => {
      const w = n.width || 180, h = n.height || 70;
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w); maxY = Math.max(maxY, n.y + h);
    });
    const pad = 60;
    const cw = (maxX - minX) + pad * 2, ch = (maxY - minY) + pad * 2;
    const z = clamp(Math.min(svgSize.w / cw, svgSize.h / ch), ZOOM_MIN, ZOOM_MAX);
    setZoom(z);
    setPan({ x: (svgSize.w - cw * z) / 2 - (minX - pad) * z, y: (svgSize.h - ch * z) / 2 - (minY - pad) * z });
  };

  // -- Export / import --
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
        snapshot();
        setViewNodes(n); setViewEdges(ed);
        clearSelection();
        setTimeout(fitView, 0);
      } catch { alert("Invalid JSON"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // -- Selection derivations --
  const selNode = (!selectedEdge && selectedNodes.length === 1)
    ? curNodes.find(n => n.id === selectedNodes[0]) : null;
  const selEdge = selectedEdge ? curEdges.find(e => e.id === selectedEdge) : null;
  const multiCount = (!selectedEdge && selectedNodes.length > 1) ? selectedNodes.length : 0;

  const updateNode = (field, val) => {
    snapshotEdit(`node-${field}-${selNode.id}`);
    setViewNodes(prev => prev.map(n => n.id === selNode.id ? { ...n, [field]: val } : n));
  };
  const updateNodeById = (id, field, val) => {
    snapshotEdit(`node-${field}-${id}`);
    setViewNodes(prev => prev.map(n => n.id === id ? { ...n, [field]: val } : n));
  };
  const updateEdgeById = (id, field, val) => {
    snapshotEdit(`edge-${field}-${id}`);
    setViewEdges(prev => prev.map(e => e.id === id ? { ...e, [field]: val } : e));
  };
  const setNodeType = (type) => {
    snapshot();
    setViewNodes(prev => prev.map(n => {
      if (n.id !== selNode.id) return n;
      const next = { ...n, type };
      if (type === "decision" && (!n.branches || n.branches.length === 0)) {
        next.branches = [{ id: "b1", label: "Yes" }, { id: "b2", label: "No" }];
      }
      return next;
    }));
  };
  const updateBranch = (bid, val) => {
    snapshotEdit(`branch-${bid}`);
    setViewNodes(prev => prev.map(n => n.id === selNode.id
      ? { ...n, branches: n.branches.map(b => b.id === bid ? { ...b, label: val } : b) } : n));
  };
  const addBranch = () => {
    snapshot();
    setViewNodes(prev => prev.map(n => n.id === selNode.id
      ? { ...n, branches: [...n.branches, { id: `b${Date.now()}`, label: "Branch" }] } : n));
  };
  const removeBranch = (bid) => {
    snapshot();
    setViewNodes(prev => prev.map(n => n.id === selNode.id
      ? { ...n, branches: n.branches.filter(b => b.id !== bid) } : n));
  };

  const SIDES = ["top", "right", "bottom", "left"];

  // --- Global listeners ---
  const handlers = { undo, redo, deleteSelected, addNode, fitView, resetView, zoomBy, clearSelection, setConnecting, setMarquee, setEditing };
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const isTyping = (el) =>
      el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    const onKeyDown = (e) => {
      const h = handlersRef.current;
      const typing = isTyping(e.target);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z")) { e.preventDefault(); e.shiftKey ? h.redo() : h.undo(); return; }
      if (mod && (e.key === "y" || e.key === "Y")) { e.preventDefault(); h.redo(); return; }
      if (e.key === "Escape") { h.setEditing(null); h.clearSelection(); h.setConnecting(null); h.setMarquee(null); return; }
      if (typing || mod || e.altKey) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); h.deleteSelected(); return; }
      if (e.key === " ") { e.preventDefault(); setSpaceDown(true); return; }
      if (e.key === "=" || e.key === "+") { e.preventDefault(); h.zoomBy(1.15); return; }
      if (e.key === "-" || e.key === "_") { e.preventDefault(); h.zoomBy(1 / 1.15); return; }
      if (e.key === "0") { e.preventDefault(); h.resetView(); return; }
      if (e.key === "1") { e.preventDefault(); h.fitView(); return; }
      const keyMap = { p: "process", d: "decision", s: "start", e: "end" };
      const k = e.key.toLowerCase();
      if (keyMap[k]) { e.preventDefault(); h.addNode(keyMap[k]); }
    };
    const onKeyUp = (e) => { if (e.key === " ") setSpaceDown(false); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const z = zoomRef.current;
      const nz = clamp(z * factor, ZOOM_MIN, ZOOM_MAX);
      const p = panRef.current;
      setZoom(nz);
      setPan({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); setSvgSize({ w: r.width, h: r.height }); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // --- shared button styles ---
  const tbBtn = (bg, disabled) => ({
    padding: "6px 13px", borderRadius: 8, border: "none",
    cursor: disabled ? "default" : "pointer", background: bg, color: "#fff",
    fontSize: 12.5, fontWeight: 500, display: "inline-flex", alignItems: "center",
    gap: 6, whiteSpace: "nowrap", opacity: disabled ? 0.4 : 1,
  });
  const ovBtn = {
    width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`,
    background: "#fff", color: T.text, cursor: "pointer", fontSize: 15,
    display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
    boxShadow: "0 1px 3px rgba(20,27,38,.12)",
  };

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;
  const hasSelection = selectedEdge || selectedNodes.length > 0;
  const showOverlaysHidden = dragging || resizing || connecting || marquee || panning;

  // --- Minimap ---
  const MM_W = 172, MM_H = 116, MM_PAD = 40;
  const mmBounds = (() => {
    if (!curNodes.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    curNodes.forEach(n => {
      const w = n.width || 180, h = n.height || 70;
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w); maxY = Math.max(maxY, n.y + h);
    });
    const vx = -pan.x / zoom, vy = -pan.y / zoom;
    const vw = svgSize.w / zoom, vh = svgSize.h / zoom;
    minX = Math.min(minX, vx); minY = Math.min(minY, vy);
    maxX = Math.max(maxX, vx + vw); maxY = Math.max(maxY, vy + vh);
    const cw = (maxX - minX) + MM_PAD * 2, ch = (maxY - minY) + MM_PAD * 2;
    const s = Math.min(MM_W / cw, MM_H / ch);
    const ox = (MM_W - cw * s) / 2 - (minX - MM_PAD) * s;
    const oy = (MM_H - ch * s) / 2 - (minY - MM_PAD) * s;
    return { s, ox, oy };
  })();
  const mmMap = (x, y) => ({ x: x * mmBounds.s + mmBounds.ox, y: y * mmBounds.s + mmBounds.oy });
  const onMinimapClick = (e) => {
    if (!mmBounds) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left - mmBounds.ox) / mmBounds.s;
    const canvasY = (e.clientY - rect.top - mmBounds.oy) / mmBounds.s;
    setPan({ x: svgSize.w / 2 - canvasX * zoom, y: svgSize.h / 2 - canvasY * zoom });
  };

  const canvasCursor = panning ? "grabbing" : spaceDown ? "grab" : "default";

  // --- Floating node toolbar geometry ---
  let nodeBar = null;
  if (selNode && !showOverlaysHidden) {
    const r = screenRect(selNode);
    const cx = clamp(r.x + r.w / 2, 130, Math.max(140, svgSize.w - 130));
    const above = r.y > 118;
    nodeBar = {
      left: cx,
      top: above ? r.y - 10 : r.y + r.h + 10,
      transform: above ? "translate(-50%,-100%)" : "translate(-50%,0)",
    };
  }
  // Floating edge toolbar geometry
  let edgeBar = null;
  if (selEdge && !showOverlaysHidden) {
    const fn = curNodes.find(n => n.id === selEdge.from);
    const tn = curNodes.find(n => n.id === selEdge.to);
    if (fn && tn) {
      const a1 = getAnchor(fn, selEdge.fromSide), a2 = getAnchor(tn, selEdge.toSide);
      const mcx = (a1.x + a2.x) / 2, mcy = (a1.y + a2.y) / 2;
      edgeBar = { left: clamp(mcx * zoom + pan.x, 90, Math.max(100, svgSize.w - 90)), top: mcy * zoom + pan.y };
    }
  }
  // Inline editor geometry
  let editorBox = null;
  if (editing?.kind === "node") {
    const n = curNodes.find(x => x.id === editing.id);
    if (n) { const r = screenRect(n); editorBox = { r, node: n }; }
    else if (editing) { /* node gone */ }
  }
  let edgeEditor = null;
  if (editing?.kind === "edge") {
    const ed = curEdges.find(x => x.id === editing.id);
    const fn = ed && curNodes.find(n => n.id === ed.from);
    const tn = ed && curNodes.find(n => n.id === ed.to);
    if (ed && fn && tn) {
      const a1 = getAnchor(fn, ed.fromSide), a2 = getAnchor(tn, ed.toSide);
      edgeEditor = { ed, left: ((a1.x + a2.x) / 2) * zoom + pan.x, top: ((a1.y + a2.y) / 2) * zoom + pan.y };
    }
  }

  const swatch = (t, active) => ({
    width: 24, height: 24, borderRadius: 7, cursor: "pointer",
    border: active ? `2px solid ${NODE_STYLES[t].header}` : `1px solid ${T.border}`,
    background: active ? NODE_STYLES[t].tint : "#fff",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
  });
  const barIconBtn = (active) => ({
    height: 24, minWidth: 24, padding: "0 7px", borderRadius: 7, cursor: "pointer",
    border: `1px solid ${active ? T.gold : T.border}`, background: active ? T.primarySoft : "#fff",
    color: active ? T.goldDeep : T.textSoft, fontSize: 12, fontWeight: 600,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh",
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif", background: T.bg, color: T.text }}>

      <style>{`
        .wm-btn { transition: filter .15s, transform .05s, background .15s; }
        .wm-btn:hover { filter: brightness(1.08); }
        .wm-btn:active { transform: translateY(1px); }
        .wm-tab { transition: background .15s, color .15s; }
        .wm-node-shadow { filter: drop-shadow(0 4px 10px rgba(20,27,38,.10)); }
        .wm-handle { opacity: 0; transition: opacity .15s; }
        .wm-node-group:hover .wm-handle { opacity: 1; }
        .wm-handle.always { opacity: 1; }
        .wm-resize { opacity: 0; transition: opacity .15s; }
        .wm-node-group:hover .wm-resize { opacity: 1; }
        .wm-resize.always { opacity: 1; }
        .wm-ov:hover { background: ${T.bg}; }
        .wm-sw:hover { filter: brightness(.97); }
        .wm-fld:focus { outline: none; border-color: ${T.primary}; box-shadow: 0 0 0 3px ${T.primarySoft}; }
        .wm-brand {
          font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 21px;
          letter-spacing: .22em; text-transform: uppercase;
          background: linear-gradient(180deg,#f4e4ae 0%,#e5c56d 46%,#c69a3f 100%);
          -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
          color: #d9b458; padding-left: .22em; user-select: none;
        }
      `}</style>

      {/* ---- Top toolbar ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px",
        background: `linear-gradient(180deg,${T.toolbarTop},${T.toolbar})`, color: "#fff",
        flexShrink: 0, borderTop: `2px solid ${T.gold}`, flexWrap: "wrap",
        boxShadow: "0 2px 8px rgba(10,13,20,.35)" }}>

        <div style={{ display: "flex", alignItems: "baseline", gap: 11, marginRight: 6 }}>
          <span className="wm-brand">Frame</span>
          <span style={{ width: 1, height: 18, background: "rgba(255,255,255,.16)", alignSelf: "center" }} />
          <span style={{ fontSize: 12.5, fontWeight: 500, color: "#aeb7c6", letterSpacing: ".02em" }}>Workflow Mapper</span>
        </div>

        <div style={{ display: "flex", background: "#0e121b", borderRadius: 9, padding: 3, gap: 3 }}>
          {["current", "proposed"].map(v => (
            <button key={v} className="wm-tab" onClick={() => { setView(v); clearSelection(); setEditing(null); }}
              style={{ padding: "5px 15px", borderRadius: 7, border: "none", cursor: "pointer",
                background: view === v ? T.gold : "transparent",
                color: view === v ? "#1a1f2b" : "#9aa5b6", fontWeight: view === v ? 700 : 500, fontSize: 12.5 }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          <button className="wm-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" style={tbBtn(T.toolbarBtn, !canUndo)}>&#8630; Undo</button>
          <button className="wm-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" style={tbBtn(T.toolbarBtn, !canRedo)}>Redo &#8631;</button>
        </div>

        <span style={{ flex: 1 }} />

        <div style={{ display: "flex", gap: 6, paddingRight: 10, marginRight: 4, borderRight: "1px solid rgba(255,255,255,.10)" }}>
          {TYPES.map(t => (
            <button key={t} className="wm-btn" onClick={() => addNode(t)} title={`Add ${t} (${t[0].toUpperCase()})`}
              style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                background: T.toolbarBtn, color: "#fff", fontSize: 12, fontWeight: 500,
                display: "inline-flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: NODE_STYLES[t].header }} />
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <button className="wm-btn" onClick={runAutoLayout} style={tbBtn(T.toolbarBtn)}>Auto layout</button>
        <button className="wm-btn" onClick={() => setSnapOn(s => !s)} title="Toggle snap to grid" style={tbBtn(snapOn ? T.gold : T.toolbarBtn)}>
          <span style={{ color: snapOn ? "#1a1f2b" : "#fff" }}>Snap {snapOn ? "on" : "off"}</span>
        </button>
        <button className="wm-btn" onClick={exportSVG} style={tbBtn(T.toolbarBtn)}>Save SVG</button>
        <button className="wm-btn" onClick={exportJSON} style={tbBtn(T.toolbarBtn)}>Export JSON</button>
        <label className="wm-btn" style={{ ...tbBtn(T.toolbarBtn), cursor: "pointer" }}>
          Import JSON
          <input type="file" accept=".json" onChange={importJSON} style={{ display: "none" }} />
        </label>
        {hasSelection && (
          <button className="wm-btn" onClick={deleteSelected} style={tbBtn(T.danger)}>Delete</button>
        )}
      </div>

      {/* ---- Canvas row ---- */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div ref={wrapRef} style={{ position: "relative", flex: 1, overflow: "visible" }}>
          <svg ref={svgRef} width="100%" height="100%"
            style={{ background: T.canvas, display: "block", cursor: canvasCursor, touchAction: "none" }}
            onPointerDown={onSvgPointerDown} onPointerMove={onSvgPointerMove} onPointerUp={onSvgPointerUp}>

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

            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              <rect data-bg="true" x={-4000} y={-4000} width={8000} height={8000} fill="url(#grid)" />

              {/* Edges */}
              {curEdges.map(edge => {
                const fn = curNodes.find(n => n.id === edge.from);
                const tn = curNodes.find(n => n.id === edge.to);
                if (!fn || !tn) return null;
                const a1 = getAnchor(fn, edge.fromSide);
                const a2 = getAnchor(tn, edge.toSide);
                const d  = curvePath(a1.x, a1.y, a2.x, a2.y, edge.fromSide, edge.toSide);
                const isSel = selectedEdge === edge.id;
                return (
                  <g key={edge.id}
                    onPointerDown={e => { e.stopPropagation(); setSelectedEdge(edge.id); setSelectedNodes([]); }}
                    onDoubleClick={e => { e.stopPropagation(); setSelectedEdge(edge.id); setSelectedNodes([]); setEditing({ kind: "edge", id: edge.id }); }}>
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

              {/* live connection line */}
              {connecting && (() => {
                const fn = curNodes.find(n => n.id === connecting.fromId);
                if (!fn) return null;
                const a = getAnchor(fn, connecting.fromSide);
                return <line x1={a.x} y1={a.y} x2={connecting.curX} y2={connecting.curY}
                  stroke={T.handle} strokeWidth={2} strokeDasharray="5,4" strokeLinecap="round"
                  style={{ pointerEvents: "none" }} />;
              })()}

              {/* Nodes */}
              {curNodes.map(node => {
                const w = node.width || 180, h = node.height || 70;
                const s = NODE_STYLES[node.type] || NODE_STYLES.process;
                const lines = wrapLabel(node.label, w, 13.5, node.type === "decision" ? 40 : 46);
                const lineH = 17;
                const labelBlockH = lines.length * lineH;
                const isSel = selectedNodes.includes(node.id);
                const isSingle = isSel && selectedNodes.length === 1 && !selectedEdge;
                const isEditing = editing?.kind === "node" && editing.id === node.id;
                return (
                  <g key={node.id} className="wm-node-group"
                    onPointerDown={e => onNodePointerDown(e, node.id)}
                    onPointerMove={e => onNodePointerMove(e, node.id)}
                    onPointerUp={e => onNodePointerUp(e, node.id)}
                    onDoubleClick={e => onNodeDoubleClick(e, node.id)}
                    style={{ cursor: dragging?.grabId === node.id ? "grabbing" : "grab" }}>

                    {/* multi-select cue only (neutral, subtle) — single selection is shown by the floating toolbar */}
                    {isSel && multiCount > 0 && (
                      <rect x={node.x - 4} y={node.y - 4} width={w + 8} height={h + 8} rx={13}
                        fill="none" stroke={T.handle} strokeWidth={1.5} strokeOpacity={0.7}
                        style={{ pointerEvents: "none" }} />
                    )}

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

                    {node.description && node.type !== "decision" && (
                      <circle cx={node.x + w - 12} cy={node.y + 12} r={3.5} fill={s.glyph} style={{ pointerEvents: "none" }} />
                    )}

                    {/* Label (hidden while being edited inline) */}
                    {!isEditing && (node.type === "decision" ? (
                      <text x={node.x + w / 2} y={node.y + h / 2 - labelBlockH / 2 + lineH - 4}
                        textAnchor="middle" fontSize={13.5} fontWeight={700} fill={s.glyph}
                        style={{ pointerEvents: "none", userSelect: "none" }}>
                        {lines.map((ln, i) => (<tspan key={i} x={node.x + w / 2} dy={i === 0 ? 0 : lineH}>{ln}</tspan>))}
                      </text>
                    ) : (
                      <text x={node.x + 18} y={node.y + 28}
                        textAnchor="start" fontSize={13.5} fontWeight={700} fill={T.text}
                        style={{ pointerEvents: "none", userSelect: "none" }}>
                        {lines.map((ln, i) => (<tspan key={i} x={node.x + 18} dy={i === 0 ? 0 : lineH}>{ln}</tspan>))}
                      </text>
                    ))}

                    {!isEditing && node.type !== "decision" && (
                      <text x={node.x + 18} y={node.y + 28 + labelBlockH + 4}
                        textAnchor="start" fontSize={10.5} fontWeight={600} fill={s.glyph} letterSpacing=".05em"
                        style={{ pointerEvents: "none", userSelect: "none", textTransform: "uppercase" }}>
                        {node.type}
                      </text>
                    )}

                    {/* connection handles */}
                    {SIDES.map(side => {
                      const a = getAnchor(node, side);
                      return (
                        <circle key={side} className={`wm-handle${isSingle ? " always" : ""}`}
                          cx={a.x} cy={a.y} r={5.5} fill="#fff" stroke={T.handle} strokeWidth={2}
                          data-handle="true" style={{ cursor: "crosshair" }}
                          onPointerDown={e => { e.stopPropagation(); onHandlePointerDown(e, node.id, side); }} />
                      );
                    })}

                    {/* resize grip */}
                    <rect className={`wm-resize${isSingle ? " always" : ""}`}
                      x={node.x + w - 14} y={node.y + h - 14} width={14} height={14} rx={3}
                      fill="#fff" stroke={T.handle} strokeWidth={1.5} data-handle="true" style={{ cursor: "nwse-resize" }}
                      onPointerDown={e => onResizePointerDown(e, node.id)}
                      onPointerMove={e => onNodePointerMove(e, node.id)}
                      onPointerUp={e => onNodePointerUp(e, node.id)} />
                    <path className={`wm-resize${isSingle ? " always" : ""}`}
                      d={`M ${node.x + w - 10} ${node.y + h - 3} L ${node.x + w - 3} ${node.y + h - 10}
                         M ${node.x + w - 6} ${node.y + h - 3} L ${node.x + w - 3} ${node.y + h - 6}`}
                      stroke={T.handle} strokeWidth={1.2} fill="none" style={{ pointerEvents: "none" }} />
                  </g>
                );
              })}

              {/* marquee */}
              {marquee && (Math.abs(marquee.x1 - marquee.x0) > 2 || Math.abs(marquee.y1 - marquee.y0) > 2) && (
                <rect x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)}
                  width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)}
                  fill="rgba(107,118,136,.12)" stroke={T.handle} strokeWidth={1}
                  strokeDasharray="4,3" style={{ pointerEvents: "none" }} />
              )}
            </g>
          </svg>

          {/* ---- Inline node label editor ---- */}
          {editorBox && (
            <div style={{ position: "absolute", left: editorBox.r.x, top: editorBox.r.y,
              width: editorBox.r.w, height: editorBox.r.h, display: "flex", alignItems: "center",
              justifyContent: editorBox.node.type === "decision" ? "center" : "flex-start",
              padding: editorBox.node.type === "decision" ? "0 14px" : "0 16px", boxSizing: "border-box", zIndex: 30 }}
              onPointerDown={e => e.stopPropagation()}>
              <input autoFocus className="wm-fld" value={editorBox.node.label}
                onFocus={e => e.target.select()}
                onChange={e => updateNodeById(editorBox.node.id, "label", e.target.value)}
                onBlur={() => setEditing(null)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); e.currentTarget.blur(); }
                  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(null); }
                }}
                style={{ width: "100%", textAlign: editorBox.node.type === "decision" ? "center" : "left",
                  fontSize: 13.5, fontWeight: 700, color: T.text, border: `1px solid ${T.gold}`,
                  borderRadius: 6, padding: "4px 8px", boxSizing: "border-box", background: "#fff",
                  boxShadow: "0 0 0 3px " + T.primarySoft, fontFamily: "inherit" }} />
            </div>
          )}

          {/* ---- Inline edge label editor ---- */}
          {edgeEditor && (
            <div style={{ position: "absolute", left: edgeEditor.left, top: edgeEditor.top,
              transform: "translate(-50%,-50%)", zIndex: 30 }} onPointerDown={e => e.stopPropagation()}>
              <input autoFocus className="wm-fld" value={edgeEditor.ed.label} placeholder="Label…"
                onFocus={e => e.target.select()}
                onChange={e => updateEdgeById(edgeEditor.ed.id, "label", e.target.value)}
                onBlur={() => setEditing(null)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); e.currentTarget.blur(); }
                  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(null); }
                }}
                style={{ width: 130, textAlign: "center", fontSize: 12, fontWeight: 600, color: T.text,
                  border: `1px solid ${T.gold}`, borderRadius: 6, padding: "4px 8px", background: "#fff",
                  boxShadow: "0 2px 8px rgba(20,27,38,.16)", fontFamily: "inherit" }} />
            </div>
          )}

          {/* ---- Floating node toolbar ---- */}
          {nodeBar && selNode && (
            <div style={{ position: "absolute", left: nodeBar.left, top: nodeBar.top, transform: nodeBar.transform, zIndex: 25 }}
              onPointerDown={e => e.stopPropagation()}>
              <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 11,
                boxShadow: "0 6px 20px rgba(20,27,38,.16)", padding: 7, display: "flex", flexDirection: "column",
                gap: 7, marginBottom: nodeBar.transform.includes("-100%") ? 0 : 0 }}>

                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {TYPES.map(t => (
                    <button key={t} className="wm-sw" title={t} onClick={() => setNodeType(t)} style={swatch(t, selNode.type === t)}>
                      <span style={{ width: 10, height: 10, borderRadius: t === "decision" ? 2 : "50%",
                        transform: t === "decision" ? "rotate(45deg)" : "none", background: NODE_STYLES[t].header }} />
                    </button>
                  ))}
                  <span style={{ width: 1, height: 20, background: T.border, margin: "0 2px" }} />
                  <button className="wm-sw" title="Rename" onClick={() => setEditing({ kind: "node", id: selNode.id })} style={barIconBtn(false)}>✎</button>
                  <button className="wm-sw" title="Notes"
                    onClick={() => setNotesFor(notesFor === selNode.id ? null : selNode.id)}
                    style={barIconBtn(notesFor === selNode.id || !!selNode.description)}>Notes</button>
                  <button className="wm-sw" title="Delete (Del)" onClick={deleteSelected}
                    style={{ ...barIconBtn(false), color: T.danger, borderColor: "#f3c9cb" }}>🗑</button>
                </div>

                {selNode.type === "decision" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", maxWidth: 280 }}>
                    {selNode.branches.map(b => (
                      <span key={b.id} style={{ display: "inline-flex", alignItems: "center", gap: 2,
                        background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, padding: "2px 3px 2px 6px" }}>
                        <input className="wm-fld" value={b.label} onChange={e => updateBranch(b.id, e.target.value)}
                          style={{ width: Math.max(34, (b.label.length || 4) * 7), border: "none", background: "transparent",
                            fontSize: 11.5, fontWeight: 600, color: T.text, padding: 0, fontFamily: "inherit" }} />
                        <button onClick={() => removeBranch(b.id)} title="Remove branch"
                          style={{ border: "none", background: "transparent", color: T.textFaint, cursor: "pointer", fontSize: 12, lineHeight: 1, padding: "0 2px" }}>×</button>
                      </span>
                    ))}
                    <button onClick={addBranch} title="Add branch"
                      style={{ border: `1px dashed ${T.primary}`, background: T.primarySoft, color: T.primary,
                        borderRadius: 7, padding: "2px 8px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>+ Branch</button>
                  </div>
                )}

                {notesFor === selNode.id && (
                  <textarea className="wm-fld" value={selNode.description || ""} placeholder="Why this step exists, owner, notes…"
                    autoFocus rows={3}
                    onChange={e => updateNodeById(selNode.id, "description", e.target.value)}
                    onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setNotesFor(null); } }}
                    style={{ width: 260, border: `1px solid ${T.borderMed}`, borderRadius: 8, padding: "7px 9px",
                      fontSize: 12.5, color: T.text, resize: "vertical", lineHeight: 1.5, boxSizing: "border-box", fontFamily: "inherit" }} />
                )}
              </div>
            </div>
          )}

          {/* ---- Floating edge toolbar ---- */}
          {edgeBar && selEdge && (
            <div style={{ position: "absolute", left: edgeBar.left, top: edgeBar.top, transform: "translate(-50%,-140%)", zIndex: 25 }}
              onPointerDown={e => e.stopPropagation()}>
              <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10,
                boxShadow: "0 6px 20px rgba(20,27,38,.16)", padding: 6, display: "flex", gap: 5 }}>
                <button className="wm-sw" title="Edit label" onClick={() => setEditing({ kind: "edge", id: selEdge.id })} style={barIconBtn(false)}>✎ Label</button>
                <button className="wm-sw" title="Delete (Del)" onClick={deleteSelected}
                  style={{ ...barIconBtn(false), color: T.danger, borderColor: "#f3c9cb" }}>🗑</button>
              </div>
            </div>
          )}

          {/* ---- Zoom controls ---- */}
          <div style={{ position: "absolute", right: 14, bottom: 14, display: "flex", flexDirection: "column", gap: 6, alignItems: "center", zIndex: 15 }}>
            <button className="wm-ov" style={ovBtn} title="Zoom in (+)" onClick={() => zoomBy(1.15)}>+</button>
            <div style={{ ...ovBtn, cursor: "default", fontSize: 10.5, fontWeight: 600, width: 34, color: T.textSoft }}>{Math.round(zoom * 100)}%</div>
            <button className="wm-ov" style={ovBtn} title="Zoom out (−)" onClick={() => zoomBy(1 / 1.15)}>&#8722;</button>
            <button className="wm-ov" style={{ ...ovBtn, fontSize: 11, fontWeight: 600 }} title="Fit to content (1)" onClick={fitView}>Fit</button>
            <button className="wm-ov" style={{ ...ovBtn, fontSize: 11, fontWeight: 600 }} title="Reset view (0)" onClick={resetView}>1:1</button>
          </div>

          {/* ---- Help ---- */}
          <div style={{ position: "absolute", right: 14, top: 14, zIndex: 15 }}>
            <button className="wm-ov" style={ovBtn} title="Shortcuts" onClick={() => setHelpOpen(o => !o)}>?</button>
            {helpOpen && (
              <div style={{ position: "absolute", right: 0, top: 38, width: 232, background: "#fff",
                border: `1px solid ${T.border}`, borderRadius: 11, boxShadow: "0 8px 24px rgba(20,27,38,.18)",
                padding: "13px 15px", fontSize: 12, color: T.textSoft, lineHeight: 2 }}>
                <div style={{ fontWeight: 700, color: T.text, marginBottom: 4, fontSize: 12.5, letterSpacing: ".03em" }}>SHORTCUTS</div>
                <div><b style={{ color: T.text }}>Double-click</b> — edit label</div>
                <div><b style={{ color: T.text }}>P / D / S / E</b> — add node</div>
                <div><b style={{ color: T.text }}>Ctrl+Z / Shift+Z</b> — undo / redo</div>
                <div><b style={{ color: T.text }}>Del</b> — delete&nbsp;·&nbsp;<b style={{ color: T.text }}>Esc</b> — deselect</div>
                <div><b style={{ color: T.text }}>Drag empty</b> — box-select</div>
                <div><b style={{ color: T.text }}>Shift+click</b> — multi-select</div>
                <div><b style={{ color: T.text }}>Space+drag</b> — pan&nbsp;·&nbsp;<b style={{ color: T.text }}>Scroll</b> — zoom</div>
              </div>
            )}
          </div>

          {/* ---- Minimap ---- */}
          {mmBounds && (
            <div style={{ position: "absolute", left: 14, bottom: 14, width: MM_W, height: MM_H,
              background: "rgba(255,255,255,.92)", border: `1px solid ${T.border}`, borderRadius: 10,
              boxShadow: "0 2px 8px rgba(20,27,38,.14)", overflow: "hidden", cursor: "pointer", zIndex: 15 }}>
              <svg width={MM_W} height={MM_H} onClick={onMinimapClick} style={{ display: "block" }}>
                {curNodes.map(n => {
                  const w = n.width || 180, h = n.height || 70;
                  const p = mmMap(n.x, n.y);
                  const st = NODE_STYLES[n.type] || NODE_STYLES.process;
                  return <rect key={n.id} x={p.x} y={p.y} width={Math.max(2, w * mmBounds.s)}
                    height={Math.max(2, h * mmBounds.s)} rx={2} fill={st.header} fillOpacity={0.85} />;
                })}
                {(() => {
                  const p = mmMap(-pan.x / zoom, -pan.y / zoom);
                  return <rect x={p.x} y={p.y} width={(svgSize.w / zoom) * mmBounds.s} height={(svgSize.h / zoom) * mmBounds.s}
                    fill="none" stroke={T.primary} strokeWidth={1.5} rx={2} />;
                })()}
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
