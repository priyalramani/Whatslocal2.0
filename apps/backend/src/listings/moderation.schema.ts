import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// An audit trail of admin actions on a reported listing (hide/show/restrict/
// unrestrict/reviewed) so the Reports page can show "what action was taken".
@Schema({ collection: 'mod_actions', timestamps: true })
export class ModAction {
  @Prop({ required: true, index: true }) listing_id: string;
  @Prop({ default: '' }) target_user_id: string;   // the poster, for restrict actions
  @Prop({ required: true }) action: 'hide' | 'show' | 'restrict' | 'unrestrict' | 'reviewed';
  @Prop({ default: '' }) admin: string;             // admin username
  @Prop({ default: '' }) note: string;
}

export type ModActionDocument = ModAction & Document;
export const ModActionSchema = SchemaFactory.createForClass(ModAction);
