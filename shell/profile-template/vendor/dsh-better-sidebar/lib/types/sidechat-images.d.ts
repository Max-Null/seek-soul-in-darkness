import type { EncodedImageAttachment, ImageAttachmentLimits } from '@deepseek-ai/dsh-attachment';
/**
 * Raster formats the Side Chat composer offers and the transcript projects.
 * This is the host's `ImageMediaType` union; a deployment's own
 * `imageLimits.mediaTypes` stays authoritative for what it accepts.
 */
export declare const SIDECHAT_IMAGE_MEDIA_TYPES: readonly ["image/png", "image/jpeg", "image/webp", "image/gif"];
/**
 * Side Chat's own ceilings, layered on top of the host attachment policy (the
 * effective limit is the smaller of the two). They give the UI one predictable
 * budget even when a deployment allows more.
 */
export declare const SIDECHAT_MAX_IMAGES_PER_MESSAGE = 8;
export declare const SIDECHAT_MAX_IMAGE_BYTES: number;
export declare const SIDECHAT_MAX_MESSAGE_IMAGE_BYTES: number;
export type SidechatImageUpload = EncodedImageAttachment;
export type SidechatImageLimits = Pick<ImageAttachmentLimits, 'maxImageBytes' | 'maxImagesPerMessage' | 'maxMessageImageBytes' | 'mediaTypes'>;
export interface SidechatImageOccurrence {
    blockIndex: number;
    mediaType: string;
    bytes: number;
    width: number;
    height: number;
    name?: string;
}
export interface SidechatMessageContent {
    text: string;
    images?: SidechatImageOccurrence[];
}
export declare function projectSidechatContent(content: unknown, separator?: string): SidechatMessageContent;
