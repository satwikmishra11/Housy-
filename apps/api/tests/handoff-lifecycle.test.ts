import { describe, it, expect, beforeEach } from 'vitest';
import { query } from '../src/db/index.js';
import { handoffRepository } from '../src/repositories/handoff.repository.js';
import { handoffService } from '../src/services/handoff.service.js';
import { chatService } from '../src/services/chat.service.js';
import { renderTemplate } from '../src/channels/templates.js';

const randomPhone = () => `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;

describe('Handoff Lifecycle, SLA Escalations, and Human Takeover', () => {
  let executiveAId: string;
  let executiveBId: string;
  let salesHeadId: string;
  let projectId: string;

  beforeEach(async () => {
    // Fetch 2 active executives
    const execRes = await query<{ id: string; name: string }>(
      `SELECT id, name FROM users WHERE role = 'executive' AND active = true ORDER BY email ASC LIMIT 2`,
    );
    expect(execRes.rows.length).toBeGreaterThanOrEqual(2);
    executiveAId = execRes.rows[0]!.id;
    executiveBId = execRes.rows[1]!.id;

    // Fetch sales head
    const headRes = await query<{ id: string }>(
      `SELECT id FROM users WHERE role = 'sales_head' AND active = true LIMIT 1`,
    );
    salesHeadId = headRes.rows[0]!.id;

    // Fetch project
    const projRes = await query<{ id: string }>(`SELECT id FROM projects LIMIT 1`);
    projectId = projRes.rows[0]!.id;
  });

  describe('1. One open handoff per conversation & handoff_events tracking', () => {
    it('appends to handoff_events and elevates priority on multiple triggers without creating duplicate open handoffs', async () => {
      // Create lead and conversation
      const leadRes = await query<{ id: string }>(
        `INSERT INTO leads (name, phone_e164, source, project_id, wants, status)
         VALUES ('Single Handoff Lead', $1, 'website', $2, '3 BHK', 'new')
         RETURNING id`,
        [randomPhone(), projectId],
      );
      const leadId = leadRes.rows[0]!.id;

      const convRes = await query<{ id: string }>(
        `INSERT INTO conversations (lead_id, status, language)
         VALUES ($1, 'ai', 'en')
         RETURNING id`,
        [leadId],
      );
      const conversationId = convRes.rows[0]!.id;

      const dummySummary = {
        name: 'Single Handoff Lead',
        phone: '+919800000000',
        language: 'en' as const,
        project: 'The Palm Residences',
        wants: '3 BHK',
        budgetRange: '₹1.5 Cr',
        timeline: 'Immediate',
        keyQuestionsAsked: ['Price?'],
        openQuestions: [],
        sentiment: 'neutral' as const,
      };

      // Trigger 1: Initial handoff
      const handoffId1 = await handoffRepository.insertHandoff(
        leadId,
        conversationId,
        executiveAId,
        'Guardrail failure 1',
        dummySummary,
      );

      const check1 = await query<{ priority: string }>(
        `SELECT priority FROM handoffs WHERE id = $1`,
        [handoffId1],
      );
      expect(check1.rows[0]?.priority).toBe('normal');

      // Trigger 2: Second failure on same conversation
      const handoffId2 = await handoffRepository.insertHandoff(
        leadId,
        conversationId,
        executiveAId,
        'Guardrail failure 2',
        dummySummary,
      );

      expect(handoffId2).toBe(handoffId1);
      const check2 = await query<{ priority: string }>(
        `SELECT priority FROM handoffs WHERE id = $1`,
        [handoffId1],
      );
      expect(check2.rows[0]?.priority).toBe('high');

      // Trigger 3: Third failure on same conversation
      const handoffId3 = await handoffRepository.insertHandoff(
        leadId,
        conversationId,
        executiveAId,
        'Guardrail failure 3',
        dummySummary,
      );

      expect(handoffId3).toBe(handoffId1);
      const check3 = await query<{ priority: string }>(
        `SELECT priority FROM handoffs WHERE id = $1`,
        [handoffId1],
      );
      expect(check3.rows[0]?.priority).toBe('urgent');

      // Check PostgreSQL partial unique index enforcement:
      // Verify exactly ONE open handoff exists in handoffs table
      const openHandoffsCount = await query<{ count: string }>(
        `SELECT COUNT(*) FROM handoffs WHERE conversation_id = $1 AND status IN ('new', 'accepted')`,
        [conversationId],
      );
      expect(Number(openHandoffsCount.rows[0]?.count)).toBe(1);

      // Verify handoff_events table recorded all 3 events
      const eventsRes = await query<{ event_type: string; reason: string }>(
        `SELECT event_type, reason FROM handoff_events WHERE handoff_id = $1 ORDER BY created_at ASC`,
        [handoffId1],
      );
      expect(eventsRes.rows.length).toBe(3);
      expect(eventsRes.rows[0]?.event_type).toBe('created');
      expect(eventsRes.rows[1]?.event_type).toBe('trigger_appended');
      expect(eventsRes.rows[2]?.event_type).toBe('trigger_appended');

      // Verify direct INSERT violating partial unique index is rejected by PostgreSQL
      let duplicateErrorThrown = false;
      try {
        await query(
          `INSERT INTO handoffs (lead_id, conversation_id, executive_id, reason, summary, status)
           VALUES ($1, $2, $3, 'Illegal duplicate', '{}'::jsonb, 'new')`,
          [leadId, conversationId, executiveAId],
        );
      } catch (err: unknown) {
        duplicateErrorThrown = true;
        expect((err as { code: string }).code).toBe('23505'); // unique_violation
      }
      expect(duplicateErrorThrown).toBe(true);
    });
  });

  describe('2. Executive Takeover & Human Mode Pause/Resume', () => {
    it('switches conversation to human mode, stores executive messages, and pauses AI assistant', async () => {
      const leadRes = await query<{ id: string }>(
        `INSERT INTO leads (name, phone_e164, source, project_id, wants, status, assigned_to)
         VALUES ('Takeover Lead', $1, 'website', $2, '2 BHK', 'new', $3)
         RETURNING id`,
        [randomPhone(), projectId, executiveAId],
      );
      const leadId = leadRes.rows[0]!.id;

      const convRes = await query<{ id: string }>(
        `INSERT INTO conversations (lead_id, status, language)
         VALUES ($1, 'ai', 'en')
         RETURNING id`,
        [leadId],
      );
      const conversationId = convRes.rows[0]!.id;

      await handoffService.createHandoff(
        leadId,
        'Buyer wants sales agent',
        { conversationId, notifyBuyer: false, skipLlm: true },
      );

      // Ensure lead.assigned_to is executiveAId
      await query(`UPDATE leads SET assigned_to = $1 WHERE id = $2`, [executiveAId, leadId]);

      // 1. Executive takes over chat
      await handoffRepository.takeOverChat(conversationId, executiveAId);

      const convCheck1 = await query<{ status: string }>(
        `SELECT status FROM conversations WHERE id = $1`,
        [conversationId],
      );
      expect(convCheck1.rows[0]?.status).toBe('human');

      // 2. Executive posts reply message
      const messageId = await handoffRepository.postExecutiveMessage(
        conversationId,
        executiveAId,
        'Hello! I am Harshil from the sales team and I will assist you today.',
      );
      expect(messageId).toBeTruthy();

      // Verify message in DB has role 'executive' and executiveFirstName
      const messages = await query<{ role: string; content: string; meta: { executiveFirstName?: string } }>(
        `SELECT role, content, meta FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [conversationId],
      );
      expect(messages.rows[0]?.role).toBe('executive');
      expect(messages.rows[0]?.meta?.executiveFirstName).toBeTruthy();

      // 3. Buyer sends a message while status is 'human' -> AI is paused
      const buyerReply = await chatService.sendMessage({
        conversationId,
        message: 'Can I get a discount on the 10th floor?',
      });

      expect(buyerReply.text).toContain('sales executive');
      expect(buyerReply.isHandoff).toBe(true);

      // Verify notification created for assigned executive
      const notifs = await query<{ user_id: string; title: string; link: string }>(
        `SELECT user_id, title, link FROM staff_notifications WHERE title = 'New Buyer Message' ORDER BY created_at DESC LIMIT 1`,
      );
      expect(notifs.rows.length).toBe(1);
      expect(notifs.rows[0]?.title).toBe('New Buyer Message');

      // 4. Hand back to assistant
      await handoffRepository.handBackToAssistant(conversationId);

      const convCheck2 = await query<{ status: string }>(
        `SELECT status FROM conversations WHERE id = $1`,
        [conversationId],
      );
      expect(convCheck2.rows[0]?.status).toBe('ai');
    });
  });

  describe('3. Language-Matched Routing', () => {
    it('routes Gujarati lead to executive speaking Gujarati and least loaded', async () => {
      // Set languages for executive A (hi, en) and executive B (gu, en)
      await query(`UPDATE users SET languages = $1 WHERE id = $2`, [['hi', 'en'], executiveAId]);
      await query(`UPDATE users SET languages = $1 WHERE id = $2`, [['gu', 'en'], executiveBId]);

      // Create a lead with Gujarati language preference
      const leadRes = await query<{ id: string }>(
        `INSERT INTO leads (name, phone_e164, source, project_id, wants, status)
         VALUES ('Gujarati Lead', $1, 'website', $2, '3 BHK', 'new')
         RETURNING id`,
        [randomPhone(), projectId],
      );
      const leadId = leadRes.rows[0]!.id;

      await query(
        `INSERT INTO conversations (lead_id, status, language)
         VALUES ($1, 'ai', 'gu')`,
        [leadId],
      );

      // Route lead
      const matchedExec = await handoffRepository.findBestExecutiveForLead(leadId);
      expect(matchedExec.id).toBe(executiveBId);
    });
  });

  describe('4. 15-Minute SLA Escalation & Internal Notification Outbox Mirroring', () => {
    it('escalates unaccepted handoff older than 15 minutes to urgent and alerts Sales Head with internal outbox mirror', async () => {
      const leadRes = await query<{ id: string }>(
        `INSERT INTO leads (name, phone_e164, source, project_id, wants, status)
         VALUES ('SLA Escalation Lead', $1, 'website', $2, '3 BHK', 'new')
         RETURNING id`,
        [randomPhone(), projectId],
      );
      const leadId = leadRes.rows[0]!.id;

      const convRes = await query<{ id: string }>(
        `INSERT INTO conversations (lead_id, status, language)
         VALUES ($1, 'ai', 'en')
         RETURNING id`,
        [leadId],
      );
      const conversationId = convRes.rows[0]!.id;

      // Insert an unaccepted handoff backdated by 20 minutes
      const insertRes = await query<{ id: string }>(
        `INSERT INTO handoffs (lead_id, conversation_id, executive_id, reason, summary, status, priority, is_escalated, created_at)
         VALUES ($1, $2, $3, 'High intent inquiry', '{}'::jsonb, 'new', 'normal', false, NOW() - INTERVAL '20 minutes')
         RETURNING id`,
        [leadId, conversationId, executiveAId],
      );
      const handoffId = insertRes.rows[0]!.id;

      // Run escalation job
      const escalatedCount = await handoffService.escalateStaleHandoffs();
      expect(escalatedCount).toBeGreaterThanOrEqual(1);

      // Verify handoff status in DB
      const handoffCheck = await query<{ priority: string; is_escalated: boolean }>(
        `SELECT priority, is_escalated FROM handoffs WHERE id = $1`,
        [handoffId],
      );
      expect(handoffCheck.rows[0]?.priority).toBe('urgent');
      expect(handoffCheck.rows[0]?.is_escalated).toBe(true);

      // Verify Sales Head received notification in staff_notifications
      const notifRes = await query<{ user_id: string; type: string; title: string }>(
        `SELECT user_id, type, title FROM staff_notifications WHERE type = 'escalation' AND user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [salesHeadId],
      );
      expect(notifRes.rows.length).toBe(1);
      expect(notifRes.rows[0]?.title).toContain('SLA Escalation');

      // Verify notification was mirrored into outbound_messages with channel = 'internal'
      const outboxRes = await query<{ channel: string; body: string }>(
        `SELECT channel, body FROM outbound_messages WHERE channel = 'internal' AND lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [leadId],
      );
      expect(outboxRes.rows.length).toBe(1);
      expect(outboxRes.rows[0]?.channel).toBe('internal');
      expect(outboxRes.rows[0]?.body).toContain('SLA Escalation');
    });
  });

  describe('5. Named Executive Everywhere: Outbox Templates', () => {
    it('includes assigned executive real name and demo phone in visit_confirmation, reminder_24h, and reminder_2h templates', () => {
      const execName = 'Priya Patel';
      const execPhone = '+91 90000 00003';

      // 1. Visit Confirmation
      const conf = renderTemplate('visit_confirmation', {
        projectName: 'The Palm Residences',
        startsAt: 'Thursday, 26 Nov 2026 at 11:00 AM',
        executiveName: execName,
        executivePhone: execPhone,
        reraNumber: 'PR/GJ/AHMEDABAD/AUDA/RAA01234/011126',
        manageUrl: 'https://housy.in/visit/manage_tok_123',
      });
      expect(conf.body).toContain(execName);
      expect(conf.body).toContain(execPhone);

      // 2. Reminder 24h
      const rem24 = renderTemplate('reminder_24h', {
        projectName: 'The Palm Residences',
        startsAt: 'Tomorrow at 11:00 AM',
        executiveName: execName,
        executivePhone: execPhone,
        reraNumber: 'PR/GJ/AHMEDABAD/AUDA/RAA01234/011126',
        manageUrl: 'https://housy.in/visit/manage_tok_123',
      });
      expect(rem24.body).toContain(execName);
      expect(rem24.body).toContain(execPhone);

      // 3. Reminder 2h
      const rem2h = renderTemplate('reminder_2h', {
        projectName: 'The Palm Residences',
        startsAt: '11:00 AM',
        executiveName: execName,
        executivePhone: execPhone,
        reraNumber: 'PR/GJ/AHMEDABAD/AUDA/RAA01234/011126',
        mapsUrl: 'https://maps.google.com',
      });
      expect(rem2h.body).toContain(execName);
      expect(rem2h.body).toContain(execPhone);
    });
  });
});
