import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {join,normalize as normalizePath,extname} from 'node:path';
import {loadSchedule} from './pipeline.mjs';
import {parseSourceBuffer} from './source-parser.mjs';
import {createEvent,updateEvent,deleteEvent,listEvents} from './events.mjs';
import {listTickets,getTicket,createTicket,addMessage,readAttachment} from './support.mjs';
import {readFile as readFileAttachment} from 'node:fs/promises';

const ROOT=join(process.cwd(),'dist');const MAX_BODY=15*1024*1024;const rateBuckets=new Map();
const TYPES={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json;charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain;charset=utf-8'};
function send(res,status,body,type='application/json;charset=utf-8',extra={}){
 const isMutableData=type.includes('application/json')||type==='application/manifest+json'||type==='text/html;charset=utf-8';
 const cacheable=status===200&&!isMutableData;
 const headers={'content-type':type,'cache-control':isMutableData?'no-cache, no-store, must-revalidate':cacheable?'public, max-age=3600, stale-while-revalidate=86400':'no-store','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-frame-options':'SAMEORIGIN','permissions-policy':'geolocation=(),camera=(),microphone=()','content-security-policy':"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://raw.githubusercontent.com; worker-src 'self'; manifest-src 'self'",...extra};
 if(isMutableData){headers.pragma='no-cache';headers.expires='0';}
 res.writeHead(status,headers);res.end(body);
}
function json(res,status,payload){return send(res,status,JSON.stringify(payload));}
function clientKey(req){return `${req.socket.remoteAddress??'unknown'}:${req.headers['x-forwarded-for']??''}`;}
function allowRate(req,key,limit,windowMs){const now=Date.now(),bucketKey=`${key}:${clientKey(req)}`,current=rateBuckets.get(bucketKey);if(!current||now-current.startedAt>=windowMs){rateBuckets.set(bucketKey,{startedAt:now,count:1});return true;}if(current.count>=limit)return false;current.count++;return true;}
function headerUser(req){return String(req.headers['x-user-id']??'').trim();}
async function readJson(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw Object.assign(new Error('Тело запроса слишком большое'),{statusCode:413});chunks.push(chunk);}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('Некорректный JSON'),{statusCode:400});}}
setInterval(()=>{const cutoff=Date.now()-10*60*1000;for(const [k,v] of rateBuckets)if(v.startedAt<cutoff)rateBuckets.delete(k);},60*1000).unref();
function safeFile(urlPath){const rel=urlPath==='/'?'index.html':urlPath.replace(/^\/+/, '');const file=normalizePath(join(ROOT,rel));return file===ROOT||file.startsWith(`${ROOT}/`)?file:null;}
const server=createServer(async(req,res)=>{try{
  const u=new URL(req.url??'/',`http://${req.headers.host??'localhost'}`);
  if(u.pathname==='/api/health'){if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});return json(res,200,{ok:true,service:'almazov-schedule-hub',time:new Date().toISOString()});}
  if(u.pathname==='/api/schedule'&&req.method==='GET'){
    if(!allowRate(req,'schedule',120,60_000))return json(res,429,{error:'Слишком много запросов. Повторите позже.'});
    const program=u.searchParams.get('program');const course=Number(u.searchParams.get('course'));
    if(!['31.05.01','31.05.02','37.05.01'].includes(program)||course<1||course>6)return json(res,400,{error:'Некорректная программа или курс'});
    const result=await loadSchedule(program,course);return json(res,200,result);
  }
  if(u.pathname==='/api/events'&&req.method==='GET'){
    if(!allowRate(req,'events',180,60_000))return json(res,429,{error:'Слишком много запросов. Повторите позже.'});
    const user=headerUser(req);const from=u.searchParams.get('from');const to=u.searchParams.get('to');const status=u.searchParams.get('status')??undefined;const category=u.searchParams.get('category')??undefined;const events=await listEvents(user,from,to,{status,category});return json(res,200,{events});
  }
  if(u.pathname==='/api/events'&&req.method==='POST'){
    if(!allowRate(req,'event-write',60,60_000))return json(res,429,{error:'Слишком много изменений. Повторите позже.'});
    const user=headerUser(req);const body=await readJson(req);const created=await createEvent(user,body);return json(res,201,{event:created});
  }
  const eventMatch=u.pathname.match(/^\/api\/events\/([^/]+)$/);
  if(eventMatch&&req.method==='PUT'){
    if(!allowRate(req,'event-write',60,60_000))return json(res,429,{error:'Слишком много изменений. Повторите позже.'});
    const user=headerUser(req);const body=await readJson(req);const scope=String(body.scope??'series');delete body.scope;const event=await updateEvent(user,eventMatch[1],body,scope);return json(res,200,{event});
  }
  if(eventMatch&&req.method==='DELETE'){
    if(!allowRate(req,'event-write',60,60_000))return json(res,429,{error:'Слишком много изменений. Повторите позже.'});
    const user=headerUser(req);const scope=u.searchParams.get('scope')??'series';return json(res,200,await deleteEvent(user,eventMatch[1],scope));
  }
  if(u.pathname==='/api/support/tickets'&&req.method==='GET')return json(res,200,{tickets:await listTickets(headerUser(req))});
  if(u.pathname==='/api/support/tickets'&&req.method==='POST'){
    if(!allowRate(req,'support-write',15,60*60_000))return json(res,429,{error:'Слишком много обращений. Повторите позже.'});
    return json(res,201,{ticket:await createTicket(headerUser(req),await readJson(req))});
  }
  const ticketMatch=u.pathname.match(/^\/api\/support\/tickets\/([^/]+)$/);
  if(ticketMatch&&req.method==='GET')return json(res,200,{ticket:await getTicket(headerUser(req),ticketMatch[1])});
  const ticketMsgMatch=u.pathname.match(/^\/api\/support\/tickets\/([^/]+)\/messages$/);
  if(ticketMsgMatch&&req.method==='POST')return json(res,201,{ticket:await addMessage(headerUser(req),ticketMsgMatch[1],(await readJson(req)).body)});
  const attachMatch=u.pathname.match(/^\/api\/support\/attachments\/([^/]+)$/);
  if(attachMatch&&req.method==='GET'){
    const owner=headerUser(req);const row=await readAttachment(owner,attachMatch[1]);const file=join(process.env.APP_ATTACHMENTS_DIR??join(process.cwd(),'storage','attachments'),row.storage_name);const buf=await readFileAttachment(file);return send(res,200,buf,row.mime_type,{'content-disposition':`attachment; filename="${row.original_name.replace(/"/g,'')}"`});
  }
  if(u.pathname==='/api/import'&&req.method==='POST'){
    if(!allowRate(req,'import',10,10*60_000))return json(res,429,{error:'Слишком много импортов. Повторите позже.'});
    const contentLength=Number(req.headers['content-length']??0);if(Number.isFinite(contentLength)&&contentLength>MAX_BODY)return json(res,413,{error:'Файл слишком большой'});
    const fileName=(req.headers['x-file-name']??'upload.bin').toString();const program=u.searchParams.get('program');const course=Number(u.searchParams.get('course'));if(!['31.05.01','31.05.02','37.05.01'].includes(program)||course<1||course>6)return json(res,400,{error:'program/course required'});
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw Object.assign(new Error('Файл слишком большой'),{statusCode:413});chunks.push(chunk);}const data=Buffer.concat(chunks);const ext=extname(fileName).toLowerCase();const declared=ext==='.pdf'?'pdf':(ext==='.xlsx'||ext==='.xls')?'xlsx':(ext==='.html'||ext==='.htm')?'html':null;if(!declared)return json(res,415,{error:'Поддерживаются PDF, XLSX/XLS и HTML'});
    const source={url:'upload://local',title:`Локальный импорт: ${fileName}`,program,course,stream:null};const parsed=await parseSourceBuffer(data,{program,course,source},declared);const valid=parsed.events.filter(e=>e.date&&e.start&&e.end&&e.subject&&e.group);return json(res,200,{status:valid.length?'partial':'error',events:valid,issues:parsed.warnings??[],message:`Импортировано кандидатов: ${valid.length}. Перед публикацией запустите validate/commit.`,file:fileName});
  }
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  const file=safeFile(decodeURIComponent(u.pathname));if(!file)return json(res,403,{error:'Forbidden'});let info;try{info=await stat(file);}catch{return json(res,404,{error:'Not found'});}const body=await readFile(info.isDirectory()?join(file,'index.html'):file);return send(res,200,body,TYPES[extname(file)]??'application/octet-stream');
}catch(err){const status=Number(err?.statusCode??500);return json(res,status,{error:err instanceof Error?err.message:'Internal server error'});}});
const port=Number(process.env.PORT??4173);const host=process.env.HOST??'0.0.0.0';server.listen(port,host);
