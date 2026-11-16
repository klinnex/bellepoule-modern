/**
 * BellePoule Modern - Mode Club (#1872) : fichiers de partage (JSON) et images.
 * Licensed under GPL-3.0
 */

/** Enregistre un texte via la boîte « Enregistrer sous » ; false si annulé */
export async function saveTextFile(
  defaultPath: string,
  content: string,
  title: string,
  ext: 'json' | 'csv' = 'json'
): Promise<boolean> {
  const api = window.electronAPI;
  if (!api?.dialog?.saveFile || !api.file?.writeContent) return false;
  const r = await api.dialog.saveFile({
    title,
    defaultPath,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (!r || r.canceled || !r.filePath) return false;
  await api.file.writeContent(r.filePath, content);
  return true;
}

/** Ouvre un fichier JSON ; null si annulé */
export async function openTextFile(title: string): Promise<string | null> {
  const r = await window.electronAPI?.dialog?.openFile({
    title,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  return r?.filePath ? (r.content ?? '') : null;
}

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsDataURL(file);
  });

/**
 * Image choisie → data URL réduite (1280 px max, JPEG 85 %) pour limiter le poids des
 * plans partagés ; repli sur l'image d'origine si le canvas est indisponible.
 */
export async function imageFileToDataUrl(file: File, maxSide = 1280): Promise<string> {
  const original = await readAsDataUrl(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = original;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', 0.85);
    return out.startsWith('data:image/jpeg') && out.length < original.length ? out : original;
  } catch {
    return original;
  }
}
