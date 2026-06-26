export function installRvmCanonicalZoneSelectorBridge() {
  globalThis.__PCF_GLB_RVM_ZONE_LOD_LABELS__ = {
    version: '20260622-rvm-canonical-zone-selector-1',
    beforeRenderInstructions: async ({ instructionSet }) => instructionSet,
  };
}
installRvmCanonicalZoneSelectorBridge();
