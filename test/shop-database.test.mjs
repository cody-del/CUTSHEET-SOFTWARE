import test from 'node:test';
import assert from 'node:assert/strict';
import {createSecureContext,rootCertificates} from 'node:tls';
import {Client} from 'pg';
import {databaseOptions} from '../shop-database.mjs';
import supabaseCA from '../source/supabase-ca.json' with {type:'json'};

const url='postgresql://postgres.example@pooler.example.com:6543/postgres?sslmode=verify-full';

test('pg receives the separate database password intact, including URL punctuation',()=>{
  const password='test-only:@/?#%&+ space';
  const parsed=new Client(databaseOptions({CUTSHEET_DATABASE_URL:url,CUTSHEET_DATABASE_PASSWORD:password})).connectionParameters;
  assert.equal(parsed.password,password);
  assert.equal(parsed.user,'postgres.example');
  assert.equal(parsed.host,'pooler.example.com');
  assert.equal(parsed.port,6543);
  assert.equal(parsed.database,'postgres');
});

test('custom database CA survives pg URL parsing and requires certificate and hostname validation',()=>{
  for(const mode of ['verify-full','no-verify','disable']){
    const options=databaseOptions({CUTSHEET_DATABASE_URL:url.replace('verify-full',mode)+'&ssl=false&sslrootcert=/does-not-exist',CUTSHEET_DATABASE_CA:rootCertificates[0].replace(/\n/g,'\\n')});
    const {ssl}=new Client(options).connectionParameters;
    assert.equal(ssl.ca,rootCertificates[0]);
    assert.equal(ssl.rejectUnauthorized,true);
    assert.equal(ssl.checkServerIdentity,undefined);
    assert.doesNotThrow(()=>createSecureContext(ssl));
  }
});

test('database configuration preserves existing URL credentials and Netlify fallback',()=>{
  assert.equal(databaseOptions({}),null);
  const options=databaseOptions({NETLIFY_DB_URL:'postgres://user:existing%40password@db.example/db?sslmode=verify-full'});
  const parsed=new Client(options).connectionParameters;
  assert.equal(parsed.password,'existing@password');
  assert.equal(parsed.database,'db');
  assert.notEqual(parsed.ssl,false);
  assert.equal(options.max,2);
});

test('Supabase pooler automatically uses its bundled public CA with full verification',()=>{
  const options=databaseOptions({CUTSHEET_DATABASE_URL:'postgresql://postgres.project@aws-1-ca-central-1.pooler.supabase.com:6543/postgres?sslmode=verify-full'});
  const {ssl}=new Client(options).connectionParameters;
  assert.equal(ssl.ca,supabaseCA.certificate);
  assert.equal(ssl.rejectUnauthorized,true);
  assert.doesNotThrow(()=>createSecureContext(ssl));
  assert.equal(databaseOptions({CUTSHEET_DATABASE_URL:'postgresql://user@pooler.supabase.com.example/db'}).ssl,undefined);
});

test('invalid database URL errors never include the submitted credential',()=>{
  for(const value of ['password-secret','https://user:password-secret@example.com/db']){
    assert.throws(()=>databaseOptions({CUTSHEET_DATABASE_URL:value}),error=>error.message.includes('URL is invalid')&&!error.message.includes('password-secret'));
  }
});
