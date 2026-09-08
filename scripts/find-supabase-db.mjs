import pg from 'pg';
import dns from 'node:dns';
import { promisify } from 'node:util';

const resolve6 = promisify(dns.resolve6);
const pw = process.env.SUPABASE_DB_PASSWORD;
const ref = 'ecrgipyebbgrvmkntxqe';

const attempts = [
  {
    label: 'pooler-west2-6543-postgres.ref',
    config: {
      host: 'aws-0-us-west-2.pooler.supabase.com',
      port: 6543,
      user: `postgres.${ref}`,
      password: pw,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
    },
  },
  {
    label: 'pooler-west2-5432-postgres.ref',
    config: {
      host: 'aws-0-us-west-2.pooler.supabase.com',
      port: 5432,
      user: `postgres.${ref}`,
      password: pw,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
    },
  },
  {
    label: 'pooler-west2-6543-postgres',
    config: {
      host: 'aws-0-us-west-2.pooler.supabase.com',
      port: 6543,
      user: 'postgres',
      password: pw,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
    },
  },
  {
    label: 'pooler-west2-5432-postgres',
    config: {
      host: 'aws-0-us-west-2.pooler.supabase.com',
      port: 5432,
      user: 'postgres',
      password: pw,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
    },
  },
];

try {
  const addrs = await resolve6(`db.${ref}.supabase.co`);
  console.log('ipv6', addrs);
  for (const addr of addrs) {
    attempts.push({
      label: `direct-ipv6-${addr}`,
      config: {
        host: addr,
        port: 5432,
        user: 'postgres',
        password: pw,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
      },
    });
  }
} catch (err) {
  console.log('ipv6 resolve fail', err.message);
}

for (const attempt of attempts) {
  const client = new pg.Client({ ...attempt.config, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    const r = await client.query('select current_user as usr, inet_server_addr() as addr');
    console.log('CONNECTED', attempt.label, r.rows[0]);
    await client.end();
    process.exit(0);
  } catch (err) {
    console.log('FAIL', attempt.label, err.code || '', err.message.slice(0, 160));
    try {
      await client.end();
    } catch {
      // ignore
    }
  }
}

process.exit(1);
