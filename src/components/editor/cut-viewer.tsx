"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MaterialCutResult, SheetLayout } from "@/engine/cutting/types";
import { formatNumber } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PALETTE = ["#cfe3d6", "#e8d9bd", "#d3dcec", "#efd3cf", "#dfe8c4", "#e5d1e8", "#c9e4e6", "#f0e2b6"];

function colorFor(pieceId: string, order: Map<string, number>): string {
  return PALETTE[(order.get(pieceId) ?? 0) % PALETTE.length];
}

function SheetSvg({
  result,
  sheet,
  labels,
  order,
}: {
  result: MaterialCutResult;
  sheet: SheetLayout;
  labels: Map<string, string>;
  order: Map<string, number>;
}) {
  const m = result.material;
  const L = m.lengthMm;
  const W = m.widthMm;
  const fs = Math.max(L, W) / 48; // tamanho base da fonte em unidades da chapa
  const uid = React.useId().replace(/:/g, "");

  return (
    <svg
      viewBox={`0 0 ${L} ${W}`}
      role="img"
      aria-label={`Plano de corte da chapa ${sheet.index} de ${result.sheetsUsed}: ${sheet.placements.length} peças`}
      className="block h-auto w-full rounded-xl bg-[#f3ede0]"
      style={{ aspectRatio: `${L} / ${W}` }}
    >
      <defs>
        <pattern id={`reuse-${uid}`} width={fs * 0.9} height={fs * 0.9} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={fs * 0.9} height={fs * 0.9} fill="#d9efe1" />
          <line x1="0" y1="0" x2="0" y2={fs * 0.9} stroke="#3c9a6c" strokeWidth={fs * 0.12} />
        </pattern>
        <pattern id={`waste-${uid}`} width={fs * 0.9} height={fs * 0.9} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={fs * 0.9} height={fs * 0.9} fill="#ebe7dc" />
          <line x1="0" y1="0" x2="0" y2={fs * 0.9} stroke="#b9b3a2" strokeWidth={fs * 0.08} />
        </pattern>
      </defs>

      {/* área de margem (refilo) */}
      <rect x={0} y={0} width={L} height={W} fill="#d9cfb8" />
      <rect
        x={m.marginMm}
        y={m.marginMm}
        width={L - 2 * m.marginMm}
        height={W - 2 * m.marginMm}
        fill="#f3ede0"
        stroke="#a39878"
        strokeWidth={fs * 0.08}
        strokeDasharray={`${fs * 0.5} ${fs * 0.35}`}
      />

      {/* sobras */}
      {sheet.freeRegions.map((f, i) => (
        <g key={`f${i}`}>
          <rect
            x={f.x}
            y={f.y}
            width={f.w}
            height={f.h}
            fill={`url(#${f.reusable ? "reuse" : "waste"}-${uid})`}
            stroke={f.reusable ? "#2f8a5b" : "#b9b3a2"}
            strokeWidth={f.reusable ? fs * 0.14 : fs * 0.06}
            strokeDasharray={f.reusable ? `${fs * 0.6} ${fs * 0.3}` : undefined}
          />
          {f.reusable && f.w >= fs * 7 && f.h >= fs * 2.4 && (
            <text
              x={f.x + f.w / 2}
              y={f.y + f.h / 2}
              fontSize={fs * 0.95}
              fontWeight={700}
              fill="#1f5c3d"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ paintOrder: "stroke", stroke: "#d9efe1", strokeWidth: fs * 0.25 }}
            >
              sobra {formatNumber(Math.max(f.w, f.h), 0)}×{formatNumber(Math.min(f.w, f.h), 0)}
            </text>
          )}
        </g>
      ))}

      {/* peças */}
      {sheet.placements.map((p, i) => {
        const label = labels.get(p.pieceId) ?? "";
        const roomy = Math.min(p.w, p.h) >= fs * 1.7 && Math.max(p.w, p.h) >= fs * 3;
        const dims = `${formatNumber(p.w, 0)}×${formatNumber(p.h, 0)}`;
        const vertical = p.h > p.w * 1.4 && p.w < fs * 6.5;
        const cx = p.x + p.w / 2;
        const cy = p.y + p.h / 2;
        const showDims = vertical ? p.h >= fs * 7 && p.w >= fs * 2.8 : p.w >= fs * 6.2 && p.h >= fs * 3.1;
        return (
          <g key={i}>
            <title>{`${p.description}${p.ref ? ` (${p.ref})` : ""} — ${dims} mm${p.rotated ? " · girada 90°" : ""}`}</title>
            <rect
              x={p.x}
              y={p.y}
              width={p.w}
              height={p.h}
              fill={colorFor(p.pieceId, order)}
              stroke="#1f4a3a"
              strokeWidth={fs * 0.1}
            />
            {roomy && (
              <g
                transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
                fontSize={fs}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#14281f"
              >
                <text x={cx} y={showDims ? cy - fs * 0.6 : cy} fontWeight={700}>
                  {label}
                </text>
                {showDims && (
                  <text x={cx} y={cy + fs * 0.65} fontSize={fs * 0.82} fill="#2b4a3a">
                    {dims}
                  </text>
                )}
              </g>
            )}
            {p.rotated && roomy && (
              <text x={p.x + fs * 0.4} y={p.y + fs * 1.05} fontSize={fs * 0.9} fill="#1f4a3a">
                ↻
              </text>
            )}
          </g>
        );
      })}

      <rect x={0} y={0} width={L} height={W} fill="none" stroke="#7d7255" strokeWidth={fs * 0.16} />
    </svg>
  );
}

export function CutViewer({
  result,
  labels,
  order,
}: {
  result: MaterialCutResult;
  labels: Map<string, string>;
  order: Map<string, number>;
}) {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    if (idx >= result.sheets.length) setIdx(Math.max(0, result.sheets.length - 1));
  }, [result.sheets.length, idx]);

  if (result.sheets.length === 0) return null;
  const sheet = result.sheets[Math.min(idx, result.sheets.length - 1)];
  const many = result.sheets.length > 8;

  // agrupa peças da chapa para a legenda
  const groups = new Map<string, { label: string; description: string; count: number; w: number; h: number; rotated: number }>();
  for (const p of sheet.placements) {
    const g = groups.get(p.pieceId);
    if (g) {
      g.count++;
      if (p.rotated) g.rotated++;
    } else {
      groups.set(p.pieceId, {
        label: labels.get(p.pieceId) ?? "",
        description: p.description,
        count: 1,
        w: p.w,
        h: p.h,
        rotated: p.rotated ? 1 : 0,
      });
    }
  }
  const reusable = sheet.freeRegions.filter((f) => f.reusable).sort((a, b) => b.w * b.h - a.w * a.h);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Chapa anterior" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
          <ChevronLeft />
        </Button>
        {many ? (
          <Select aria-label="Escolher chapa" value={idx} onChange={(e) => setIdx(Number(e.target.value))} className="flex-1">
            {result.sheets.map((s, i) => (
              <option key={s.index} value={i}>
                Chapa {s.index} de {result.sheets.length}
              </option>
            ))}
          </Select>
        ) : (
          <div className="flex flex-1 flex-wrap justify-center gap-1.5" role="tablist" aria-label="Chapas">
            {result.sheets.map((s, i) => (
              <button
                key={s.index}
                role="tab"
                aria-selected={i === idx}
                onClick={() => setIdx(i)}
                className={cn(
                  "h-11 min-w-11 rounded-xl border px-3 text-sm font-bold",
                  i === idx ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
                )}
              >
                {s.index}
              </button>
            ))}
          </div>
        )}
        <Button variant="outline" size="icon" aria-label="Próxima chapa" disabled={idx >= result.sheets.length - 1} onClick={() => setIdx(idx + 1)}>
          <ChevronRight />
        </Button>
      </div>

      <div className="text-center text-sm font-semibold">
        Chapa {sheet.index} de {result.sheets.length}
        <span className="font-normal text-muted-foreground">
          {" "}
          · {sheet.placements.length} peça{sheet.placements.length === 1 ? "" : "s"} · {formatNumber(result.material.lengthMm, 0)} ×{" "}
          {formatNumber(result.material.widthMm, 0)} mm
        </span>
      </div>

      <SheetSvg result={result} sheet={sheet} labels={labels} order={order} />

      <p className="text-xs font-semibold text-muted-foreground">Medidas do plano de corte em milímetros (mm).</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-3 rounded-sm border border-[#1f4a3a] bg-[#cfe3d6]" /> peça
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-3 rounded-sm border border-dashed border-[#2f8a5b] bg-[#d9efe1]" /> sobra reaproveitável
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-3 rounded-sm border border-[#b9b3a2] bg-[#ebe7dc]" /> sobra pequena
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-3 rounded-sm bg-[#d9cfb8]" /> refilo
        </span>
        <span>↻ girada 90°</span>
      </div>

      {reusable.length > 0 && (
        <p className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
          <strong>Sobras reaproveitáveis nesta chapa:</strong>{" "}
          {reusable.map((f) => `${formatNumber(Math.max(f.w, f.h), 0)} × ${formatNumber(Math.min(f.w, f.h), 0)} mm`).join(" · ")}
        </p>
      )}

      <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
        {[...groups.entries()].map(([id, g]) => (
          <li key={id} className="flex items-center gap-3 px-3 py-2">
            <i className="size-4 shrink-0 rounded-sm border border-[#1f4a3a]" style={{ background: colorFor(id, order) }} />
            <span className="w-10 shrink-0 font-bold">{g.label}</span>
            <span className="min-w-0 flex-1 truncate">{g.description}</span>
            <span className="shrink-0 text-muted-foreground tabular">
              {formatNumber(g.w, 0)}×{formatNumber(g.h, 0)}
            </span>
            <span className="w-9 shrink-0 text-right font-semibold tabular">{g.count}×</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
