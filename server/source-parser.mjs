import {parseOfficialPdf} from './pdf-adapter.mjs';
import {parseOfficialXlsx} from './xlsx-adapter.mjs';
import {parseHtmlSchedule} from './html-adapter.mjs';

function looksLikePdf(buffer){return buffer.subarray(0,5).toString('ascii') === '%PDF-';}
function looksLikeZip(buffer){const a=buffer[0],b=buffer[1],c=buffer[2],d=buffer[3];return a===0x50&&b===0x4b&&((c===0x03&&d===0x04)||(c===0x05&&d===0x06)||(c===0x07&&d===0x08));}
function looksLikeCompoundDoc(buffer){return buffer.subarray(0,8).equals(Buffer.from([0xD0,0xCF,0x11,0xE0,0xA1,0xB1,0x1A,0xE1]));}
function looksLikeHtml(buffer){const head=buffer.subarray(0,8192).toString('utf8').toLowerCase();return /<\s*(?:!doctype\s+html|html\b|table\b|tr\b|td\b|th\b)/.test(head);}

export function detectSourceFormats(buffer, declared='html'){
  const detected=[];
  if(looksLikePdf(buffer))detected.push('pdf');
  if(looksLikeZip(buffer)||looksLikeCompoundDoc(buffer))detected.push('xlsx');
  if(looksLikeHtml(buffer))detected.push('html');
  if(!detected.length)detected.push(declared);
  const rest=['pdf','xlsx','html'].filter(x=>!detected.includes(x));
  return [...detected,...rest];
}

export async function parseSourceBuffer(buffer,args,declared){
  const order=detectSourceFormats(buffer,declared);
  let best=null;const attempts=[];
  for(const kind of order){
    try{
      const result=kind==='pdf'
        ? await parseOfficialPdf(buffer,args)
        : kind==='xlsx'
          ? await parseOfficialXlsx(buffer,args)
          : parseHtmlSchedule(buffer.toString('utf8'),args);
      const score=(result.events?.length??0)*10-(result.warnings?.length??0);
      attempts.push({kind,events:result.events?.length??0,warnings:result.warnings?.length??0});
      if(!best||score>best.score)best={result,kind,score};
      if((result.events?.length??0)>0 && kind===order[0])break;
    }catch(error){
      attempts.push({kind,error:error instanceof Error?error.message:String(error)});
    }
  }
  if(!best)throw new Error(`Не удалось распознать источник расписания. Попытки: ${JSON.stringify(attempts)}`);
  if(best.kind!==declared){best.result.warnings=[...(best.result.warnings??[]),`Fallback parser: заявлен ${declared}, фактически выбран ${best.kind}.`];}
  return {...best.result,detectedKind:best.kind,attempts};
}
