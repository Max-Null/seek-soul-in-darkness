import type { SidechatImageOccurrence } from '../sidechat-images.ts';
export declare function SidechatImages({ childId, messageId, images, visible }: {
    childId?: string;
    messageId?: string;
    images?: readonly SidechatImageOccurrence[];
    visible: boolean;
}): React.ReactNode;
