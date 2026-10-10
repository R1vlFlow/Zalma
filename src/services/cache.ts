const DB_NAME='almazov-hub-cache';const STORE='schedule';const VERSION=1;
let activeCacheNamespace='unversioned';
const storageKey=(key:string)=>`${activeCacheNamespace}:${key}`;
export interface CachedPayload{key:string;savedAt:number;payload:unknown;}
const memory=new Map<string,CachedPayload>();
function openDb():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{if(typeof indexedDB==='undefined'){reject(new Error('IndexedDB unavailable'));return;}const req=indexedDB.open(DB_NAME,VERSION);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'key'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function saveCache(key:string,payload:unknown):Promise<void>{const effectiveKey=storageKey(key);const item={key:effectiveKey,savedAt:Date.now(),payload};memory.set(effectiveKey,item);try{const db=await openDb();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(item);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();}catch{try{localStorage.setItem(`cache:${effectiveKey}`,JSON.stringify(item));}catch{ /* quota: memory cache remains available */ }} }
export async function readCache<T=unknown>(key:string,maxAgeMs=1000*60*60*24*14):Promise<CachedPayload|T|null>{const effectiveKey=storageKey(key);const mem=memory.get(effectiveKey);if(mem&&Date.now()-mem.savedAt<=maxAgeMs)return mem as CachedPayload;try{const db=await openDb();const item=await new Promise<any>((resolve,reject)=>{const req=db.transaction(STORE,'readonly').objectStore(STORE).get(effectiveKey);req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error);});db.close();if(item){memory.set(effectiveKey,item);return item;}}catch{/* fallback */}try{const raw=localStorage.getItem(`cache:${effectiveKey}`);if(raw){const item=JSON.parse(raw) as CachedPayload;if(Date.now()-item.savedAt<=maxAgeMs){memory.set(effectiveKey,item);return item;}}}catch{/* malformed cache is ignored */}return null;}
export function clearMemoryCache(){memory.clear();}


/**
 * Invalidate only parser/schedule snapshots when a new deployable build appears.
 * Personalization, homework, profile keys and the separate user-materials DB are
 * intentionally not touched, so a release cannot silently erase user data.
 */
const SCHEDULE_BUILD_KEY='almazov.schedule-cache-build';
export async function ensureScheduleCacheVersion(buildId:string):Promise<boolean>{
  const next=(buildId||'dev').trim()||'dev';
  let previous='';
  try{previous=localStorage.getItem(SCHEDULE_BUILD_KEY)??'';}catch{/* privacy mode */}
  activeCacheNamespace=next;
  if(previous===next)return false;
  memory.clear();
  let db:IDBDatabase|undefined;
  try{
    db=await openDb();
    await new Promise<void>((resolve,reject)=>{
      const tx=db!.transaction(STORE,'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error??new Error('Failed to invalidate schedule cache'));
      tx.onabort=()=>reject(tx.error??new Error('Schedule cache invalidation aborted'));
    });
  }catch{/* Namespace change below makes old IndexedDB rows unreachable if clear fails. */}
  finally{db?.close();}
  try{
    const remove:string[]=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key&&/^cache:(?:snapshot:|raw:|[^:]+:(?:snapshot:|raw:))/.test(key))remove.push(key);
    }
    for(const key of remove)localStorage.removeItem(key);
    localStorage.setItem(SCHEDULE_BUILD_KEY,next);
  }catch{/* Namespace separation still prevents reading a prior build's cache. */}
  if(typeof window!=='undefined')window.dispatchEvent(new Event('schedule-cache-invalidated'));
  return true;
}
