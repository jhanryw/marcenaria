"use client";
import * as React from "react";
import { Layers, Pencil, Plus, Ruler, Trash2, Scissors } from "lucide-react";
import { useEdgeTapes, useSettings, useSheetMaterials } from "@/hooks/use-data";
import { deleteEdgeTape, deleteSheetMaterial, saveEdgeTape, saveSheetMaterial } from "@/db/repository";
import { newEdgeTape, newSheetMaterial } from "@/domain/defaults";
import type { EdgeTape, SheetMaterial } from "@/domain/schema";
import { formatBRL, formatNumber } from "@/lib/money";
import { formatCm } from "@/lib/units";
import { PageContainer, PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EdgeTapeDialog, SheetMaterialDialog } from "@/components/material-forms";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { defaultSettings } from "@/domain/defaults";

export default function MaterialsPage() {
  const materials = useSheetMaterials();
  const tapes = useEdgeTapes();
  const settings = useSettings() ?? defaultSettings();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [tab, setTab] = React.useState("chapas");

  const [matOpen, setMatOpen] = React.useState(false);
  const [matDraft, setMatDraft] = React.useState<SheetMaterial>(() => newSheetMaterial(defaultSettings()));
  const [tapeOpen, setTapeOpen] = React.useState(false);
  const [tapeDraft, setTapeDraft] = React.useState<EdgeTape>(() => newEdgeTape(defaultSettings()));

  const openMat = (m?: SheetMaterial) => {
    setMatDraft(m ?? newSheetMaterial(settings));
    setMatOpen(true);
  };
  const openTape = (t?: EdgeTape) => {
    setTapeDraft(t ?? newEdgeTape(settings));
    setTapeOpen(true);
  };

  async function removeMat(m: SheetMaterial) {
    const ok = await confirm({
      title: "Excluir material?",
      message: "Orçamentos que já usam este material não são afetados (eles guardam uma cópia).",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (ok) {
      await deleteSheetMaterial(m.id);
      toast("Material excluído");
    }
  }
  async function removeTape(t: EdgeTape) {
    const ok = await confirm({
      title: "Excluir fita?",
      message: "Orçamentos que já usam esta fita não são afetados.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (ok) {
      await deleteEdgeTape(t.id);
      toast("Fita excluída");
    }
  }

  return (
    <>
      <PageHeader
        title="Materiais"
        subtitle="Catálogo de chapas, fitas e preços padrão"
        actions={
          <Button size="sm" onClick={() => (tab === "chapas" ? openMat() : openTape())}>
            <Plus /> Novo
          </Button>
        }
      />
      <PageContainer>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid-cols-2">
            <TabsTrigger value="chapas">
              <Layers /> Chapas MDF
            </TabsTrigger>
            <TabsTrigger value="fitas">
              <Ruler /> Fitas de borda
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chapas" className="space-y-3">
            <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
              Alterar preços aqui <strong>não muda orçamentos já feitos</strong>: cada orçamento guarda os preços da época em que foi criado.
            </p>
            {materials === undefined ? (
              <div className="h-24 animate-pulse rounded-2xl bg-muted" />
            ) : materials.length === 0 ? (
              <EmptyState
                icon={<Layers />}
                title="Nenhuma chapa cadastrada"
                description="Cadastre os tipos de MDF que você usa, com medida e preço."
                action={<Button onClick={() => openMat()}><Plus /> Cadastrar chapa</Button>}
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {materials.map((m) => (
                  <Card key={m.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold leading-tight">{m.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {[m.finish, m.manufacturer].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      <div className="text-right text-lg font-bold text-primary tabular">{formatBRL(m.priceCents)}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge>{formatNumber(m.thicknessMm)} mm</Badge>
                      <Badge>
                        {formatCm(m.lengthMm)} × {formatCm(m.widthMm)} cm
                      </Badge>
                      <Badge>margem {formatNumber(m.marginMm)} mm</Badge>
                      <Badge>serra {formatNumber(m.kerfMm)} mm</Badge>
                      {m.grainRequired && <Badge tone="amber">veio obrigatório</Badge>}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openMat(m)}>
                        <Pencil /> Editar
                      </Button>
                      <Button variant="destructive-outline" size="sm" aria-label={`Excluir ${m.name}`} onClick={() => removeMat(m)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="fitas" className="space-y-3">
            {tapes === undefined ? (
              <div className="h-24 animate-pulse rounded-2xl bg-muted" />
            ) : tapes.length === 0 ? (
              <EmptyState
                icon={<Scissors />}
                title="Nenhuma fita cadastrada"
                description="Cadastre as fitas de borda com preço por metro e perda."
                action={<Button onClick={() => openTape()}><Plus /> Cadastrar fita</Button>}
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {tapes.map((t) => (
                  <Card key={t.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold leading-tight">{t.name}</h3>
                        <p className="text-sm text-muted-foreground">{t.color || "—"}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-primary tabular">{formatBRL(t.pricePerMeterCents)}</div>
                        <div className="text-xs text-muted-foreground">por metro</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge>
                        {formatNumber(t.widthMm)} × {formatNumber(t.thicknessMm)} mm
                      </Badge>
                      <Badge>perda {formatNumber(t.wastePercent)}%</Badge>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openTape(t)}>
                        <Pencil /> Editar
                      </Button>
                      <Button variant="destructive-outline" size="sm" aria-label={`Excluir ${t.name}`} onClick={() => removeTape(t)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </PageContainer>

      <SheetMaterialDialog
        open={matOpen}
        onOpenChange={setMatOpen}
        initial={matDraft}
        onSave={async (m) => {
          await saveSheetMaterial(m);
          toast("Material salvo");
        }}
      />
      <EdgeTapeDialog
        open={tapeOpen}
        onOpenChange={setTapeOpen}
        initial={tapeDraft}
        onSave={async (t) => {
          await saveEdgeTape(t);
          toast("Fita salva");
        }}
      />
    </>
  );
}
