/**
 * Basic display family: avatar palette, and the local click-feedback button
 * (the actionable-button chip). Used by the render dispatcher.
 * @module @changfenhuang/dsh-genui/client/blocks/basic
 */
import { type ReactNode } from 'react';
import type { GenuiAudio, GenuiVideo } from '../spec.ts';
export declare function avatarColor(name: string): string;
/** Button with LOCAL click feedback: clicking an actionable button shows a
 * brief "✓ 已触发" chip so the user sees the click registered even while the
 * model round trip is in flight — no more "点了没反应" perception. The chip
 * is purely cosmetic; the action fires through `onClick` as before. */
export declare function ClickFeedbackButton({ className, disabled, onClick, children }: {
    className: string;
    disabled?: boolean;
    onClick?: (() => void) | undefined;
    children: ReactNode;
}): import("react").JSX.Element;
/** Native controls intentionally own play/pause/seek/volume. Model-authored
 * autoplay and controls hints are ignored: media starts only after the user
 * asks for it. */
export declare const AudioNode: import("react").NamedExoticComponent<{
    node: GenuiAudio;
}>;
export declare const VideoNode: import("react").NamedExoticComponent<{
    node: GenuiVideo;
}>;
