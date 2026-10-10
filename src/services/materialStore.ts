export type MaterialFileCategory = 'lecture' | 'practice' | 'lab' | 'book' | 'link';
export interface FileMaterial {
  id: string;
  title: string;
  subject: string;
  category: MaterialFileCategory;
  description: string;
  tags: string[];
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  program: string;
  course: number;
  group: string;
  scope: string;
  blob: Blob;
}

const DB_NAME = 'almazov-materials';
const DB_VERSION = 1;
const STORE = 'files';
export const MAX_MATERIAL_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['pdf', 'docx', 'xlsx', 'pptx', 'zip', 'jpg', 'jpeg', 'png']);

export function materialScope(program: string, course: number, group: string): string {
  return `${program}:${course}:${group.trim().toLocaleLowerCase('ru-RU')}`;
}

export function isAllowedMaterialFile(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_EXTENSIONS.has(extension) && file.size > 0 && file.size <= MAX_MATERIAL_FILE_SIZE;
}

function openDb(): Promise<IDBDatabase> {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('IndexedDB недоступен в этом браузере.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('scope', 'scope', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть базу материалов.'));
    request.onblocked = () => reject(new Error('База материалов занята другой вкладкой. Закройте старые вкладки и повторите.'));
  });
}

function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Ошибка базы материалов.')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Операция с материалом отменена.')); };
    action(tx.objectStore(STORE), resolve, reject);
  }));
}

export function listFileMaterials(scope: string): Promise<FileMaterial[]> {
  return transaction('readonly', (store, resolve, reject) => {
    const request = store.index('scope').getAll(scope);
    request.onsuccess = () => resolve((request.result as FileMaterial[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    request.onerror = () => reject(request.error);
  });
}

export function saveFileMaterial(input: Omit<FileMaterial, 'id' | 'fileName' | 'mimeType' | 'size' | 'createdAt' | 'blob'> & { file: File }): Promise<FileMaterial> {
  if (!isAllowedMaterialFile(input.file)) return Promise.reject(new Error('Файл должен быть PDF, DOCX, XLSX, PPTX, ZIP, JPG или PNG и не превышать 25 МБ.'));
  const record: FileMaterial = {
    id: `file-${crypto.randomUUID()}`,
    title: input.title.trim().slice(0, 180), subject: input.subject.slice(0, 180), category: input.category,
    description: input.description.trim().slice(0, 1000), tags: input.tags.slice(0, 12).map(x => x.slice(0, 40)),
    fileName: input.file.name.slice(0, 240), mimeType: input.file.type || 'application/octet-stream', size: input.file.size,
    createdAt: new Date().toISOString(), program: input.program, course: input.course, group: input.group,
    scope: input.scope, blob: input.file.slice(0, input.file.size, input.file.type || 'application/octet-stream')
  };
  if (record.title.length < 2) return Promise.reject(new Error('Укажите название материала длиной не менее 2 символов.'));
  return transaction('readwrite', (store, resolve, reject) => {
    const request = store.add(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error ?? new Error('Не удалось сохранить файл. Проверьте свободное место в браузере.'));
  });
}

export function deleteFileMaterial(id: string): Promise<void> {
  return transaction('readwrite', (store, resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function getFileMaterial(id: string): Promise<FileMaterial | null> {
  return transaction('readonly', (store, resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve((request.result as FileMaterial | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}
