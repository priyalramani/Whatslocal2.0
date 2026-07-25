import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tag, TagDocument } from './tag.schema';

// Escape user text before using it in a regex (prevents ReDoS / injection).
function rx(s: string): RegExp {
  return new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

@Injectable()
export class TagsService {
  constructor(
    @InjectModel(Tag.name) private readonly tags: Model<TagDocument>,
  ) {}

  // Public type-ahead: approved tags only (autocomplete for the keyword box).
  async search(q: string | undefined, kind?: string, limit = 20) {
    const filter: any = { approved: true };
    if (kind) filter.kind = kind;
    if (q) { const r = rx(q); filter.$or = [{ name: r }, { synonyms: r }]; }
    return this.tags.find(filter).sort({ sort_order: -1, name: 1 }).limit(Math.min(limit, 50)).lean();
  }

  // Resolve tag docs by id (back-compat; the post form no longer sends tag ids).
  async byIds(ids: string[]) {
    return this.tags.find({ _id: { $in: ids } }).lean();
  }
}
