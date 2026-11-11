/** Baixar e compartilhar arquivos gerados no navegador (PDF/CSV). Compartilha pelo menu nativo quando houver. */
export function downloadFile(content: Uint8Array | string, fileName: string, mime: string): void {
  const blob = new Blob([typeof content === "string" ? content : new Uint8Array(content)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

export async function shareFile(
  content: Uint8Array | string,
  fileName: string,
  mime: string,
  message: { title: string; text: string },
): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([typeof content === "string" ? content : new Uint8Array(content)], fileName, { type: mime.split(";")[0] });
  if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: message.title, text: message.text });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  downloadFile(content, fileName, mime);
  return "downloaded";
}
