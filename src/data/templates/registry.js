/**
 * Template registry — the single place a form becomes visible to the app.
 *
 * Adding an approved form is four things and no code changes anywhere else:
 *   1. drop the approved base PDF in  src/assets/forms/
 *   2. add the content schema in      src/data/checklists/
 *   3. add the field map in           src/data/field-maps/
 *   4. add one entry below
 *
 * Nothing may import a schema or field map directly — the seed, the catalogue,
 * the picker and the export pipeline all read from here. Before this existed the
 * seed hardcoded Annex D and did `templates[0]`, so no second form was reachable.
 */
import annexD from '../checklists/annex-d-drainage.json';
import annexDFieldMap from '../field-maps/annex-d-drainage-ed01.json';
import c01SafetyBoardAndEquipmentInspection from '../checklists/appendix-c01-safety-board-and-equipment-inspection.json';
import c01SafetyBoardAndEquipmentInspectionMap from '../field-maps/appendix-c01-safety-board-and-equipment-inspection-ed01.json';
import c02AirfieldLightingVisualInspectionAirfieldIns from '../checklists/appendix-c02-airfield-lighting-visual-inspection-airfield-ins.json';
import c02AirfieldLightingVisualInspectionAirfieldInsMap from '../field-maps/appendix-c02-airfield-lighting-visual-inspection-airfield-ins-ed01.json';
import c03RunwayAndTaxiwayLightFixturePmi from '../checklists/appendix-c03-runway-and-taxiway-light-fixture-pmi.json';
import c03RunwayAndTaxiwayLightFixturePmiMap from '../field-maps/appendix-c03-runway-and-taxiway-light-fixture-pmi-ed01.json';
import c04RunwayTaxiwayPhotometricMeasurement from '../checklists/appendix-c04-runway-taxiway-photometric-measurement.json';
import c04RunwayTaxiwayPhotometricMeasurementMap from '../field-maps/appendix-c04-runway-taxiway-photometric-measurement-ed01.json';
import c05PapiInspection from '../checklists/appendix-c05-papi-inspection.json';
import c05PapiInspectionMap from '../field-maps/appendix-c05-papi-inspection-ed01.json';
import c06PapiAlignmentVerification from '../checklists/appendix-c06-papi-alignment-verification.json';
import c06PapiAlignmentVerificationMap from '../field-maps/appendix-c06-papi-alignment-verification-ed01.json';
import c07IlluminatedGuidanceSignsInspection from '../checklists/appendix-c07-illuminated-guidance-signs-inspection.json';
import c07IlluminatedGuidanceSignsInspectionMap from '../field-maps/appendix-c07-illuminated-guidance-signs-inspection-ed01.json';
import c08WindCone from '../checklists/appendix-c08-wind-cone.json';
import c08WindConeMap from '../field-maps/appendix-c08-wind-cone-ed01.json';
import c09ObstructionLightInspection from '../checklists/appendix-c09-obstruction-light-inspection.json';
import c09ObstructionLightInspectionMap from '../field-maps/appendix-c09-obstruction-light-inspection-ed01.json';
import c10ObstructionLightEngineeringInspection from '../checklists/appendix-c10-obstruction-light-engineering-inspection.json';
import c10ObstructionLightEngineeringInspectionMap from '../field-maps/appendix-c10-obstruction-light-engineering-inspection-ed01.json';
import c11AirportLightingVaultInspection from '../checklists/appendix-c11-airport-lighting-vault-inspection.json';
import c11AirportLightingVaultInspectionMap from '../field-maps/appendix-c11-airport-lighting-vault-inspection-ed01.json';
import c12AirportLightingVaultInspection from '../checklists/appendix-c12-airport-lighting-vault-inspection.json';
import c12AirportLightingVaultInspectionMap from '../field-maps/appendix-c12-airport-lighting-vault-inspection-ed01.json';
import c13VaultInsulationResistanceTest from '../checklists/appendix-c13-vault-insulation-resistance-test.json';
import c13VaultInsulationResistanceTestMap from '../field-maps/appendix-c13-vault-insulation-resistance-test-ed01.json';
import c14AirportLightingVaultInspection from '../checklists/appendix-c14-airport-lighting-vault-inspection.json';
import c14AirportLightingVaultInspectionMap from '../field-maps/appendix-c14-airport-lighting-vault-inspection-ed01.json';
import c15VaultEngineeringInspection from '../checklists/appendix-c15-vault-engineering-inspection.json';
import c15VaultEngineeringInspectionMap from '../field-maps/appendix-c15-vault-engineering-inspection-ed01.json';
import c16CcrInspectionLog from '../checklists/appendix-c16-ccr-inspection-log.json';
import c16CcrInspectionLogMap from '../field-maps/appendix-c16-ccr-inspection-log-ed01.json';
import c17CcrInspection from '../checklists/appendix-c17-ccr-inspection.json';
import c17CcrInspectionMap from '../field-maps/appendix-c17-ccr-inspection-ed01.json';
import c18StandbyGeneratorOperationalCheck from '../checklists/appendix-c18-standby-generator-operational-check.json';
import c18StandbyGeneratorOperationalCheckMap from '../field-maps/appendix-c18-standby-generator-operational-check-ed01.json';
import c19BlackoutTransferTestRecord from '../checklists/appendix-c19-blackout-transfer-test-record.json';
import c19BlackoutTransferTestRecordMap from '../field-maps/appendix-c19-blackout-transfer-test-record-ed01.json';
import c20ConstructionAreaSignageLightingAndNavaidIn from '../checklists/appendix-c20-construction-area-signage-lighting-and-navaid-in.json';
import c20ConstructionAreaSignageLightingAndNavaidInMap from '../field-maps/appendix-c20-construction-area-signage-lighting-and-navaid-in-ed01.json';

/**
 * VAES entries below are generated — run `node scripts/vaes-extract.mjs <pdf> src/data`
 * to add or refresh one, then paste its entry here. Every coordinate in the
 * referenced field map is a measured glyph position from the approved PDF.
 *
 * `assignments` drives who sees the form and on what cadence (BACC §4).
 * `role` matches a seeded user role; `frequency` matches the scheduler's
 * cadence vocabulary. `on_demand` means startable but never auto-scheduled.
 */
export const TEMPLATE_REGISTRY = [
  {
    key: 'annex-d-drainage',
    code: annexD.code,
    version: 'ed01',
    title: annexD.title,
    annexLabel: annexD.annexLabel,
    family: 'PMM',
    manual: 'Maintenance Paved and Unpaved Manual',
    department: 'Maintenance',
    defaultFrequency: 'monthly',
    schema: annexD,
    fieldMap: annexDFieldMap,
    assignments: [
      { department: 'Maintenance', role: 'inspector', frequency: 'monthly' },
      { department: 'Operations', role: 'duty_manager', frequency: 'on_demand' },
      { department: 'Maintenance', role: 'inspector', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c01-safety-board-and-equipment-inspection',
    code: c01SafetyBoardAndEquipmentInspection.code,
    version: 'ed01',
    title: c01SafetyBoardAndEquipmentInspection.title,
    annexLabel: c01SafetyBoardAndEquipmentInspection.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'monthly',
    schema: c01SafetyBoardAndEquipmentInspection,
    fieldMap: c01SafetyBoardAndEquipmentInspectionMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'monthly' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c02-airfield-lighting-visual-inspection-airfield-ins',
    code: c02AirfieldLightingVisualInspectionAirfieldIns.code,
    version: 'ed01',
    title: c02AirfieldLightingVisualInspectionAirfieldIns.title,
    annexLabel: c02AirfieldLightingVisualInspectionAirfieldIns.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'daily',
    schema: c02AirfieldLightingVisualInspectionAirfieldIns,
    fieldMap: c02AirfieldLightingVisualInspectionAirfieldInsMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'daily' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c03-runway-and-taxiway-light-fixture-pmi',
    code: c03RunwayAndTaxiwayLightFixturePmi.code,
    version: 'ed01',
    title: c03RunwayAndTaxiwayLightFixturePmi.title,
    annexLabel: c03RunwayAndTaxiwayLightFixturePmi.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'monthly',
    schema: c03RunwayAndTaxiwayLightFixturePmi,
    fieldMap: c03RunwayAndTaxiwayLightFixturePmiMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'monthly' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c04-runway-taxiway-photometric-measurement',
    code: c04RunwayTaxiwayPhotometricMeasurement.code,
    version: 'ed01',
    title: c04RunwayTaxiwayPhotometricMeasurement.title,
    annexLabel: c04RunwayTaxiwayPhotometricMeasurement.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'semi_annual',
    schema: c04RunwayTaxiwayPhotometricMeasurement,
    fieldMap: c04RunwayTaxiwayPhotometricMeasurementMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'semi_annual' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c05-papi-inspection',
    code: c05PapiInspection.code,
    version: 'ed01',
    title: c05PapiInspection.title,
    annexLabel: c05PapiInspection.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'monthly',
    schema: c05PapiInspection,
    fieldMap: c05PapiInspectionMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'monthly' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c06-papi-alignment-verification',
    code: c06PapiAlignmentVerification.code,
    version: 'ed01',
    title: c06PapiAlignmentVerification.title,
    annexLabel: c06PapiAlignmentVerification.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'annual',
    schema: c06PapiAlignmentVerification,
    fieldMap: c06PapiAlignmentVerificationMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'annual' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c07-illuminated-guidance-signs-inspection',
    code: c07IlluminatedGuidanceSignsInspection.code,
    version: 'ed01',
    title: c07IlluminatedGuidanceSignsInspection.title,
    annexLabel: c07IlluminatedGuidanceSignsInspection.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'monthly',
    schema: c07IlluminatedGuidanceSignsInspection,
    fieldMap: c07IlluminatedGuidanceSignsInspectionMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'monthly' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c08-wind-cone',
    code: c08WindCone.code,
    version: 'ed01',
    title: c08WindCone.title,
    annexLabel: c08WindCone.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'monthly',
    schema: c08WindCone,
    fieldMap: c08WindConeMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'monthly' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c09-obstruction-light-inspection',
    code: c09ObstructionLightInspection.code,
    version: 'ed01',
    title: c09ObstructionLightInspection.title,
    annexLabel: c09ObstructionLightInspection.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'monthly',
    schema: c09ObstructionLightInspection,
    fieldMap: c09ObstructionLightInspectionMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'monthly' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c10-obstruction-light-engineering-inspection',
    code: c10ObstructionLightEngineeringInspection.code,
    version: 'ed01',
    title: c10ObstructionLightEngineeringInspection.title,
    annexLabel: c10ObstructionLightEngineeringInspection.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'annual',
    schema: c10ObstructionLightEngineeringInspection,
    fieldMap: c10ObstructionLightEngineeringInspectionMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'annual' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c11-airport-lighting-vault-inspection',
    code: c11AirportLightingVaultInspection.code,
    version: 'ed01',
    title: c11AirportLightingVaultInspection.title,
    annexLabel: c11AirportLightingVaultInspection.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'daily',
    schema: c11AirportLightingVaultInspection,
    fieldMap: c11AirportLightingVaultInspectionMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'daily' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c12-airport-lighting-vault-inspection',
    code: c12AirportLightingVaultInspection.code,
    version: 'ed01',
    title: c12AirportLightingVaultInspection.title,
    annexLabel: c12AirportLightingVaultInspection.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'weekly',
    schema: c12AirportLightingVaultInspection,
    fieldMap: c12AirportLightingVaultInspectionMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'weekly' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c13-vault-insulation-resistance-test',
    code: c13VaultInsulationResistanceTest.code,
    version: 'ed01',
    title: c13VaultInsulationResistanceTest.title,
    annexLabel: c13VaultInsulationResistanceTest.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'monthly',
    schema: c13VaultInsulationResistanceTest,
    fieldMap: c13VaultInsulationResistanceTestMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'monthly' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c14-airport-lighting-vault-inspection',
    code: c14AirportLightingVaultInspection.code,
    version: 'ed01',
    title: c14AirportLightingVaultInspection.title,
    annexLabel: c14AirportLightingVaultInspection.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'semi_annual',
    schema: c14AirportLightingVaultInspection,
    fieldMap: c14AirportLightingVaultInspectionMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'semi_annual' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c15-vault-engineering-inspection',
    code: c15VaultEngineeringInspection.code,
    version: 'ed01',
    title: c15VaultEngineeringInspection.title,
    annexLabel: c15VaultEngineeringInspection.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'annual',
    schema: c15VaultEngineeringInspection,
    fieldMap: c15VaultEngineeringInspectionMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'annual' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c16-ccr-inspection-log',
    code: c16CcrInspectionLog.code,
    version: 'ed01',
    title: c16CcrInspectionLog.title,
    annexLabel: c16CcrInspectionLog.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'daily',
    schema: c16CcrInspectionLog,
    fieldMap: c16CcrInspectionLogMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'daily' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c17-ccr-inspection',
    code: c17CcrInspection.code,
    version: 'ed01',
    title: c17CcrInspection.title,
    annexLabel: c17CcrInspection.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'monthly',
    schema: c17CcrInspection,
    fieldMap: c17CcrInspectionMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'monthly' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c18-standby-generator-operational-check',
    code: c18StandbyGeneratorOperationalCheck.code,
    version: 'ed01',
    title: c18StandbyGeneratorOperationalCheck.title,
    annexLabel: c18StandbyGeneratorOperationalCheck.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'weekly',
    schema: c18StandbyGeneratorOperationalCheck,
    fieldMap: c18StandbyGeneratorOperationalCheckMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'weekly' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c19-blackout-transfer-test-record',
    code: c19BlackoutTransferTestRecord.code,
    version: 'ed01',
    title: c19BlackoutTransferTestRecord.title,
    annexLabel: c19BlackoutTransferTestRecord.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'monthly',
    schema: c19BlackoutTransferTestRecord,
    fieldMap: c19BlackoutTransferTestRecordMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'monthly' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
  {
    key: 'appendix-c20-construction-area-signage-lighting-and-navaid-in',
    code: c20ConstructionAreaSignageLightingAndNavaidIn.code,
    version: 'ed01',
    title: c20ConstructionAreaSignageLightingAndNavaidIn.title,
    annexLabel: c20ConstructionAreaSignageLightingAndNavaidIn.annexLabel,
    family: 'VAES',
    manual: 'Visual Aid and Electrical System Maintenance Manual',
    department: 'Engineering',
    defaultFrequency: 'daily',
    schema: c20ConstructionAreaSignageLightingAndNavaidIn,
    fieldMap: c20ConstructionAreaSignageLightingAndNavaidInMap,
    assignments: [
      { department: 'Engineering', role: 'electrical_tech', frequency: 'daily' },
      { department: 'Engineering', role: 'electrical_tech', frequency: 'on_demand' },
    ],
  },
];

/** Human labels for the two approved document families. */
export const FAMILY_LABELS = {
  PMM: 'Maintenance Paved & Unpaved (Annex 1-1)',
  VAES: 'Visual Aids & Electrical Systems (Annex 1-2)',
};

export const FREQUENCY_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semi_annual: 'Semi-annual',
  annual: 'Annual',
  on_demand: 'On demand',
  ad_hoc: 'Ad hoc',
};

export function getRegistryEntry(key) {
  return TEMPLATE_REGISTRY.find((t) => t.key === key) ?? null;
}

export function registryByCode(code) {
  return TEMPLATE_REGISTRY.find((t) => t.code === code) ?? null;
}

/** Every department that owns at least one approved form. */
export function registryDepartments() {
  return [...new Set(TEMPLATE_REGISTRY.map((t) => t.department))].sort();
}

/** Every cadence in use, for catalogue filters. */
export function registryFrequencies() {
  const set = new Set();
  for (const t of TEMPLATE_REGISTRY) {
    for (const a of t.assignments) set.add(a.frequency);
  }
  return [...set];
}

/**
 * Templates a given profile may open. An Electrical Maintenance Technician
 * should never be offered the drainage checklist, and vice versa — with 31
 * forms an unfiltered list is how a tool stops being used.
 * Administrators and the OM/COO see everything.
 */
export function templatesForProfile(profile) {
  if (!profile) return [];
  const role = profile.role;
  const department = profile.department;
  if (['admin', 'om', 'coo'].includes(role)) return TEMPLATE_REGISTRY;
  return TEMPLATE_REGISTRY.filter((t) =>
    t.assignments.some((a) => a.role === role || (a.department && a.department === department)),
  );
}
