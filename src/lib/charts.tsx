import React, { useRef, useState } from 'react';

interface DataPoint {
  [key: string]: string | number;
}

interface LineDef {
  dataKey: string;
  stroke: string;
  strokeWidth?: number;
  name?: string;
}

interface TooltipState {
  x: number;
  y: number;
  index: number;
  visible: boolean;
}

interface LineChartProps {
  data: DataPoint[];
  lines: LineDef[];
  xKey: string;
  width?: string | number;
  height?: number;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
}

export function LineChart({ data, lines, xKey, height = 200, margin = {} }: LineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({ x: 0, y: 0, index: -1, visible: false });
  const [svgWidth, setSvgWidth] = useState(600);

  const containerRef = useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setSvgWidth(e.contentRect.width);
    });
    ro.observe(containerRef.current);
    setSvgWidth(containerRef.current.clientWidth);
    return () => ro.disconnect();
  }, []);

  const mt = margin.top ?? 10;
  const mr = margin.right ?? 20;
  const mb = margin.bottom ?? 30;
  const ml = margin.left ?? 50;

  const chartW = svgWidth - ml - mr;
  const chartH = height - mt - mb;

  if (!data.length) return null;

  const allValues = lines.flatMap(l => data.map(d => Number(d[l.dataKey] ?? 0)));
  const maxVal = Math.max(...allValues, 1);
  const minVal = Math.min(...allValues, 0);
  const range = maxVal - minVal || 1;

  function xPos(i: number) { return (i / (data.length - 1 || 1)) * chartW; }
  function yPos(v: number) { return chartH - ((v - minVal) / range) * chartH; }

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => minVal + (range * i) / yTicks);

  const xTickStep = Math.ceil(data.length / 6);

  return (
    <div ref={containerRef} style={{ width: '100%', height }}>
      <svg ref={svgRef} width={svgWidth} height={height}
        onMouseLeave={() => setTooltip(t => ({ ...t, visible: false }))}
        onMouseMove={e => {
          if (!svgRef.current) return;
          const rect = svgRef.current.getBoundingClientRect();
          const mx = e.clientX - rect.left - ml;
          const idx = Math.round((mx / chartW) * (data.length - 1));
          const clamped = Math.max(0, Math.min(data.length - 1, idx));
          setTooltip({ x: xPos(clamped) + ml, y: e.clientY - rect.top, index: clamped, visible: true });
        }}
      >
        <g transform={`translate(${ml},${mt})`}>
          {/* Grid lines */}
          {yTickValues.map((v, i) => (
            <line key={i} x1={0} x2={chartW} y1={yPos(v)} y2={yPos(v)} stroke="#f1f5f9" strokeWidth={1} />
          ))}
          {/* Y axis ticks */}
          {yTickValues.map((v, i) => (
            <text key={i} x={-6} y={yPos(v) + 4} textAnchor="end" fontSize={11} fill="#94a3b8">
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          ))}
          {/* X axis ticks */}
          {data.map((d, i) => i % xTickStep === 0 && (
            <text key={i} x={xPos(i)} y={chartH + 18} textAnchor="middle" fontSize={11} fill="#94a3b8">
              {String(d[xKey]).slice(5)}
            </text>
          ))}
          {/* Lines */}
          {lines.map(l => {
            const pts = data.map((d, i) => `${xPos(i)},${yPos(Number(d[l.dataKey] ?? 0))}`).join(' ');
            return <polyline key={l.dataKey} points={pts} fill="none" stroke={l.stroke} strokeWidth={l.strokeWidth ?? 2} strokeLinejoin="round" strokeLinecap="round" />;
          })}
          {/* Hover line */}
          {tooltip.visible && tooltip.index >= 0 && (
            <line x1={xPos(tooltip.index)} x2={xPos(tooltip.index)} y1={0} y2={chartH} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4 2" />
          )}
        </g>
        {/* Tooltip */}
        {tooltip.visible && tooltip.index >= 0 && (() => {
          const d = data[tooltip.index];
          const tipW = 130;
          const tipX = Math.min(tooltip.x + 12, svgWidth - tipW - 4);
          const tipY = Math.max(4, tooltip.y - 16);
          const rows = lines.filter(l => d[l.dataKey] !== undefined);
          const tipH = 28 + rows.length * 18;
          return (
            <g>
              <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={6} fill="white" stroke="#e2e8f0" strokeWidth={1} filter="drop-shadow(0 1px 4px rgba(0,0,0,.08))" />
              <text x={tipX + 8} y={tipY + 16} fontSize={11} fontWeight={600} fill="#475569">{String(d[xKey])}</text>
              {rows.map((l, i) => (
                <g key={l.dataKey}>
                  <circle cx={tipX + 12} cy={tipY + 28 + i * 18} r={4} fill={l.stroke} />
                  <text x={tipX + 22} y={tipY + 32 + i * 18} fontSize={11} fill="#475569">{l.name ?? l.dataKey}: {d[l.dataKey]}</text>
                </g>
              ))}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
