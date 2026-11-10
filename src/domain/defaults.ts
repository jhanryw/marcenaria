import { newId, nowIso } from "@/lib/utils";
import { companySchema, contractTermsSchema } from "./schema";
import type {
  CostItem,
  EdgeTape,
  Piece,
  Project,
  SheetMaterial,
  Settings,
} from "./schema";

export function defaultSettings(): Settings {
  return {
    id: "main",
    companyName: "",
    defaultMarkupPercent: 50,
    defaultSheetWidthMm: 1850,
    defaultSheetLengthMm: 2750,
    defaultSheetPriceCents: 32000,
    defaultMarginMm: 10,
    defaultKerfMm: 3,
    defaultTapeWastePercent: 10,
    defaultHourlyCents: 0,
    remnantMinShortMm: 300,
    remnantMinLongMm: 600,
    defaultReserve: { mode: "none", value: 0 },
    defaultDeductions: { taxPercent: 0, commissionPercent: 0, overheadPercent: 0 },
    lastBackupAt: null,
    company: companySchema.parse({}),
    nextContractNumber: 1,
    nextProjectNumber: 1,
    holidays: [],
    contractDefaults: contractTermsSchema.parse({}),
    contractTemplate: null,
  };
}

export function newSheetMaterial(settings: Settings, partial: Partial<SheetMaterial> = {}): SheetMaterial {
  const now = nowIso();
  return {
    id: newId(),
    name: "",
    manufacturer: "",
    finish: "",
    thicknessMm: 15,
    widthMm: settings.defaultSheetWidthMm,
    lengthMm: settings.defaultSheetLengthMm,
    priceCents: settings.defaultSheetPriceCents,
    marginMm: settings.defaultMarginMm,
    kerfMm: settings.defaultKerfMm,
    grainRequired: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function newEdgeTape(settings: Settings, partial: Partial<EdgeTape> = {}): EdgeTape {
  const now = nowIso();
  return {
    id: newId(),
    name: "",
    color: "",
    widthMm: 22,
    thicknessMm: 0.45,
    pricePerMeterCents: 250,
    wastePercent: settings.defaultTapeWastePercent,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function newProject(settings: Settings, partial: Partial<Project> = {}): Project {
  const now = nowIso();
  return {
    id: newId(),
    name: "Novo projeto",
    clientName: "",
    clientPhone: "",
    description: "",
    status: "rascunho",
    createdAt: now,
    updatedAt: now,
    pieces: [],
    materials: [],
    tapes: [],
    costItems: [],
    labor: {
      fabrication: { mode: "fixed", fixedCents: 0, hours: 0, hourlyCents: settings.defaultHourlyCents },
      installation: { mode: "fixed", fixedCents: 0, hours: 0, hourlyCents: settings.defaultHourlyCents },
    },
    reserve: { ...settings.defaultReserve },
    remnantMinShortMm: settings.remnantMinShortMm,
    remnantMinLongMm: settings.remnantMinLongMm,
    markupPercent: settings.defaultMarkupPercent,
    manualPriceCents: null,
    deductions: { ...settings.defaultDeductions },
    notes: "",
    ...partial,
  };
}

export function newPiece(materialId: string, partial: Partial<Piece> = {}): Piece {
  return {
    id: newId(),
    ref: "",
    description: "",
    materialId,
    widthMm: 0,
    lengthMm: 0,
    quantity: 1,
    allowRotation: true,
    edges: { top: null, bottom: null, left: null, right: null },
    notes: "",
    ...partial,
  };
}

export function newCostItem(partial: Partial<CostItem> = {}): CostItem {
  return {
    id: newId(),
    category: "outros",
    description: "",
    mode: "unit",
    quantity: 1,
    unit: "un.",
    unitCents: 0,
    ...partial,
  };
}
