import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { SignJWT } from 'jose';
import { app } from '../src/app.js';
import { query } from '../src/db/index.js';
import { signStaffToken } from '../src/auth/tokens.js';
import { config } from '../src/config/index.js';
import type { AuthUser } from '@housy/shared';

describe('Security Attack Suite & Defensive Invariants', () => {
  const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };

  let salesHeadUser: AuthUser;
  let salesHeadToken: string;

  let exec1User: AuthUser;
  let exec1Token: string;

  let exec2User: AuthUser;
  let exec2Token: string;

  let leadAssignedToExec1Id: string;
  let projectId: string;

  beforeAll(async () => {
    // 1. Fetch active staff users
    const usersRes = await query<{
      id: string;
      name: string;
      email: string;
      role: 'executive' | 'sales_head';
      phone: string | null;
    }>(`SELECT id, name, email, role, phone FROM users WHERE active = true ORDER BY email`);

    const headDb = usersRes.rows.find((u) => u.role === 'sales_head')!;
    salesHeadUser = { ...headDb };
    salesHeadToken = await signStaffToken(salesHeadUser);

    const execs = usersRes.rows.filter((u) => u.role === 'executive');
    exec1User = { ...execs[0]! };
    exec1Token = await signStaffToken(exec1User);

    exec2User = { ...execs[1]! };
    exec2Token = await signStaffToken(exec2User);

    // 2. Fetch project ID
    const projRes = await query<{ id: string }>('SELECT id FROM projects LIMIT 1');
    projectId = projRes.rows[0]!.id;

    // 3. Create or find lead assigned to Exec 1
    const leadRes = await query<{ id: string }>(
      `SELECT id FROM leads WHERE assigned_to = $1 LIMIT 1`,
      [exec1User.id],
    );

    if (leadRes.rows.length > 0) {
      leadAssignedToExec1Id = leadRes.rows[0]!.id;
    } else {
      const insRes = await query<{ id: string }>(
        `INSERT INTO leads (project_id, source, assigned_to, status, consent_status, name, phone)
         VALUES ($1, 'website', $2, 'claimed', 'opted_in', 'Security Lead Exec1', '+919999900001')
         RETURNING id`,
        [projectId, exec1User.id],
      );
      leadAssignedToExec1Id = insRes.rows[0]!.id;
    }
  });

  afterAll(async () => {
    // Clean up test leads
    await query(`DELETE FROM leads WHERE name LIKE 'Security Lead%'`);
  });

  // 1. Forged JWT
  it('Attack 1: forged JWT token signed with wrong secret is rejected with 401', async () => {
    const wrongSecret = new TextEncoder().encode('attacker-controlled-secret-key-32-chars-long!');
    const forgedToken = await new SignJWT({
      id: salesHeadUser.id,
      email: salesHeadUser.email,
      role: 'sales_head',
      name: salesHeadUser.name,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(wrongSecret);

    const res = await request(app)
      .get('/api/leads')
      .set('Authorization', `Bearer ${forgedToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('Attack 1b: completely malformed/random JWT string is rejected with 401', async () => {
    const res = await request(app)
      .get('/api/leads')
      .set('Authorization', 'Bearer totally.fake.jwtpayloadstring');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  // 1c. Expired JWT
  it('Attack 1c: expired JWT token is rejected with 401', async () => {
    const secret = new TextEncoder().encode(config.JWT_SECRET);
    const expiredToken = await new SignJWT({
      id: salesHeadUser.id,
      email: salesHeadUser.email,
      role: 'sales_head',
      name: salesHeadUser.name,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(secret);

    const res = await request(app)
      .get('/api/leads')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  // 2. CSRF Without Custom Header
  it('Attack 2: cookie-authenticated mutating request without custom CSRF header is rejected with 403', async () => {
    const res = await request(app)
      .post('/api/fact-sheet')
      .set('Cookie', [`staff_token=${salesHeadToken}`])
      .send({
        projectId,
        key: 'attack_fact_key',
        category: 'Specifications',
        title: 'Attack Fact',
        value: 'Malicious Content',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('CSRF protection');
  });

  // 3. Disallowed Origin With Credentials
  it('Attack 3: request from disallowed cross-origin domain is rejected with 403', async () => {
    const res = await request(app)
      .get('/api/leads')
      .set('Origin', 'https://malicious-phishing-portal.com')
      .set('Authorization', `Bearer ${salesHeadToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('not allowed by CORS');
  });

  // 4. Executive Reading Another Executive's Assigned Lead
  it('Attack 4: Executive B attempting to read Executive A’s assigned lead is blocked with 403', async () => {
    // Owner Executive A can read the lead
    const ownerRes = await request(app)
      .get(`/api/leads/${leadAssignedToExec1Id}`)
      .set('Authorization', `Bearer ${exec1Token}`);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.success).toBe(true);

    // Non-owner Executive B is blocked
    const res = await request(app)
      .get(`/api/leads/${leadAssignedToExec1Id}`)
      .set('Authorization', `Bearer ${exec2Token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('Lead is assigned to another executive');
  });

  // 5. Buyer Token for Conversation A Used on Conversation B
  it('Attack 5: Buyer session token for Conversation A used to message Conversation B is rejected with 403', async () => {
    // Start Chat A
    const chatARes = await request(app)
      .post('/api/chat/start')
      .send({ language: 'en', projectId, source: 'website' });
    expect(chatARes.status).toBe(201);
    const tokenA = chatARes.body.sessionToken as string;

    // Start Chat B
    const chatBRes = await request(app)
      .post('/api/chat/start')
      .send({ language: 'en', projectId, source: 'website' });
    expect(chatBRes.status).toBe(201);
    const conversationIdB = chatBRes.body.conversationId as string;

    // Attempt to message Conversation B using Token A
    const attackRes = await request(app)
      .post('/api/chat/message')
      .set('x-buyer-session', tokenA)
      .send({
        conversationId: conversationIdB,
        message: 'Attempting to inject into conversation B with token A',
      });

    expect(attackRes.status).toBe(403);
    expect(attackRes.body.success).toBe(false);
    expect(attackRes.body.error.code).toBe('FORBIDDEN');
    expect(attackRes.body.error.message).toContain('buyer session does not match this conversation');
  });

  // 6. Oversized Body Payload
  it('Attack 6: chat message payload exceeding 1,000 characters is rejected with 400 validation error', async () => {
    const chatRes = await request(app)
      .post('/api/chat/start')
      .send({ language: 'en', projectId, source: 'website' });
    expect(chatRes.status).toBe(201);

    const oversizedMessage = 'A'.repeat(1001);

    const res = await request(app)
      .post('/api/chat/message')
      .set('x-buyer-session', chatRes.body.sessionToken as string)
      .send({
        conversationId: chatRes.body.conversationId,
        message: oversizedMessage,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // 7. SQL Meta-Characters in Every Search Parameter (Parameterized Queries Defense)
  it('Attack 7: SQL meta-characters in every search parameter are safely handled via parameterized queries', async () => {
    const sqlInjectionPayloads = [
      "'; DROP TABLE leads; --",
      "' OR '1'='1",
      "admin'--",
      "1' UNION ALL SELECT NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL--",
      "'; UPDATE users SET role='sales_head'; --",
      "\\\"; DROP TABLE users; --",
    ];

    for (const maliciousSql of sqlInjectionPayloads) {
      const res = await request(app)
        .get('/api/leads')
        .query({
          search: maliciousSql,
          source: 'website',
          status: 'new',
        })
        .set('Authorization', `Bearer ${salesHeadToken}`);

      // Parameterized queries protect the database: query safely evaluates with no SQL syntax error
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.total).toBe('number');
    }

    // Verify leads table and users table are fully intact
    const leadsCount = await query<{ count: string }>('SELECT COUNT(*) FROM leads');
    expect(parseInt(leadsCount.rows[0]!.count, 10)).toBeGreaterThan(0);

    const usersCount = await query<{ count: string }>('SELECT COUNT(*) FROM users');
    expect(parseInt(usersCount.rows[0]!.count, 10)).toBeGreaterThan(0);
  });

  // 8. Account Lockout on Brute-Force Login
  it('Attack 8: per-account+IP brute-force lockout locks after 5 consecutive failures', async () => {
    const targetEmail = 'lockout.test@example.com';
    const fakeIp = '198.51.100.99';

    // Insert active user for test
    await query(
      `INSERT INTO users (name, email, password_hash, role, active)
       VALUES ('Lockout User', $1, 'hashed_val', 'executive', true)
       ON CONFLICT (email) DO NOTHING`,
      [targetEmail],
    );

    // 5 failed login attempts
    for (let i = 1; i <= 5; i++) {
      const failRes = await request(app)
        .post('/api/auth/login')
        .set(CSRF_HEADER)
        .set('X-Forwarded-For', fakeIp)
        .send({
          email: targetEmail,
          password: `WrongPassword${i}`,
        });

      expect(failRes.status).toBe(401);
    }

    // 6th attempt should trigger 429 Account Lockout
    const lockedRes = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .set('X-Forwarded-For', fakeIp)
      .send({
        email: targetEmail,
        password: 'AnyPassword',
      });

    expect(lockedRes.status).toBe(429);
    expect(lockedRes.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  // 9. Dynamic Role Verification Against DB
  it('Attack 9: JWT bearer with forged/stale role is rejected when DB shows role demoted or user deactivated', async () => {
    // Create temporary active user
    const tempEmail = 'temp.exec.demoted@example.com';
    const createRes = await query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role, active)
       VALUES ('Temp Demoted User', $1, 'dummy_hash', 'sales_head', true)
       RETURNING id`,
      [tempEmail],
    );
    const tempId = createRes.rows[0]!.id;

    // Sign token with 'sales_head' role claim
    const staleSalesHeadToken = await signStaffToken({
      id: tempId,
      email: tempEmail,
      role: 'sales_head',
      name: 'Temp Demoted User',
      phone: null,
    });

    // Verify initially passes sales_head route
    const firstRes = await request(app)
      .get('/api/admin/slots/preview')
      .set('Authorization', `Bearer ${staleSalesHeadToken}`);
    expect(firstRes.status).toBe(200);

    // Now demote user in DB to 'executive'
    await query(`UPDATE users SET role = 'executive' WHERE id = $1`, [tempId]);

    // Request should now be blocked dynamically with 403 Forbidden
    const demotedRes = await request(app)
      .get('/api/admin/slots/preview')
      .set('Authorization', `Bearer ${staleSalesHeadToken}`);
    expect(demotedRes.status).toBe(403);
    expect(demotedRes.body.error.message).toContain("Insufficient permissions: required role 'sales_head', found 'executive'");

    // Now deactivate user in DB
    await query(`UPDATE users SET active = false WHERE id = $1`, [tempId]);

    // Request should be blocked as deactivated
    const deactivatedRes = await request(app)
      .get('/api/admin/slots/preview')
      .set('Authorization', `Bearer ${staleSalesHeadToken}`);
    expect(deactivatedRes.status).toBe(403);
    expect(deactivatedRes.body.error.message).toContain('User account not found or deactivated');

    // Clean up
    await query(`DELETE FROM users WHERE id = $1`, [tempId]);
  });
});
