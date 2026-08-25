/**
 * Context Doctor browser half — registers the audit ring into the composer
 * tool row and drives it from the host's same-origin
 * `/api/context-doctor/audit` endpoint: fetch on mount, manual refresh.
 * @module dsh-context-doctor/client
 */
import { createAuditStore } from "./store.js";
import { ContextAuditRing } from "./ContextAuditRing.js";
import { NS, en, zh } from "./locales.js";
/** Required services. */
export const inject = ['slots', 'locale'];
/**
 * Client plugin body: register dictionaries, seed the store, and seat the
 * audit control once the input tool row is on the ledger.
 *
 * The seat is `conversation.input.right` — the stock DSH slot for "a control
 * the user reaches on the way to sending", at the right end of the tool row
 * before Send. An earlier build targeted `conversation.input.context`, which
 * no released DSH ever shipped (it only existed in a local harness patch), so
 * the control was silently dropped on every unmodified install (issue #4).
 * `.right` is `kind: 'list'`, so seating here displaces nothing — the built-in
 * context meter keeps its place alongside.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'context-doctor: dictionaries');
    const store = createAuditStore();
    ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
        name: 'conversation.input.right',
        // `.right` is a list seat: `id` identifies this occupant and `order`
        // fixes where it lands if another plugin ever shares the row.
        id: 'context-doctor',
        order: 20,
        store,
        locale: NS,
    }, ContextAuditRing));
}
