import type { AttachmentStore, PromptContentPart } from '@deepseek-ai/dsh-attachment';
import type { Context } from './context-types.ts';
import type { SidechatImageLimits } from './sidechat-images.ts';
import { SidebarError } from './wire.ts';
export declare const SIDECHAT_METADATA_BYTES: number;
export declare function sidechatAttachments(ctx: Context): AttachmentStore | undefined;
export declare function sidechatImageLimits(ctx: Context): SidechatImageLimits | undefined;
export declare function sidechatPromptBodyLimit(ctx: Context): number;
/**
 * Map one `admitPromptContent` rejection onto the sidebar wire error, keeping
 * the host's message: an oversized image is the caller's input problem (413),
 * a storage fault is not (500).
 */
export declare function sidechatAdmissionError(store: AttachmentStore, error: unknown): SidebarError;
export declare function parseSidechatPrompt(payload: unknown, limits: SidechatImageLimits | undefined): {
    childId: string;
    text: string;
    content: PromptContentPart[];
    hasImages: boolean;
};
