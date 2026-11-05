import { factRepository, type FactRepository, type FactFilters } from '../repositories/fact.repository.js';
import { ConflictError, NotFoundError } from '../errors/index.js';
import type {
  FactEntry,
  FactEntryVersion,
  CreateFactPayload,
  UpdateFactPayload,
  FactAssistantPreviewItem,
  UnansweredQuestion,
  UnansweredQuestionStatus,
} from '@housy/shared';

export class FactService {
  constructor(private readonly repo: FactRepository = factRepository) {}

  async listFacts(filters: FactFilters = {}): Promise<FactEntry[]> {
    return this.repo.findFacts(filters);
  }

  async getFactById(id: string): Promise<FactEntry> {
    const fact = await this.repo.findFactById(id);
    if (!fact) {
      throw new NotFoundError(`Fact entry with ID '${id}' not found`);
    }
    return fact;
  }

  async createFact(payload: CreateFactPayload, userId: string): Promise<FactEntry> {
    return this.repo.withTransaction(async (client) => {
      // 1. Check for duplicate key in the same project scope
      const existing = await this.repo.findFactByKeyAndProject(
        payload.key,
        payload.projectId ?? null,
        client,
      );
      if (existing) {
        throw new ConflictError(
          `A fact entry with key '${payload.key}' already exists for this project scope`,
        );
      }

      // 2. Insert fact entry
      const created = await this.repo.insertFact(client, payload, userId);

      // 3. Write initial version (version_number = 1)
      await this.repo.insertFactVersion(client, created, 1, userId);

      // 4. Write audit log
      await this.repo.insertAuditLog(
        client,
        userId,
        'fact_create',
        'fact_entry',
        created.id,
        {
          key: created.key,
          title: created.title,
          value: created.value,
          category: created.category,
          projectId: created.projectId,
        },
      );

      return created;
    });
  }

  async updateFact(id: string, payload: UpdateFactPayload, userId: string): Promise<FactEntry> {
    return this.repo.withTransaction(async (client) => {
      const existing = await this.repo.findFactById(id, client);
      if (!existing) {
        throw new NotFoundError(`Fact entry with ID '${id}' not found`);
      }

      // Update fact
      const updated = await this.repo.updateFact(client, id, payload, userId);

      // Get next version number
      const nextVersion = await this.repo.getNextVersionNumber(client, id);

      // Write version record
      await this.repo.insertFactVersion(client, updated, nextVersion, userId);

      // Write audit log
      await this.repo.insertAuditLog(
        client,
        userId,
        payload.status === 'archived' ? 'fact_archive' : 'fact_update',
        'fact_entry',
        id,
        {
          previous: {
            title: existing.title,
            value: existing.value,
            category: existing.category,
            status: existing.status,
          },
          updated: {
            title: updated.title,
            value: updated.value,
            category: updated.category,
            status: updated.status,
          },
        },
      );

      return updated;
    });
  }

  async archiveFact(id: string, userId: string): Promise<FactEntry> {
    return this.updateFact(id, { status: 'archived' }, userId);
  }

  async getFactVersions(factEntryId: string): Promise<FactEntryVersion[]> {
    const fact = await this.repo.findFactById(factEntryId);
    if (!fact) {
      throw new NotFoundError(`Fact entry with ID '${factEntryId}' not found`);
    }
    return this.repo.getFactVersions(factEntryId);
  }

  async getAssistantPreview(projectId?: string | null): Promise<FactAssistantPreviewItem[]> {
    const activeFacts = await this.repo.findFacts({
      status: 'active',
      projectId,
    });

    return activeFacts.map((f) => ({
      id: f.id,
      projectId: f.projectId,
      projectName: f.projectName || 'All Projects (Global)',
      category: f.category,
      key: f.key,
      title: f.title,
      value: f.value,
      injectedPromptText: `[FACT ID: ${f.id}] [${f.category.toUpperCase()}] ${f.title}: ${f.value}`,
    }));
  }

  async listUnansweredQuestions(status?: UnansweredQuestionStatus): Promise<UnansweredQuestion[]> {
    return this.repo.findUnansweredQuestions(status);
  }

  async resolveUnansweredQuestion(
    id: string,
    status: 'resolved' | 'dismissed',
    userId: string,
  ): Promise<UnansweredQuestion> {
    const resolved = await this.repo.resolveUnansweredQuestion(id, status, userId);
    if (!resolved) {
      throw new NotFoundError(`Unanswered question with ID '${id}' not found`);
    }

    await this.repo.withTransaction(async (client) => {
      await this.repo.insertAuditLog(
        client,
        userId,
        `question_${status}`,
        'unanswered_question',
        id,
        { status },
      );
    });

    return resolved;
  }
}

export const factService = new FactService();
