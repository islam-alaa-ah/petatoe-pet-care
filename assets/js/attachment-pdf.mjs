import { sha256 } from '../vendor/noble-hashes-2.0.1/sha2.js';
const utf8 = new TextEncoder();
let archiveFont;
async function ensureFont() {
  if (typeof document === 'undefined') return;
  if (!archiveFont) archiveFont=(async()=>{
    if (typeof FontFace !== 'function' || !document.fonts) throw new Error('AM1_FONT_UNAVAILABLE');
    const font=new FontFace('PETATOEArchive', `url("${new URL('../fonts/am1/DejaVuSans.ttf',import.meta.url)}")`);
    await font.load();document.fonts.add(font);
    await document.fonts.load('24px PETATOEArchive');
    if(!document.fonts.check('24px PETATOEArchive'))throw new Error('AM1_FONT_UNAVAILABLE');
  })().catch(()=>{archiveFont=null;throw new Error('AM1_FONT_UNAVAILABLE');});
  return archiveFont;
}
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const ascii = value => String(value).replace(/[^\x20-\x7e]/g, '_').replace(/[\\()]/g, '\\$&');
const utf16 = value => 'FEFF' + Array.from(String(value), c => {
  const b = [];
  for (let i = 0; i < c.length; i++) b.push(c.charCodeAt(i).toString(16).padStart(4, '0'));
  return b.join('');
}).join('');
export function digest(bytes) { return hex(sha256(bytes)); }
export async function hashFile(file, signal) {
  const h = sha256.create();
  const reader = file.stream().getReader();
  try {
    while (true) {
      if (signal?.aborted) throw new Error('AM1_CANCELLED');
      const { done, value } = await reader.read();
      if (done) break;
      h.update(value);
    }
    return hex(h.digest());
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

// A deliberately small PDF 1.7 writer. Sequential writes keep memory proportional
// to one original + one rendered page, even for a large monthly archive.
// Every page includes its original image AND complete UTF-8 JSON as embedded files.
export async function writeArchive({ archive, load, render, sink, progress = () => {}, signal }) {
  let size = 0;
  const hash = sha256.create();
  const offsets = [0];
  const pages = [];
  const embedded = [];
  const originals = [];
  let nextId = 4; // Catalog, page tree, embedded-files name tree.
  const check = () => { if (signal?.aborted) throw new Error('AM1_CANCELLED'); };
  const write = async chunk => {
    check();
    const bytes = typeof chunk === 'string' ? utf8.encode(chunk) : chunk;
    await sink.write(bytes);
    hash.update(bytes); size += bytes.length;
    if (size > 4294967296) throw new Error('AM1_EXPORT_TOO_LARGE');
  };
  const object = async (id, body) => { offsets[id] = size; await write(`${id} 0 obj\n${body}\nendobj\n`); };
  const stream = async (id, dictionary, bytes) => {
    offsets[id] = size;
    await write(`${id} 0 obj\n<< ${dictionary} /Length ${bytes.length} >>\nstream\n`);
    await write(bytes); await write('\nendstream\nendobj\n');
  };
  const attach = async (name, originalName, data, mime) => {
    const streamId = nextId++, specId = nextId++;
    const subtype = String(mime || 'application/octet-stream').replace(/[^A-Za-z0-9.-]/g, c => '#' + c.charCodeAt(0).toString(16).padStart(2, '0'));
    await stream(streamId, `/Type /EmbeddedFile /Subtype /${subtype} /Params << /Size ${data.length} >>`, data);
    await object(specId, `<< /Type /Filespec /F (${ascii(name)}) /UF <${utf16(originalName)}> /EF << /F ${streamId} 0 R >> /AFRelationship /Source >>`);
    embedded.push({ name, specId });
    return specId;
  };
  try {
    await write('%PDF-1.7\n%\u00e2\u00e3\u00cf\u00d3\n');
    for (let ordinal = 1; ordinal <= archive.count; ordinal++) {
      check();
      progress({ ordinal, total: archive.count, stage: 'image' });
      const { item, bytes } = await load(ordinal, signal);
      check();
      if (!(bytes instanceof Uint8Array) || !bytes.length || item.ordinal !== ordinal) throw new Error('AM1_IMAGE_UNAVAILABLE');
      // Never embed signed credentials or URLs in the long-lived archive.
      const { signedUrl, ...metadata } = item;
      const originalSha256 = digest(bytes);
      const name = `image-${String(ordinal).padStart(5, '0')}`;
      const documentMetadata = { ...metadata, format: 'PETATOE-AM1', schemaRevision: 'AM1R1', archiveId: archive.id, month: archive.month, totalImages: archive.count, capturedAt: archive.capturedAt, timezone: 'Asia/Riyadh', ordinal, originalSha256 };
      const page = await render(documentMetadata, bytes, signal);
      check();
      if (!page.jpeg?.length || page.width < 1 || page.height < 1) throw new Error('AM1_IMAGE_UNSUPPORTED');
      const origSpec = await attach(name + '.original', item.fileName || name, bytes, item.mimeType);
      const metaSpec = await attach(name + '.json', name + '.json', utf8.encode(JSON.stringify(documentMetadata, null, 2)), 'application/json');
      const imageId = nextId++, contentId = nextId++, pageId = nextId++;
      await stream(imageId, `/Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, page.jpeg);
      const w = 595.276, h = Math.round(w * page.height / page.width * 1000) / 1000;
      await stream(contentId, '', utf8.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`));
      await object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R /AF [${origSpec} 0 R ${metaSpec} 0 R] >>`);
      pages.push(pageId);
      originals.push({ ordinal, sha256: originalSha256 });
      progress({ ordinal, total: archive.count, stage: 'written', bytes: size });
    }
    await object(3, `<< /Names [${embedded.sort((a,b) => a.name.localeCompare(b.name)).map(x => `(${ascii(x.name)}) ${x.specId} 0 R`).join(' ')}] >>`);
    await object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map(id => `${id} 0 R`).join(' ')}] >>`);
    await object(1, '<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles 3 0 R >> >>');
    const xref = size;
    await write(`xref\n0 ${nextId}\n0000000000 65535 f \n`);
    for (let i = 1; i < nextId; i++) {
      if (!Number.isInteger(offsets[i])) throw new Error('AM1_PDF_INCOMPLETE');
      await write(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
    }
    await write(`trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    check();
    await sink.close();
    return { sha256: hex(hash.digest()), bytes: size, originals };
  } catch (error) {
    await sink.abort?.().catch(() => {});
    throw error;
  }
}

export function metadataRows(item, language = 'ar') {
  const en = language === 'en';
  const date = v => v ? new Intl.DateTimeFormat(en ? 'en-GB' : 'ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'full', timeStyle: 'long', timeZone: 'Asia/Riyadh' }).format(new Date(v)) : (en ? 'Not recorded' : 'غير مسجل');
  const missing = en ? 'Not recorded' : 'غير مسجل';
  const rows = [
    [en ? 'File name' : 'اسم الملف', item.fileName],
    [item.uploaderEvidence === 'storage_owner' ? (en ? 'Storage owner (uploader not recorded)' : 'مالك الملف في التخزين (رافع الصورة غير مسجل)') : (en ? 'Uploaded by (recorded)' : 'رفع بواسطة (حسب السجل)'), item.uploader?.name || missing],
    [en ? 'Uploader ID' : 'معرّف رافع الصورة', item.uploader?.id || missing],
    [en ? 'Content upload / replacement' : 'رفع محتوى الصورة / استبداله', date(item.uploadedAt)],
    [en ? 'Upload time source' : 'مصدر وقت الرفع', item.uploadTimeEvidence || missing],
    [en ? 'Physical content version' : 'نسخة محتوى الصورة', item.objectVersion || missing],
    [en ? 'First Storage upload' : 'أول رفع إلى التخزين', date(item.firstUploadedAt)],
    [en ? 'Attachment recorded at' : 'تاريخ تسجيل المرفق', date(item.recordedAt)],
    [en ? 'Customer' : 'العميل', item.customer?.name || missing],
    [en ? 'Customer ID' : 'معرّف العميل', item.customer?.id || missing],
    [en ? 'Reference' : 'المرجع', item.reference || missing],
    [en ? 'Section' : 'القسم', item.source],
    [en ? 'Source record matches' : 'عدد سجلات الربط', item.sourceMatches ?? missing],
    [en ? 'Deletion protection' : 'سبب الحماية من المسح', item.protectionReason || (en ? 'Not protected' : 'غير محمية')],
    [en ? 'Size / type' : 'الحجم / الصيغة', `${item.bytes} bytes / ${item.mimeType}`],
    [en ? 'Storage bucket / path' : 'مسار التخزين', `${item.bucket} / ${item.path}`],
    [en ? 'Original SHA-256' : 'بصمة الأصل SHA-256', item.originalSha256]
  ];
  const flatten = (value, path) => {
    if (value && typeof value === 'object') {
      const entries = Object.entries(value);
      if (!entries.length) rows.push([path, Array.isArray(value) ? '[]' : '{}']);
      for (const [k, v] of entries) flatten(v, path ? `${path}.${k}` : k);
    } else rows.push([path, value === null ? 'null' : String(value)]);
  };
  flatten(item.metadata, en ? 'Details' : 'التفاصيل');
  return rows.map(([k,v]) => [k, String(v ?? missing)]);
}

export function wrapText(context, text, width) {
  // Code points avoid cutting surrogate pairs; every character is preserved.
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const c of Array.from(paragraph)) {
      if (line && context.measureText(line + c).width > width) { lines.push(line); line = ''; }
      line += c;
    }
    lines.push(line);
  }
  return lines;
}

export async function renderImagePage(item, bytes, { language = 'ar', canvasFactory, decode } = {}) {
  await ensureFont();
  const en = language === 'en';
  const create = canvasFactory || ((w,h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
  const image = await (decode ? decode(bytes, item.mimeType) : createImageBitmap(new Blob([bytes], { type: item.mimeType || 'application/octet-stream' })));
  try {
    const width = 1654, pad = 80, imageHeight = 1380, lineHeight = 33;
    const measure = create(width, 1).getContext('2d');
    const font = '24px PETATOEArchive, Arial, sans-serif';
    measure.font = font;
    const lines = metadataRows(item, language).flatMap(([k,v]) => wrapText(measure, `${k}: ${v}`, width - pad * 2));
    const height = Math.max(2339, 210 + imageHeight + lines.length * lineHeight + 140);
    // Fail the whole archive rather than clipping data or silently skipping a page.
    if (height > 15000 || image.width * image.height > 100000000) throw new Error('AM1_IMAGE_UNSUPPORTED');
    const canvas = create(width, height), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#10283e'; ctx.fillRect(0, 0, width, 130);
    ctx.font = 'bold 38px PETATOEArchive, Arial, sans-serif'; ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left'; ctx.fillText('PETATOE', pad, 63);
    ctx.font = '25px PETATOEArchive, Arial, sans-serif'; ctx.textAlign = 'right'; ctx.direction = en ? 'ltr' : 'rtl';
    ctx.fillText(en ? 'Monthly Attachment Archive' : 'أرشيف المرفقات الشهري', width-pad, 63);
    ctx.font = '20px PETATOEArchive, Arial, sans-serif'; ctx.direction = 'ltr';
    ctx.fillText(`${item.month} | ${item.ordinal} | ${item.archiveId}`, width-pad, 108);
    const scale = Math.min((width - pad*2) / image.width, imageHeight / image.height);
    const iw = image.width*scale, ih = image.height*scale;
    ctx.drawImage(image, (width-iw)/2, 170+(imageHeight-ih)/2, iw, ih);
    let y = 210 + imageHeight;
    ctx.font = font; ctx.fillStyle = '#162536';
    for (const line of lines) {
      const rtl = /[\u0600-\u06ff]/.test(line);
      ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = rtl ? 'right' : 'left';
      ctx.fillText(line, rtl ? width-pad : pad, y); y += lineHeight;
    }
    ctx.fillStyle = '#586c7c'; ctx.font = '20px PETATOEArchive, Arial, sans-serif'; ctx.direction = en ? 'ltr' : 'rtl'; ctx.textAlign = 'center';
    ctx.fillText(en ? 'Original image and complete metadata are embedded as PDF attachments.' : 'أصل الصورة وكل بياناتها محفوظان كمرفقات داخل هذا الملف.', width/2, height-45);
    const jpeg = canvas.encode ? new Uint8Array(await canvas.encode('jpeg', 94)) : new Uint8Array(await (await new Promise((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('AM1_IMAGE_UNSUPPORTED')), 'image/jpeg', .94))).arrayBuffer());
    canvas.width = 1; canvas.height = 1;
    return { jpeg, width, height };
  } finally { image.close?.(); }
}
