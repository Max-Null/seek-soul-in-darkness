import type { SidechatImageLimits, SidechatImageUpload } from '../sidechat-images.ts';
export interface DraftImage {
    id: number;
    file: File;
    preview: string;
}
export interface SidechatDraftOwner {
    childId?: string;
    active: boolean;
    revision: number;
    text: string;
    images: DraftImage[];
}
export interface SidechatSendAttempt {
    owner: SidechatDraftOwner;
    revision: number;
    text: string;
    images: readonly DraftImage[];
}
export declare function useSidechatDraft(childId: string | undefined): {
    owner: SidechatDraftOwner;
    setText(text: string): void;
    add(files: readonly File[], limits: SidechatImageLimits | undefined): void;
    remove(id: number): void;
    capture(): SidechatSendAttempt;
    accept(attempt: SidechatSendAttempt): void;
};
export declare function encodeSidechatImages(attempt: SidechatSendAttempt): Promise<SidechatImageUpload[]>;
