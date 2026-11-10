"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/db/db";
import { getSettings } from "@/db/repository";
import type { EdgeTape, Project, Settings, SheetMaterial } from "@/domain/schema";

/** undefined = carregando */
export function useSettings(): Settings | undefined {
  return useLiveQuery(() => getSettings(), [], undefined);
}

export function useProjects(): Project[] | undefined {
  return useLiveQuery(() => getDb().projects.toArray(), [], undefined);
}

export function useSheetMaterials(): SheetMaterial[] | undefined {
  return useLiveQuery(() => getDb().sheetMaterials.orderBy("name").toArray(), [], undefined);
}

export function useEdgeTapes(): EdgeTape[] | undefined {
  return useLiveQuery(() => getDb().edgeTapes.orderBy("name").toArray(), [], undefined);
}
