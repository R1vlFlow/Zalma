export class RedisScheduleCache{
  constructor(client){this.client=client;}
  async get(key){try{const raw=await this.client.get(`almazov:${key}`);return raw?JSON.parse(raw):null;}catch{return null;}}
  async set(key,value,ttlMs){try{await this.client.set(`almazov:${key}`,JSON.stringify(value),{PX:ttlMs});}catch{}return value;}
}
