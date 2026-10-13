import type { StudioPlannerTextPayload } from '@shared/bridge';

export function hasPlannerPayloadContent(payload: Pick<StudioPlannerTextPayload, 'text' | 'attachments'>) {
  return payload.text.trim().length > 0 || payload.attachments.some((attachment) => attachment.trim().length > 0);
}