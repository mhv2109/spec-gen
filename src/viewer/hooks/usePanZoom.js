import { useState, useCallback, useRef } from 'react';

export function usePanZoom() {
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const dragging = useRef(false);
  const hasDragged = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    dragging.current = true;
    hasDragged.current = false;
    last.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.style.cursor = 'grabbing';
  }, []);

  const onMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasDragged.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
  }, []);

  const onMouseUp = useCallback((e) => {
    dragging.current = false;
    e.currentTarget.style.cursor = 'grab';
  }, []);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.06 : 1 / 1.06;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setTransform((t) => {
      const k = Math.max(0.15, Math.min(8, t.k * factor));
      const ratio = k / t.k;
      return {
        k,
        x: cx - ratio * (cx - t.x),
        y: cy - ratio * (cy - t.y),
      };
    });
  }, []);

  const onDblClick = useCallback((e) => {
    if (e.target === e.currentTarget || e.target.tagName === 'svg') {
      setTransform({ x: 0, y: 0, k: 1 });
    }
  }, []);

  const onMouseLeave = useCallback((e) => {
    dragging.current = false;
    e.currentTarget.style.cursor = 'grab';
  }, []);

  const reset = useCallback(() => setTransform({ x: 0, y: 0, k: 1 }), []);

  const panToCenter = useCallback((svgX, svgY) => {
    setTransform((t) => ({ ...t, x: 450 - svgX * t.k, y: 270 - svgY * t.k }));
  }, []);

  const isDrag = useCallback(() => hasDragged.current, []);

  return {
    transform,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onWheel,
    onMouseLeave,
    onDblClick,
    reset,
    panToCenter,
    isDrag,
  };
}
