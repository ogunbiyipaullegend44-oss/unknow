import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { attachDatabasePool } from '@neondatabase/functions';
import { Hono, type Context, type Next } from 'hono';
import { cors } from 'hono/cors';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Pool } from 'pg';

type Variables = { userId: string };

const bucket = 'assets';
const authBaseUrl = process.env.NEON_AUTH_BASE_URL;
const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
if (!authBaseUrl || !jwksUrl || !process.env.DATABASE_URL) {
  throw new Error('Neon Auth and Postgres must be enabled for the assets function.');
}

const jwks = createRemoteJWKSet(new URL(jwksUrl));
const database = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(database);

const storage = new S3Client({
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  forcePathStyle: true,
});

const app = new Hono<{ Variables: Variables }>();

app.use('*', cors({
  origin(origin) {
    if (!origin) return undefined;
    try {
      const { hostname, origin: normalizedOrigin } = new URL(origin);
      if (
        normalizedOrigin === 'http://localhost:5173'
        || normalizedOrigin === 'http://127.0.0.1:5173'
        || hostname.endsWith('-ogunbiyipaullegend44-oss.vercel.app')
      ) return origin;
    } catch {
      return undefined;
    }
    return undefined;
  },
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type'],
  maxAge: 600,
}));

app.onError((error, context) => {
  console.error('Neon asset request failed:', error.message);
  return context.json({ error: 'The asset request could not be completed.' }, 500);
});

const authenticate = async (context: Context<{ Variables: Variables }>, next: Next) => {
  const authorization = context.req.header('Authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return context.json({ error: 'Authentication is required.' }, 401);

  try {
    const { payload } = await jwtVerify(match[1], jwks, { issuer: authBaseUrl });
    if (typeof payload.sub !== 'string') {
      return context.json({ error: 'The access token does not contain a user ID.' }, 401);
    }
    context.set('userId', payload.sub);
  } catch {
    return context.json({ error: 'The access token is invalid or expired.' }, 401);
  }
  await next();
};

app.get('/health', (context) => context.json({
  status: 'ok',
  service: 'assets',
  branch: process.env.NEON_BRANCH ?? 'unknown',
}));

app.use('/assets/*', authenticate);
app.use('/account', authenticate);

app.post('/assets/upload/:kind', async (context) => {
  const userId = context.get('userId');
  const kind = context.req.param('kind');
  const contentType = (context.req.header('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  const avatarTypes: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const isAvatar = kind === 'avatar';
  const maxBytes = isAvatar ? 5 * 1024 * 1024 : 512 * 1024;
  if (isAvatar && !avatarTypes[contentType]) {
    return context.json({ error: 'Profile photos must be JPEG, PNG, or WebP.' }, 415);
  }
  if (kind === 'publication' && contentType !== 'text/plain') {
    return context.json({ error: 'Research attachments must be plain text.' }, 415);
  }
  if (!isAvatar && kind !== 'publication') {
    return context.json({ error: 'Unsupported asset type.' }, 400);
  }
  const declaredSize = Number(context.req.header('Content-Length') ?? 0);
  if (declaredSize > maxBytes) return context.json({ error: 'The uploaded file is too large.' }, 413);

  const body = Buffer.from(await context.req.arrayBuffer());
  if (!body.length || body.length > maxBytes) {
    return context.json({ error: 'The uploaded file is empty or too large.' }, body.length ? 413 : 400);
  }

  const extension = isAvatar ? avatarTypes[contentType] : 'txt';
  const key = `${isAvatar ? 'avatars' : 'community'}/${userId}/${crypto.randomUUID()}.${extension}`;
  await storage.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
  return context.json({ key }, 201);
});

app.get('/assets/avatar-url', async (context) => {
  const userId = context.get('userId');
  const key = context.req.query('key') ?? '';
  if (!key.startsWith(`avatars/${userId}/`)) {
    return context.json({ error: 'The profile photo does not belong to this account.' }, 403);
  }
  const url = await getSignedUrl(
    storage,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 3600 },
  );
  return context.json({ url });
});

app.get('/assets/publications/:id/document', async (context) => {
  const userId = context.get('userId');
  const { rows } = await database.query(
    `select document_content, document_object_key
     from public.community_publications
     where id = $1
       and (
         is_published
         or author_id::text = $2
         or exists (
           select 1 from public.community_moderators
           where user_id::text = $2
         )
       )`,
    [context.req.param('id'), userId],
  );
  if (!rows.length) return context.json({ error: 'The publication was not found or is not available.' }, 404);

  const key = rows[0].document_object_key as string;
  const object = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body) return context.json({ error: 'The publication attachment is unavailable.' }, 404);
  const bytes = await object.Body.transformToByteArray();
  return new Response(bytes, {
    headers: {
      'Content-Type': object.ContentType ?? 'text/plain; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

app.delete('/assets', async (context) => {
  const userId = context.get('userId');
  const body = await context.req.json<{ key?: string }>();
  const key = body.key ?? '';
  const ownsAvatar = key.startsWith(`avatars/${userId}/`);
  const ownsPublication = key.startsWith(`community/${userId}/`);
  if (!key || key.length > 500 || key.includes('..') || (!ownsAvatar && !ownsPublication)) {
    return context.json({ error: 'You cannot delete this asset.' }, 403);
  }
  const { rows } = await database.query(
    `select exists (
       select 1
       from public.user_profiles
       where avatar_path = $1 and id::text = $2
       union all
       select 1
       from public.community_publications
       where document_object_key = $1 and author_id::text = $2
     ) as in_use`,
    [key, userId],
  );
  if (rows[0]?.in_use) {
    return context.json({ error: 'This asset is still attached to your profile or a publication.' }, 409);
  }
  await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return context.body(null, 204);
});

export default app;
