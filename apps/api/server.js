let app;
try {
  const mod = await import('./dist/server.js');
  app = mod.default || mod.app;
} catch {
  try {
    const mod = await import('./src/server.ts');
    app = mod.default || mod.app;
  } catch {
    const mod = await import('./src/server.js');
    app = mod.default || mod.app;
  }
}

export { app };
export default app;
