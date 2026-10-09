import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';

const DEFAULT_DB=resolve(process.env.APP_DB_PATH??join(process.cwd(),'storage','app.sqlite'));
const MIGRATIONS=resolve(process.cwd(),'db','migrations');
let db;

export async function database(){
  if(db)return db;
  await mkdir(dirname(DEFAULT_DB),{recursive:true});
  db=new DatabaseSync(DEFAULT_DB);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const sql=await readFile(join(MIGRATIONS,'001_app.sql'),'utf8');
  db.exec(sql);
  db.prepare(`INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(?,?)`).run('001_app',new Date().toISOString());
  return db;
}
export function closeDatabase(){if(db){db.close();db=undefined;}}
