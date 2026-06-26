export const SUPPORT_LOAD_ADVANCED_PROFILE_SCHEMA = 'support-load-advanced-profile/v1';
export const SUPPORT_LOAD_ADVANCED_PROFILE_VERSION = '20260623-support-load-advanced-profiles-1';
export const SUPPORT_LOAD_DEFAULT_PROFILE_ID = 'ACCESS_TEMP_WALL_WEIGHTED_V1';

const DEFAULT_PROFILE = Object.freeze({
  schema: SUPPORT_LOAD_ADVANCED_PROFILE_SCHEMA,
  version: SUPPORT_LOAD_ADVANCED_PROFILE_VERSION,
  profileId: SUPPORT_LOAD_DEFAULT_PROFILE_ID,
  displayName: 'Access temperature / wall weighted support load profile',
  status: 'CALCULATION_ENABLED',
  vertical: Object.freeze({ gravityFactor: 10, loadFactor: 1.1 }),
  rounding: Object.freeze({ roundMajor: 100, roundStep: 50, roundMode: 'up' }),
  tempFunction: Object.freeze({ profileId: 'TEMP_FNC_IDENTITY', mode: 'identity', points: Object.freeze([]) }),
  guide: Object.freeze({
    enabled: true,
    temperatureMultiplier: 0.1,
    spanLoadMultiplier: 0.3,
    wallReferenceMm: 6.3,
    tempDivisor: 100,
    divisor: 1.23,
    minimumOpeVerticalFactor: 0.3
  }),
  lineStop: Object.freeze({
    enabled: true,
    scale: 1000,
    coefficient: 0.0209,
    pi: 3.14,
    sectionDivisor: 32,
    exponent: 0.5079,
    tempDivisor: 100,
    divisor: 1.23,
    idExpression: 'D_MINUS_WT'
  }),
  policy: Object.freeze({
    inputSource: 'pipe.attributes.supportLoadInput',
    outputTarget: 'calculatedFields.supportLoads',
    noMasterLookupInFormulaEngine: true,
    noMissingValueTopUp: true,
    noInputMutation: true
  })
});

const DISABLED_ADVANCED_PROFILES = Object.freeze([
  Object.freeze({
    profileId: 'IMPORTED_CAESAR_RESTRAINT_LOADS_V1',
    displayName: 'Imported CAESAR restraint loads',
    status: 'DISABLED_REQUIRES_IMPORTED_RESTRAINT_TABLE',
    reason: 'External restraint loads must be imported and reviewed before this profile can be calculated.'
  }),
  Object.freeze({
    profileId: 'THERMAL_FRICTION_AXIAL_PROFILE_V1',
    displayName: 'Thermal / friction / axial profile',
    status: 'DISABLED_REQUIRES_PROJECT_RULES',
    reason: 'Project-specific friction, thermal, and axial rules are not fabricated by the base formula engine.'
  })
]);

function text(value) { return String(value ?? '').trim(); }
function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
function pos(value, fallback) {
  const n = number(value);
  return n !== null && n > 0 ? n : fallback;
}
function bool(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined || value === '') return fallback;
  return !['false', '0', 'no', 'off', 'disabled'].includes(text(value).toLowerCase());
}
function points(value) {
  return (Array.isArray(value) ? value : [])
    .map(point => Object.freeze({ inputC: number(point?.inputC ?? point?.x), factor: number(point?.factor ?? point?.y) }))
    .filter(point => point.inputC !== null && point.factor !== null)
    .sort((a, b) => a.inputC - b.inputC);
}
function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return Object.freeze(value);
}

export function normalizeSupportLoadFormulaProfile(profileLike = {}) {
  const source = profileLike && typeof profileLike === 'object' ? profileLike : {};
  const sourceGuide = source.guide || {};
  const sourceLineStop = source.lineStop || {};
  const sourceVertical = source.vertical || {};
  const sourceRounding = source.rounding || {};
  const sourceTemp = source.tempFunction || source.tempFn || {};
  const profile = {
    schema: SUPPORT_LOAD_ADVANCED_PROFILE_SCHEMA,
    version: SUPPORT_LOAD_ADVANCED_PROFILE_VERSION,
    profileId: text(source.profileId) || SUPPORT_LOAD_DEFAULT_PROFILE_ID,
    displayName: text(source.displayName) || DEFAULT_PROFILE.displayName,
    status: text(source.status) || 'CALCULATION_ENABLED',
    vertical: Object.freeze({
      gravityFactor: pos(sourceVertical.gravityFactor ?? source.gravityFactor, DEFAULT_PROFILE.vertical.gravityFactor),
      loadFactor: pos(sourceVertical.loadFactor ?? source.verticalLoadFactor, DEFAULT_PROFILE.vertical.loadFactor)
    }),
    rounding: Object.freeze({
      roundMajor: pos(sourceRounding.roundMajor ?? source.roundMajor, DEFAULT_PROFILE.rounding.roundMajor),
      roundStep: pos(sourceRounding.roundStep ?? source.roundStep, DEFAULT_PROFILE.rounding.roundStep),
      roundMode: text(sourceRounding.roundMode ?? source.roundMode) || DEFAULT_PROFILE.rounding.roundMode
    }),
    tempFunction: Object.freeze({
      profileId: text(sourceTemp.profileId ?? source.tempFunctionProfileId) || DEFAULT_PROFILE.tempFunction.profileId,
      mode: text(sourceTemp.mode ?? source.tempFunctionMode) || DEFAULT_PROFILE.tempFunction.mode,
      points: Object.freeze(points(sourceTemp.points))
    }),
    guide: Object.freeze({
      enabled: bool(sourceGuide.enabled, DEFAULT_PROFILE.guide.enabled),
      temperatureMultiplier: pos(sourceGuide.temperatureMultiplier ?? source.guideTemperatureMultiplier, DEFAULT_PROFILE.guide.temperatureMultiplier),
      spanLoadMultiplier: pos(sourceGuide.spanLoadMultiplier ?? source.guideSpanLoadMultiplier, DEFAULT_PROFILE.guide.spanLoadMultiplier),
      wallReferenceMm: pos(sourceGuide.wallReferenceMm ?? source.guideWallReferenceMm, DEFAULT_PROFILE.guide.wallReferenceMm),
      tempDivisor: pos(sourceGuide.tempDivisor ?? source.guideTempDivisor, DEFAULT_PROFILE.guide.tempDivisor),
      divisor: pos(sourceGuide.divisor ?? source.guideDivisor, DEFAULT_PROFILE.guide.divisor),
      minimumOpeVerticalFactor: pos(sourceGuide.minimumOpeVerticalFactor ?? source.guideMinimumOpeVerticalFactor, DEFAULT_PROFILE.guide.minimumOpeVerticalFactor)
    }),
    lineStop: Object.freeze({
      enabled: bool(sourceLineStop.enabled, DEFAULT_PROFILE.lineStop.enabled),
      scale: pos(sourceLineStop.scale ?? source.lineStopScale, DEFAULT_PROFILE.lineStop.scale),
      coefficient: pos(sourceLineStop.coefficient ?? source.lineStopCoefficient, DEFAULT_PROFILE.lineStop.coefficient),
      pi: pos(sourceLineStop.pi ?? source.lineStopPi, DEFAULT_PROFILE.lineStop.pi),
      sectionDivisor: pos(sourceLineStop.sectionDivisor ?? source.lineStopSectionDivisor, DEFAULT_PROFILE.lineStop.sectionDivisor),
      exponent: pos(sourceLineStop.exponent ?? source.lineStopExponent, DEFAULT_PROFILE.lineStop.exponent),
      tempDivisor: pos(sourceLineStop.tempDivisor ?? source.lineStopTempDivisor, DEFAULT_PROFILE.lineStop.tempDivisor),
      divisor: pos(sourceLineStop.divisor ?? source.lineStopDivisor, DEFAULT_PROFILE.lineStop.divisor),
      idExpression: text(sourceLineStop.idExpression ?? source.lineStopIdExpression) || DEFAULT_PROFILE.lineStop.idExpression
    }),
    policy: Object.freeze({ ...DEFAULT_PROFILE.policy, ...(source.policy || {}) })
  };
  return freezeDeep(profile);
}

export function resolveSupportLoadTempFnC(tempC, profileLike = {}) {
  const temp = number(tempC);
  if (temp === null) return null;
  const profile = normalizeSupportLoadFormulaProfile(profileLike);
  const mode = text(profile.tempFunction.mode).toLowerCase();
  const pts = profile.tempFunction.points;
  if ((mode === 'table' || mode === 'table-linear' || mode === 'linear') && pts.length) {
    if (temp <= pts[0].inputC) return pts[0].factor;
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1], b = pts[i];
      if (temp <= b.inputC) {
        const span = b.inputC - a.inputC;
        if (!span) return b.factor;
        return a.factor + (b.factor - a.factor) * ((temp - a.inputC) / span);
      }
    }
    return pts[pts.length - 1].factor;
  }
  return temp;
}

export function supportLoadFormulaProfileAudit(profileLike = {}) {
  const profile = normalizeSupportLoadFormulaProfile(profileLike);
  return Object.freeze([
    Object.freeze({ source: 'SUPPORT_LOAD_ADVANCED_PROFILE', field: 'profileId', value: profile.profileId }),
    Object.freeze({ source: 'SUPPORT_LOAD_ADVANCED_PROFILE', field: 'inputSource', value: profile.policy.inputSource }),
    Object.freeze({ source: 'SUPPORT_LOAD_ADVANCED_PROFILE', field: 'guideMinimumOpeVerticalFactor', value: profile.guide.minimumOpeVerticalFactor }),
    Object.freeze({ source: 'SUPPORT_LOAD_ADVANCED_PROFILE', field: 'lineStopIdExpression', value: profile.lineStop.idExpression }),
    Object.freeze({ source: 'SUPPORT_LOAD_ADVANCED_PROFILE', field: 'rounding', value: `major=${profile.rounding.roundMajor}, step=${profile.rounding.roundStep}, mode=${profile.rounding.roundMode}` })
  ]);
}

export function summarizeSupportLoadAdvancedProfiles() {
  const base = normalizeSupportLoadFormulaProfile(DEFAULT_PROFILE);
  return freezeDeep({
    schema: 'support-load-advanced-profile-summary/v1',
    version: SUPPORT_LOAD_ADVANCED_PROFILE_VERSION,
    enabledProfiles: [base],
    disabledProfiles: DISABLED_ADVANCED_PROFILES,
    policy: base.policy,
    status: 'ADVANCED_PROFILE_REGISTRY_READY'
  });
}
