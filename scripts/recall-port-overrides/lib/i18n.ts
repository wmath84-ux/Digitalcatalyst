/**
 * Recall i18n bootstrap — Digitalcatalyst port override.
 *
 * Why this file is an override (see `scripts/recall-port-overrides/`): upstream
 * boots `i18next` + `react-i18next` + a language detector here. The port keeps
 * Recall's translation resources and language behaviour but routes them through
 * the in-tree shim `../shims/i18n`, so the lazy-loaded Revision chunk does not
 * carry a second i18n runtime (migration brief §28).
 *
 * The ported components only ever import `{ useTranslation }` from
 * `react-i18next` (rewritten to the shim) or the `i18n` default from this
 * module, so the exported surface below is all that is needed.
 */

import i18n from "../shims/i18n";

export { useTranslation } from "../shims/i18n";

export default i18n;
