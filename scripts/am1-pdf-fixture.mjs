// Synthetic fixtures only. No Production access. Dependencies are test-only.
import { writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { writeArchive, renderImagePage, digest } from '../assets/js/attachment-pdf.mjs';
const { createCanvas, loadImage, GlobalFonts } = await import(pathToFileURL(process.env.PETATOE_AM1_TEST_DEPS + '/@napi-rs/canvas/index.js'));
GlobalFonts.registerFromPath(new URL('../assets/fonts/am1/DejaVuSans.ttf',import.meta.url).pathname,'PETATOEArchive');
const output = process.argv[2]; if(!output)throw Error('Output directory required');
await mkdir(output,{recursive:true});
const source=createCanvas(1100,700),ctx=source.getContext('2d');
ctx.fillStyle='#dbeafe';ctx.fillRect(0,0,1100,700);ctx.fillStyle='#12405d';ctx.fillRect(120,100,860,480);
ctx.font='bold 60px PETATOEArchive';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText('PETATOE TEST IMAGE',550,300);ctx.font='40px PETATOEArchive';ctx.fillText('صورة تجريبية',550,390);
const original=new Uint8Array(await source.encode('png'));
const archive={id:'11111111-1111-4111-8111-111111111111',month:'2026-10',count:2,capturedAt:'2026-11-08T12:00:00Z'};
for(const language of ['ar','en']){
 const chunks=[];
 const result=await writeArchive({archive,sink:{write:async b=>chunks.push(b),close:async()=>{},abort:async()=>{}},
 load:async ordinal=>({bytes:original,item:{ordinal,objectId:'test-image-'+ordinal,objectVersion:'test-v1',sourceMatches:1,uploadTimeEvidence:'metadata.lastModified',fileName:ordinal===1?'صورة إيصال تجريبية.png':'A very long reference image name for a synthetic customer test.png',bucket:'installation-evidence',path:`synthetic/image-${ordinal}.png`,mimeType:'image/png',bytes:original.length,uploadedAt:'2026-10-31T20:59:59Z',firstUploadedAt:'2026-10-31T20:59:59Z',recordedAt:'2026-10-31T20:59:59Z',uploader:{name:'مسؤول الاختبار / Test Administrator',id:'uploader-test-id'},uploaderEvidence:'attachment_uploader',customer:{name:'عميل تجريبي / Synthetic Customer',id:'customer-test-id'},reference:'TEST-001',source:'installation_execution_files',metadata:{attachment:{file_kind:'collection',notes:'اختبار وضوح النص العربي والإنجليزي دون حذف أي معلومات. All details are preserved.'},relatedRecord:{request_number:'TEST-001',customer_id:'customer-test-id',created_at:'2026-10-31T20:59:59Z'},storage:{version:'test-v1',original_checksum:digest(original)}}}}),
 render:(item,bytes)=>renderImagePage(item,bytes,{language,canvasFactory:createCanvas,decode:b=>loadImage(Buffer.from(b))})});
 await writeFile(`${output}/AM1-TEST-${language}.pdf`,Buffer.concat(chunks));
 await writeFile(`${output}/AM1-TEST-${language}.json`,JSON.stringify(result,null,2));
}
console.log('Generated two synthetic PDFs, two pages each.');
