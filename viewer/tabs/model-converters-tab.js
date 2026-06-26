/**
 * model-converters-tab.js — compatibility shim.
 *
 * All tab orchestration now lives in:
 *   viewer/tabs/model-converters/ModelConvertersTab.js
 *
 * This file is kept only so existing import paths in the viewer shell continue
 * to resolve without changes. Do not add render orchestration logic here.
 */
export { renderModelConvertersTab } from './model-converters/index.js?v=20260625-model-converters-finalise-run-owner-1';
