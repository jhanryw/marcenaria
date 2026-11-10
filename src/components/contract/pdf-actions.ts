import { contractFileName } from "@/contracts/build-contract";
import { generateContractPdf, layoutContract, renderInputFromContract } from "@/contracts/pdf/generate";
import { loadFontBytes } from "@/contracts/pdf/fonts";
import type { LaidOutDocument } from "@/contracts/pdf/layout";
import type { Contract } from "@/domain/schema";

/** Gera o PDF no navegador (offline). Rascunhos saem como MINUTA; emitidos usam a versão imutável. */
export async function makePdf(contract: Contract): Promise<{ bytes: Uint8Array; fileName: string }> {
  const fonts = await loadFontBytes();
  const input = renderInputFromContract(contract);
  const { bytes } = await generateContractPdf(input, fonts);
  const content = contract.issued?.content ?? contract.content;
  return { bytes, fileName: contractFileName(contract, content) };
}

export async function makeLayout(contract: Contract): Promise<LaidOutDocument> {
  const fonts = await loadFontBytes();
  return layoutContract(renderInputFromContract(contract), fonts);
}

function toBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes); // garante ArrayBuffer próprio
  return new Blob([copy], { type: "application/pdf" });
}

export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(toBlob(bytes));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

/** Abre o menu de compartilhamento do aparelho com o arquivo; sem suporte, baixa o PDF. */
export async function sharePdf(bytes: Uint8Array, fileName: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([toBlob(bytes)], fileName, { type: "application/pdf" });
  if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  downloadPdf(bytes, fileName);
  return "downloaded";
}
