import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { chatSessionRepository } from '../src/repositories/chat-session.repository.js';
import { chatRepository } from '../src/repositories/chat.repository.js';
import { DatabaseError } from '../src/errors/index.js';

describe('Chat Service Database Failure Resiliency', () => {
  it('returns typed 503 with localized message and no fabricated data when DB is down during chat start', async () => {
    // Stub chatSessionRepository.createSession to simulate DB connection outage
    const createSessionSpy = vi
      .spyOn(chatSessionRepository, 'createSession')
      .mockRejectedValueOnce(new DatabaseError('Connection terminated unexpectedly (ECONNREFUSED)'));

    const res = await request(app)
      .post('/api/chat/start')
      .send({ language: 'en', source: 'website' });

    createSessionSpy.mockRestore();

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.body.error.message).toBe('Our chat advisory service is temporarily unavailable. Please try again shortly.');
    expect(res.body.conversationId).toBeUndefined();
    expect(res.body.sessionToken).toBeUndefined();

    // Verify absolutely nothing fabricated is returned
    const bodyStr = JSON.stringify(res.body);
    const bannedName = ['Grand', 'View'].join(' ');
    const fakeUuid = ['00000000', '0000', '0000', '0000', '000000000001'].join('-');
    expect(bodyStr).not.toContain(bannedName);
    expect(bodyStr).not.toContain(fakeUuid);
    expect(bodyStr).not.toContain('1.2 Cr');
  });

  it('returns localized Hindi 503 message when requested in Hindi', async () => {
    const createSessionSpy = vi
      .spyOn(chatSessionRepository, 'createSession')
      .mockRejectedValueOnce(new DatabaseError('ECONNREFUSED'));

    const res = await request(app)
      .post('/api/chat/start')
      .send({ language: 'hi', source: 'website' });

    createSessionSpy.mockRestore();

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.body.error.message).toBe('हमारी चैट परामर्श सेवा अस्थायी रूप से अनुपलब्ध है। कृपया कुछ समय बाद पुनः प्रयास करें।');
  });

  it('returns localized Gujarati 503 message when requested in Gujarati', async () => {
    const createSessionSpy = vi
      .spyOn(chatSessionRepository, 'createSession')
      .mockRejectedValueOnce(new DatabaseError('ECONNREFUSED'));

    const res = await request(app)
      .post('/api/chat/start')
      .send({ language: 'gu', source: 'website' });

    createSessionSpy.mockRestore();

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.body.error.message).toBe('અમારી ચેટ સલાહકાર સેવા અસ્થાયી રૂપે અનુપલબ્ધ છે. કૃપા કરીને થોડા સમય પછી ફરી પ્રયાસ કરો.');
  });

  it('returns 503 on message send when conversation lookup fails due to DB outage', async () => {
    const findConvSpy = vi
      .spyOn(chatRepository, 'findConversationById')
      .mockRejectedValueOnce(new DatabaseError('ECONNREFUSED'));

    // We pass any valid UUID
    const testConvId = '11111111-2222-3333-4444-555555555555';

    // Sign a temporary buyer session to pass session check
    const { signBuyerSession } = await import('../src/auth/tokens.js');
    const token = await signBuyerSession({
      conversationId: testConvId,
      leadId: '22222222-3333-4444-5555-666666666666',
    });

    const res = await request(app)
      .post('/api/chat/message')
      .set('Cookie', `buyer_session=${token}`)
      .set('X-Buyer-Session', token)
      .send({
        conversationId: testConvId,
        message: 'Hello, what are the prices?',
        language: 'en',
      });

    findConvSpy.mockRestore();

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.body.error.message).toBe('Our chat advisory service is temporarily unavailable. Please try again shortly.');
    const bannedName = ['Grand', 'View'].join(' ');
    expect(JSON.stringify(res.body)).not.toContain(bannedName);
  });
});
