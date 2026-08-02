import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VisitorProfile, VisitorProfileDocument } from './profile.schema';
import { User, UserDocument } from '../users/user.schema';
import { AppConfig, AppConfigDocument } from '../listings/config.schema';

export const GENDERS = ['male', 'female', 'other'];

@Injectable()
export class ProfileService {
  constructor(
    @InjectModel(VisitorProfile.name) private readonly profiles: Model<VisitorProfileDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(AppConfig.name) private readonly config: Model<AppConfigDocument>,
  ) {}

  // "Contact us" target — an admin-set WhatsApp number + pre-typed message. The
  // profile screen deep-links to wa.me with both. Stored in the shared app_config
  // key/value store, same as the login-gate settings.
  async getContact(): Promise<{ whatsapp: string; message: string }> {
    const c = await this.config.findOne({ key: 'contact_us' }).lean();
    const v: any = c?.value || {};
    return { whatsapp: String(v.whatsapp || ''), message: String(v.message || '') };
  }
  async setContact(whatsapp: string, message: string): Promise<{ whatsapp: string; message: string }> {
    const val = {
      whatsapp: String(whatsapp || '').replace(/\D/g, '').slice(0, 15),   // digits only (may include country code)
      message: String(message || '').trim().slice(0, 400),
    };
    await this.config.findOneAndUpdate({ key: 'contact_us' }, { value: val }, { upsert: true });
    return val;
  }

  // What we know about this person's gender ('' = unknown → the app prompts).
  // Logged in: check the account first (survives a new device), then this
  // device (covers "answered anonymously, then logged in on the same phone").
  // Anonymous: this device only.
  async getGender(visitorId: string, userId: string | null): Promise<string> {
    if (userId) {
      const u: any = await this.users.findById(userId, { gender: 1 }).lean();
      if (u?.gender) return u.gender;
      const byUser = await this.profiles.findOne({ user_id: userId, gender: { $ne: '' } }, { gender: 1 }).lean();
      if (byUser?.gender) return byUser.gender;
    }
    if (visitorId) {
      const p = await this.profiles.findOne({ visitor_id: visitorId, gender: { $ne: '' } }, { gender: 1 }).lean();
      if (p?.gender) return p.gender;
    }
    return '';
  }

  async setGender(visitorId: string, gender: string, userId: string | null): Promise<{ ok: boolean; gender: string }> {
    const g = String(gender || '').toLowerCase();
    if (!GENDERS.includes(g)) return { ok: false, gender: '' };
    if (visitorId) {
      await this.profiles.updateOne(
        { visitor_id: visitorId },
        { $set: { gender: g, ...(userId ? { user_id: userId } : {}) } },
        { upsert: true },
      );
    }
    // Mirror onto the account so it's a first-class, device-independent attribute.
    if (userId) await this.users.updateOne({ _id: userId }, { $set: { gender: g } });
    return { ok: true, gender: g };
  }
}
