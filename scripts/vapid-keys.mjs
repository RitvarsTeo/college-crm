// Makes the VAPID key pair Intake's call notifications need (Q6, src/webpush.js).
//
//   node scripts/vapid-keys.mjs
//
// Run it ONCE, on your own machine, and paste the three lines into Vercel -> Settings ->
// Environment Variables (Production), marking VAPID_PRIVATE_KEY as Sensitive. Nothing is saved
// anywhere by this script. Never paste the private key into a chat, a file or a commit.
// Changing the keys later unsubscribes every browser; they subscribe again on their next visit.

import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);

console.log('VAPID_PUBLIC_KEY=' + b64u(raw));
console.log('VAPID_PRIVATE_KEY=' + priv.d);
console.log('VAPID_SUBJECT=mailto:ritvars.vilcins@novikontas.org');
