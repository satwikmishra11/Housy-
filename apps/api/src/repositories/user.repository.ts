import type { QueryResultRow } from 'pg';
import { query } from '../db/index.js';
import type { UserRole } from '@housy/shared';

export interface UserDbRow extends QueryResultRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  phone: string | null;
  active: boolean;
}

export class UserRepository {
  async findByEmail(email: string): Promise<UserDbRow | null> {
    const res = await query<UserDbRow>(
      `SELECT id, name, email, password_hash, role, phone, active
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email.trim()],
    );

    return res.rows[0] ?? null;
  }

  async findById(id: string): Promise<UserDbRow | null> {
    const res = await query<UserDbRow>(
      `SELECT id, name, email, password_hash, role, phone, active
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [id],
    );

    return res.rows[0] ?? null;
  }
}

export const userRepository = new UserRepository();
