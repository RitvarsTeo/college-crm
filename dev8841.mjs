process.env.PORT = '8841';
process.env.CRM_INSECURE_COOKIE = '1';
await import('./src/server.js');
