import { useEffect, useRef, useState } from "react";
import { Stage, webglAvailable } from "./stage.js";

/** Mount the shared twin stage on a canvas. Returns the stage, or false when WebGL is unavailable. */
export function useStage(opts = {}) {
  const ref = useRef(null);
  const [stage, setStage] = useState(null);
  useEffect(() => {
    if (!webglAvailable()) { setStage(false); return undefined; }
    const s = new Stage(ref.current, opts);
    if (!s.ok) { setStage(false); return undefined; }
    setStage(s);
    return () => s.dispose();
  }, []);
  return [ref, stage];
}

/** Projected labels: each item { id, key, at:[x,y,z], cls, label, title, value }. */
export function useAnnotations(stage, layerRef, items) {
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (!stage) return undefined;
    const out = {};
    return stage.on("tick", () => {
      const layer = layerRef.current; if (!layer) return;
      for (const el of layer.children) {
        const it = itemsRef.current.find((x) => x.id === el.dataset.id); if (!it) continue;
        stage.screenOf(it.key, it.at, out);
        el.style.transform = `translate(${out.x.toFixed(1)}px, ${out.y.toFixed(1)}px)`;
        el.style.visibility = out.visible ? "visible" : "hidden";
      }
    });
  }, [stage]);
}
