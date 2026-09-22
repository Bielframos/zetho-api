require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client, TablesDB } = require('node-appwrite');
const directory = process.argv[2];
const apply = process.argv[3] === '--apply';
if (!directory || process.argv.length > 4 || (process.argv[3] && !apply)) throw Error('Usage: <verified backup directory> [--apply]');
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
if (manifest.project !== process.env.APPWRITE_PROJECT || manifest.endpoint !== process.env.APPWRITE_ENDPOINT) throw Error('Wrong target project');
const db = new TablesDB(new Client().setEndpoint(manifest.endpoint).setProject(manifest.project).setKey(process.env.APPWRITE_API_KEY));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const clean = permissions => permissions.filter(p => !/^(create|update|delete|write)\(/.test(p));
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

(async()=>{
  const database = await db.get({ databaseId:'app' });
  if (apply && database.enabled) throw Error('Client access must be disabled during permission cutover');
  const plan = [];
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(path.join(directory,file.file));
    if (hash(bytes) !== file.sha256) throw Error(`Backup integrity failed: ${file.tableId}`);
    const backup = JSON.parse(bytes);
    const live = await db.getTable({ databaseId:'app', tableId:file.tableId });
    for (const field of ['name','enabled','rowSecurity','columns','indexes'])
      if (!same(live[field],backup.schema[field])) throw Error(`Schema changed: ${file.tableId}/${field}`);
    const permissions = clean(backup.schema.$permissions);
    if (!same(live.$permissions,backup.schema.$permissions) && !same(live.$permissions,permissions)) throw Error(`Unexpected table grants: ${file.tableId}`);
    const rows = backup.rows.filter(row=>!same(row.$permissions,clean(row.$permissions)));
    plan.push({tableId:file.tableId,live,permissions,rows});
  }
  console.log(JSON.stringify({apply,tables:plan.filter(t=>!same(t.live.$permissions,t.permissions)).map(t=>t.tableId),rows:plan.reduce((n,t)=>n+t.rows.length,0)}));
  if (!apply) return;
  for (const table of plan) {
    if (!same(table.live.$permissions,table.permissions)) {
      // Appwrite defaults omitted rowSecurity to false even on update.
      const updated=await db.updateTable({databaseId:'app',tableId:table.tableId,name:table.live.name,enabled:table.live.enabled,rowSecurity:table.live.rowSecurity,permissions:table.permissions});
      for (const field of ['name','enabled','rowSecurity'])
        if (!same(updated[field],table.live[field])) throw Error(`Table option changed: ${table.tableId}/${field}`);
      if (!same(updated.$permissions,table.permissions)) throw Error(`Table grants mismatch: ${table.tableId}`);
    }
    let count=0;
    for (let offset=0;offset<table.rows.length;offset+=40) {
      const batch=table.rows.slice(offset,offset+40);
      const tx=await db.createTransaction();
      try {
        // Stage every update only after all original grants have been checked.
        const live = await Promise.all(batch.map(row=>db.getRow({databaseId:'app',tableId:table.tableId,rowId:row.$id,transactionId:tx.$id})));
        for(let i=0;i<batch.length;i++) {
          const desired=clean(batch[i].$permissions);
          if(!same(live[i].$permissions,batch[i].$permissions) && !same(live[i].$permissions,desired)) throw Error(`Unexpected row grants: ${table.tableId}/${batch[i].$id}`);
        }
        await Promise.all(batch.map((row,i)=>same(live[i].$permissions,clean(row.$permissions))?Promise.resolve():db.updateRow({databaseId:'app',tableId:table.tableId,rowId:row.$id,permissions:clean(row.$permissions),transactionId:tx.$id})));
        await db.updateTransaction({transactionId:tx.$id,commit:true});
        count+=batch.length;
      } catch(error) { await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});throw error; }
    }
    console.log(JSON.stringify({tableId:table.tableId,reviewedRows:count}));
  }
  console.log('Permission cutover applied; database remains disabled until postcheck.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
