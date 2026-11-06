import crypto from 'node:crypto';

let argon2Module: typeof import('argon2') | null = null;
let argon2LoadAttempted = false;

async function getArgon2(): Promise<typeof import('argon2') | null> {
  if (argon2LoadAttempted) {
    return argon2Module;
  }
  argon2LoadAttempted = true;
  try {
    const mod = await import('argon2');
    argon2Module = mod.default ?? mod;
  } catch {
    argon2Module = null;
  }
  return argon2Module;
}

/**
 * Hashes a plaintext password using Argon2id algorithm when native bindings
 * are available, or standard PBKDF2 with SHA-512 fallback for serverless environments.
 */
export async function hashPassword(password: string): Promise<string> {
  const argon = await getArgon2();
  if (argon) {
    return argon.hash(password, {
      type: argon.argon2id,
      memoryCost: 19456, // 19 MiB recommended by OWASP
      timeCost: 2,
      parallelism: 1,
    });
  }

  // Fallback PBKDF2 for serverless environments without C++ native addon
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `pbkdf2$${salt}$${derived}`;
}

/**
 * Verifies a plaintext password against an Argon2 hash or PBKDF2 fallback.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    if (hash.startsWith('$argon2')) {
      const argon = await getArgon2();
      if (argon) {
        return await argon.verify(hash, password);
      }
      // If argon2 is not available in serverless demo, check against known demo hash or return false
      return false;
    }

    if (hash.startsWith('pbkdf2$')) {
      const parts = hash.split('$');
      const salt = parts[1];
      const originalHash = parts[2];
      if (salt && originalHash) {
        const derived = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
        return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(originalHash, 'hex'));
      }
    }

    return false;
  } catch {
    return false;
  }
}
