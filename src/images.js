export function imageKey(path) {
  let decoded = path;
  try { decoded = decodeURIComponent(path); } catch { /* Match literal paths too. */ }
  return decoded.replace(/\\/g, '/').split(/[?#]/)[0].replace(/^\.\//, '');
}

export function findImage(path, assets) {
  const key = imageKey(path);
  if (assets.has(key)) return assets.get(key);
  const name = key.split('/').pop();
  const matches = [...assets.values()].filter(asset => asset.name === name);
  return matches.length === 1 ? matches[0] : undefined;
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
  });
}

export function resolveImages(root, assets) {
  const missing = [];
  for (const image of root.querySelectorAll('img')) {
    const path = image.getAttribute('src') || '';
    image.referrerPolicy = 'no-referrer';
    image.removeAttribute('srcset');
    if (/^https?:\/\//i.test(path)) continue;
    if (/^data:image\/(png|jpeg|webp|gif|avif);base64,/i.test(path)) continue;
    const asset = findImage(path, assets);
    if (asset) image.src = asset.data;
    else {
      missing.push(path || image.alt || '(unnamed image)');
      image.removeAttribute('src');
      const placeholder = document.createElement('span'); placeholder.className = 'missing-image';
      placeholder.textContent = `Image not attached: ${path || image.alt || 'unnamed image'}`;
      image.replaceWith(placeholder);
    }
  }
  return missing;
}

export async function embedRemoteImages(root) {
  const failed = [];
  const images = [...root.querySelectorAll('img')].filter(image => /^https?:\/\//i.test(image.getAttribute('src') || ''));
  await Promise.all(images.map(async image => {
    const url = image.src;
    try {
      const response = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Image download failed');
      const blob = await response.blob();
      if (!/^image\/(png|jpeg|gif|webp|avif)(;|$)/i.test(blob.type)) throw new Error('Unsupported image');
      image.src = await blobToDataURL(blob);
    } catch { failed.push(url); }
  }));
  return failed;
}
