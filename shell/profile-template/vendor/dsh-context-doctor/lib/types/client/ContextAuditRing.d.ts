/**
 * Context Doctor's composer control, seated in the input tool row through
 * `conversation.input.right` — a stock DSH slot, so the control appears on an
 * unmodified harness (issue #4).
 *
 * The panel reads as a measuring instrument: a budget rail with the 10k / 30k
 * thresholds drawn in (so "how close to the warning line" is visible rather
 * than implied), then a compact table of the four non-overlapping slices, each
 * expanding into the entries behind it.
 *
 * Typography rule: text inherits the DSH shell's own UI font — the panel sets
 * no family — and monospace is applied only to figures. The previous build put
 * `ui-monospace, …, Consolas` on the whole panel, a stack with no CJK coverage
 * at all, so every mixed line rendered Latin in mono and Chinese in whatever
 * the system fell back to.
 */
import { type ReactElement } from 'react';
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type { createAuditStore } from './store.ts';
import { NS } from './locales.ts';
export type ContextAuditRingProps = PropsRuntime<'conversation.input.right'> & PropsStore<ReturnType<typeof createAuditStore>> & PropsLocale<typeof NS>;
/** Resident control in the tool row, just before Send. */
export declare function ContextAuditRing(props: ContextAuditRingProps): ReactElement;
