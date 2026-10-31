// Téléchargement, partage et lecture de fichiers (sans serveur).

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(filename: string, text: string, mime: string): void {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

/** Partage natif (feuille de partage du téléphone) si possible, sinon téléchargement. */
export async function shareFile(file: File, title: string, text?: string): Promise<'shared' | 'downloaded'> {
  const data: ShareData = { files: [file], title, text };
  if (navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
    }
  }
  downloadBlob(file.name, file);
  return 'downloaded';
}

/** Partage (téléphone) ou téléchargement (ordinateur) d'un PDF généré. */
export function sharePdf(bytes: Uint8Array, filename: string, title: string): Promise<'shared' | 'downloaded'> {
  const file = new File([bytes as Uint8Array<ArrayBuffer>], filename, { type: 'application/pdf' });
  return shareFile(file, title);
}

export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsText(file);
  });
}

export function fileStamp(d: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
