"use client";
import * as React from "react";
import { Loader2 } from "lucide-react";
import type { Contract } from "@/domain/schema";
import { FONT_FILES } from "@/contracts/pdf/fonts";
import type { FontKey, LaidOutDocument, Op } from "@/contracts/pdf/layout";
import { BASE_PATH } from "@/lib/pwa";
import { Dialog, DialogBody, DialogContent } from "@/components/ui/dialog";
import { makeLayout } from "./pdf-actions";

const FAMILY: Record<FontKey, { family: string; weight: number; style: "normal" | "italic" }> = {
  serif: { family: "ContractSerif", weight: 400, style: "normal" },
  serifBold: { family: "ContractSerif", weight: 700, style: "normal" },
  serifItalic: { family: "ContractSerif", weight: 400, style: "italic" },
  sans: { family: "ContractSans", weight: 400, style: "normal" },
  sansSemi: { family: "ContractSans", weight: 600, style: "normal" },
  sansBold: { family: "ContractSans", weight: 700, style: "normal" },
};

/** @font-face com as MESMAS fontes do PDF (do cache offline do app). */
const FONT_CSS = (Object.keys(FAMILY) as FontKey[])
  .map((k) => {
    const f = FAMILY[k];
    return `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:${f.style};src:url('${BASE_PATH}/fonts/${FONT_FILES[k]}') format('woff');font-display:block}`;
  })
  .join("");

function OpView({ op, w, h }: { op: Op; w: number; h: number }) {
  switch (op.t) {
    case "line":
      return <line x1={op.x1} y1={op.y1} x2={op.x2} y2={op.y2} stroke={op.color} strokeWidth={op.width} strokeDasharray={op.dash?.join(" ")} />;
    case "rect":
      return <rect x={op.x} y={op.y} width={op.w} height={op.h} fill={op.fill ?? "none"} stroke={op.stroke} strokeWidth={op.strokeWidth} strokeDasharray={op.dash?.join(" ")} data-tag={op.tag} />;
    case "image":
      return <image href={op.dataUrl} x={op.x} y={op.y} width={op.w} height={op.h} preserveAspectRatio="xMidYMid meet" />;
    case "watermark":
      return (
        <text
          x={w / 2}
          y={h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          transform={`rotate(-45 ${w / 2} ${h / 2})`}
          fontFamily="ContractSans"
          fontWeight={700}
          fontSize={120}
          fill="#d2d6d2"
          fillOpacity={0.4}
        >
          {op.text}
        </text>
      );
    case "text": {
      const f = FAMILY[op.font];
      const anchor = op.align === "center" ? "middle" : op.align === "right" ? "end" : "start";
      const x = op.align === "center" ? op.x + op.width / 2 : op.align === "right" ? op.x + op.width : op.x;
      return (
        <text
          x={x}
          y={op.y}
          fontFamily={`'${f.family}', serif`}
          fontWeight={f.weight}
          fontStyle={f.style}
          fontSize={op.size}
          fill={op.color}
          textAnchor={anchor}
          xmlSpace="preserve"
          transform={op.rotate ? `rotate(${-op.rotate} ${x} ${op.y})` : undefined}
          {...(op.justify ? { textLength: op.width, lengthAdjust: "spacing" as const } : {})}
        >
          {op.text}
        </text>
      );
    }
  }
}

export function PagesView({
  layout,
  maxWidth = 794,
  label = "do contrato",
  testId = "contract",
}: {
  layout: LaidOutDocument;
  /** Largura máxima de cada página na tela (px) */
  maxWidth?: number;
  label?: string;
  testId?: string;
}) {
  return (
    <div className="space-y-4" data-testid={`${testId}-pages`}>
      <style>{FONT_CSS}</style>
      {layout.pages.map((p, i) => (
        <svg
          key={i}
          viewBox={`0 0 ${layout.pageWidth} ${layout.pageHeight}`}
          role="img"
          aria-label={`Página ${i + 1} de ${layout.pages.length} ${label}`}
          className="mx-auto block h-auto w-full rounded-sm bg-white shadow-[0_2px_12px_rgba(0,0,0,0.18)]"
          style={{ maxWidth }}
          data-testid={`${testId}-page`}
        >
          <rect width={layout.pageWidth} height={layout.pageHeight} fill="#ffffff" />
          {p.ops.map((op, j) => (
            <OpView key={j} op={op} w={layout.pageWidth} h={layout.pageHeight} />
          ))}
        </svg>
      ))}
    </div>
  );
}

export function ContractPreviewDialog({
  contract,
  open,
  onOpenChange,
}: {
  contract: Contract;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [layout, setLayout] = React.useState<LaidOutDocument | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLayout(null);
    setError(null);
    makeLayout(contract)
      .then((l) => !cancelled && setLayout(l))
      .catch(() => !cancelled && setError("Não foi possível montar a pré-visualização."));
    return () => {
      cancelled = true;
    };
    // recalcula só ao abrir (o conteúdo atual é o do momento da abertura)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Pré-visualização do contrato"
        description={contract.status === "rascunho" ? "Minuta: é assim que o PDF será gerado." : "Versão emitida (imutável)."}
        className="h-[94dvh] md:h-[90dvh] md:max-w-4xl"
      >
        <DialogBody className="bg-[#d9dbd6] px-3 py-4">
          {error && <p role="alert" className="rounded-xl bg-destructive-soft p-4 text-sm text-destructive">{error}</p>}
          {!layout && !error && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" /> Montando páginas…
            </div>
          )}
          {layout && <PagesView layout={layout} />}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
