let app;
try {
  const mod = await import('./dist/index.js');
  app = mod.default || mod.app;
} catch {
  try {
    const mod = await import('./src/index.ts');
    app = mod.default || mod.app;
  } catch {
    const mod = await import('./src/index.js');
    app = mod.default || mod.app;
  }
}

export { app };
export default app;
