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
import annexADailyRoutineInspection from '../checklists/annex-a-daily-routine-inspection-checklist.json';
import annexADailyRoutineInspectionMap from '../field-maps/annex-a-daily-routine-inspection-checklist-ed01.json';
import annexBOperationalControlInspection from '../checklists/annex-b-operational-control-inspection-checklist.json';
import annexBOperationalControlInspectionMap from '../field-maps/annex-b-operational-control-inspection-checklist-ed01.json';
import annexCTechnicalOversightFieldRecord from '../checklists/annex-c-technical-oversight-inspection-field-record.json';
import annexCTechnicalOversightFieldRecordMap from '../field-maps/annex-c-technical-oversight-inspection-field-record-ed01.json';
import birdSightingsLogSheet from '../checklists/bird-sightings-log-sheet.json';
import birdSightingsLogSheetMap from '../field-maps/bird-sightings-log-sheet-ed01.json';
import attendanceListWildlifeAttractantInspection from '../checklists/attendance-list-wildlife-attractant-inspection.json';
import attendanceListWildlifeAttractantInspectionMap from '../field-maps/attendance-list-wildlife-attractant-inspection-ed01.json';
import monthlyWildlifeIncursionLogMovementArea from '../checklists/monthly-wildlife-incursion-log-movement-area.json';
import monthlyWildlifeIncursionLogMovementAreaMap from '../field-maps/monthly-wildlife-incursion-log-movement-area-ed01.json';
import wildlifeFindingsReport from '../checklists/wildlife-findings-report.json';
import wildlifeFindingsReportMap from '../field-maps/wildlife-findings-report-ed01.json';
import wildlifeIncursionReportMovementArea from '../checklists/wildlife-incursion-report-movement-area.json';
import wildlifeIncursionReportMovementAreaMap from '../field-maps/wildlife-incursion-report-movement-area-ed01.json';
import aerodromeHazardReportingForm from '../checklists/aerodrome-hazard-reporting-form.json';
import aerodromeHazardReportingFormMap from '../field-maps/aerodrome-hazard-reporting-form-ed01.json';
import annexEAerodromeSignInspection from '../checklists/annex-e-aerodrome-sign-inspection-checklist.json';
import annexEAerodromeSignInspectionMap from '../field-maps/annex-e-aerodrome-sign-inspection-checklist-ed01.json';
import annexFUnpavedAreaRoutineInspection from '../checklists/annex-f-unpaved-area-routine-inspection-checklist.json';
import annexFUnpavedAreaRoutineInspectionMap from '../field-maps/annex-f-unpaved-area-routine-inspection-checklist-ed01.json';
import annexIGrassCuttingActivityLog from '../checklists/annex-i-grass-cutting-activity-log.json';
import annexIGrassCuttingActivityLogMap from '../field-maps/annex-i-grass-cutting-activity-log-ed01.json';
import annexJConstructionAreaDailySafety from '../checklists/annex-j-construction-area-daily-safety-inspection-checkl.json';
import annexJConstructionAreaDailySafetyMap from '../field-maps/annex-j-construction-area-daily-safety-inspection-checkl-ed01.json';
import annexKConstructionSafetyPlan from '../checklists/annex-k-construction-safety-plan-minimum-format-template.json';
import annexKConstructionSafetyPlanMap from '../field-maps/annex-k-construction-safety-plan-minimum-format-template-ed01.json';
import annexLReferenceDocuments from '../checklists/annex-l-reference-documents.json';
import annexLReferenceDocumentsMap from '../field-maps/annex-l-reference-documents-ed01.json';

/**
 * VAES entries below are generated — run `node scripts/vaes-extract.mjs <pdf> src/data`
 * to add or refresh one, then paste its entry here. Every coordinate in the
 * referenced field map is a measured glyph position from the approved PDF.
 *
 * `assignments` drives who a form belongs to and on what cadence. It is not a
 * permission — everyone can open every form.
 * `role` matches a seeded user role; `frequency` matches the scheduler's
 * cadence vocabulary. `on_demand` means startable but never auto-scheduled.
 */
export const TEMPLATE_REGISTRY = [
  {
    key: 'annex-d-drainage',
    group: 'Duty Manager',
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
    group: 'Crash Fire & Rescue',
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
    group: 'Crash Fire & Rescue',
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
    group: 'Crash Fire & Rescue',
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
    group: 'Electrical Engineer',
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
    group: 'Crash Fire & Rescue',
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
    group: 'Crash Fire & Rescue',
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
    group: 'Crash Fire & Rescue',
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
    group: 'Crash Fire & Rescue',
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
    group: 'Crash Fire & Rescue',
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
    group: 'Electrical Engineer',
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
    group: 'Crash Fire & Rescue',
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
    group: 'Crash Fire & Rescue',
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
    group: 'Crash Fire & Rescue',
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
    group: 'Crash Fire & Rescue',
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
    group: 'Electrical Engineer',
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
    group: 'Crash Fire & Rescue',
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
    group: 'Crash Fire & Rescue',
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
    group: 'Crash Fire & Rescue',
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
    group: 'Crash Fire & Rescue',
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
    group: 'Crash Fire & Rescue',
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
  {
    key: 'annex-a-daily-routine-inspection-checklist',
    group: 'Crash Fire & Rescue',
    code: annexADailyRoutineInspection.code,
    version: 'ed01',
    title: annexADailyRoutineInspection.title,
    annexLabel: annexADailyRoutineInspection.annexLabel,
    family: 'PMM',
    manual: 'Maintenance Paved and Unpaved Manual',
    department: 'Operations',
    defaultFrequency: 'daily',
    schema: annexADailyRoutineInspection,
    fieldMap: annexADailyRoutineInspectionMap,
    assignments: [
      { department: 'Operations', role: 'cfr', frequency: 'daily' },
      { department: 'Operations', role: 'om', frequency: 'on_demand' },
    ],
  },
  {
    key: 'annex-b-operational-control-inspection-checklist',
    group: 'Apron Supervisor',
    code: annexBOperationalControlInspection.code,
    version: 'ed01',
    title: annexBOperationalControlInspection.title,
    annexLabel: annexBOperationalControlInspection.annexLabel,
    family: 'PMM',
    manual: 'Maintenance Paved and Unpaved Manual',
    department: 'Operations',
    defaultFrequency: 'weekly',
    schema: annexBOperationalControlInspection,
    fieldMap: annexBOperationalControlInspectionMap,
    assignments: [
      { department: 'Operations', role: 'apron_supervisor', frequency: 'weekly' },
      { department: 'Operations', role: 'om', frequency: 'on_demand' },
    ],
  },
  {
    key: 'annex-c-technical-oversight-inspection-field-record',
    group: 'Civil Engineer',
    code: annexCTechnicalOversightFieldRecord.code,
    version: 'ed01',
    title: annexCTechnicalOversightFieldRecord.title,
    annexLabel: annexCTechnicalOversightFieldRecord.annexLabel,
    family: 'PMM',
    manual: 'Maintenance Paved and Unpaved Manual',
    department: 'Engineering',
    defaultFrequency: 'quarterly',
    schema: annexCTechnicalOversightFieldRecord,
    fieldMap: annexCTechnicalOversightFieldRecordMap,
    assignments: [
      { department: 'Engineering', role: 'cec', frequency: 'quarterly' },
      { department: 'Operations', role: 'om', frequency: 'on_demand' },
    ],
  },
  {
    key: 'annex-e-aerodrome-sign-inspection-checklist',
    group: 'Apron Supervisor',
    code: annexEAerodromeSignInspection.code,
    version: 'ed01',
    title: annexEAerodromeSignInspection.title,
    annexLabel: annexEAerodromeSignInspection.annexLabel,
    family: 'PMM',
    manual: 'Maintenance Paved and Unpaved Manual',
    department: 'Operations',
    defaultFrequency: 'weekly',
    schema: annexEAerodromeSignInspection,
    fieldMap: annexEAerodromeSignInspectionMap,
    assignments: [
      { department: 'Operations', role: 'apron_supervisor', frequency: 'weekly' },
      { department: 'Operations', role: 'om', frequency: 'on_demand' },
    ],
  },
  {
    key: 'annex-f-unpaved-area-routine-inspection-checklist',
    group: 'Apron Supervisor',
    code: annexFUnpavedAreaRoutineInspection.code,
    version: 'ed01',
    title: annexFUnpavedAreaRoutineInspection.title,
    annexLabel: annexFUnpavedAreaRoutineInspection.annexLabel,
    family: 'PMM',
    manual: 'Maintenance Paved and Unpaved Manual',
    department: 'Operations',
    defaultFrequency: 'weekly',
    schema: annexFUnpavedAreaRoutineInspection,
    fieldMap: annexFUnpavedAreaRoutineInspectionMap,
    assignments: [
      { department: 'Operations', role: 'apron_supervisor', frequency: 'weekly' },
      { department: 'Operations', role: 'om', frequency: 'on_demand' },
    ],
  },
  {
    key: 'annex-i-grass-cutting-activity-log',
    group: 'Operations Manager',
    code: annexIGrassCuttingActivityLog.code,
    version: 'ed01',
    title: annexIGrassCuttingActivityLog.title,
    annexLabel: annexIGrassCuttingActivityLog.annexLabel,
    family: 'PMM',
    manual: 'Maintenance Paved and Unpaved Manual',
    department: 'Operations',
    defaultFrequency: 'on_demand',
    schema: annexIGrassCuttingActivityLog,
    fieldMap: annexIGrassCuttingActivityLogMap,
    assignments: [
      { department: 'Operations', role: 'om', frequency: 'on_demand' },
      { department: 'Operations', role: 'om', frequency: 'on_demand' },
    ],
  },
  {
    key: 'annex-j-construction-area-daily-safety-inspection-checkl',
    group: 'Apron Supervisor',
    code: annexJConstructionAreaDailySafety.code,
    version: 'ed01',
    title: annexJConstructionAreaDailySafety.title,
    annexLabel: annexJConstructionAreaDailySafety.annexLabel,
    family: 'PMM',
    manual: 'Maintenance Paved and Unpaved Manual',
    department: 'Operations',
    defaultFrequency: 'daily',
    schema: annexJConstructionAreaDailySafety,
    fieldMap: annexJConstructionAreaDailySafetyMap,
    assignments: [
      { department: 'Operations', role: 'apron_supervisor', frequency: 'daily' },
      { department: 'Operations', role: 'om', frequency: 'on_demand' },
    ],
  },
  {
    key: 'annex-k-construction-safety-plan-minimum-format-template',
    group: 'General Checklist',
    code: annexKConstructionSafetyPlan.code,
    version: 'ed01',
    title: annexKConstructionSafetyPlan.title,
    annexLabel: annexKConstructionSafetyPlan.annexLabel,
    family: 'PMM',
    manual: 'Maintenance Paved and Unpaved Manual',
    department: 'Engineering',
    defaultFrequency: 'on_demand',
    documentType: 'plan',
    schema: annexKConstructionSafetyPlan,
    fieldMap: annexKConstructionSafetyPlanMap,
    assignments: [
      { department: 'Engineering', role: 'cec', frequency: 'on_demand' },
      { department: 'Operations', role: 'coo', frequency: 'on_demand' },
    ],
  },
  {
    key: 'annex-l-reference-documents',
    group: 'General Checklist',
    code: annexLReferenceDocuments.code,
    version: 'ed01',
    title: annexLReferenceDocuments.title,
    annexLabel: annexLReferenceDocuments.annexLabel,
    family: 'PMM',
    manual: 'Maintenance Paved and Unpaved Manual',
    department: 'Operations',
    defaultFrequency: 'on_demand',
    documentType: 'reference',
    schema: annexLReferenceDocuments,
    fieldMap: annexLReferenceDocumentsMap,
    assignments: [{ department: 'Operations', role: 'om', frequency: 'on_demand' }],
  },
  {
    key: 'aerodrome-hazard-reporting-form',
    group: 'SMS',
    code: aerodromeHazardReportingForm.code,
    version: 'ed01',
    title: aerodromeHazardReportingForm.title,
    annexLabel: aerodromeHazardReportingForm.annexLabel,
    family: 'AOM',
    manual: 'Aerodrome Operations Manual',
    department: 'Operations',
    defaultFrequency: 'on_demand',
    documentType: 'report',
    schema: aerodromeHazardReportingForm,
    fieldMap: aerodromeHazardReportingFormMap,
    // A hazard is reported when someone sees one, so nothing is scheduled. The
    // form names SMS as its owner, which until now held no form at all.
    assignments: [{ department: 'Operations', role: 'sms', frequency: 'on_demand' }],
  },
  {
    key: 'wildlife-findings-report',
    group: 'Wildlife',
    code: wildlifeFindingsReport.code,
    version: 'ed01',
    title: wildlifeFindingsReport.title,
    annexLabel: wildlifeFindingsReport.annexLabel,
    family: 'AOM',
    manual: 'Aerodrome Operational Manual',
    department: 'Operations',
    defaultFrequency: 'on_demand',
    documentType: 'report',
    schema: wildlifeFindingsReport,
    fieldMap: wildlifeFindingsReportMap,
    assignments: [{ department: 'Operations', role: 'sms', frequency: 'on_demand' }],
  },
  {
    key: 'wildlife-incursion-report-movement-area',
    group: 'Wildlife',
    code: wildlifeIncursionReportMovementArea.code,
    version: 'ed01',
    title: wildlifeIncursionReportMovementArea.title,
    annexLabel: wildlifeIncursionReportMovementArea.annexLabel,
    family: 'AOM',
    manual: 'Aerodrome Operational Manual',
    department: 'Operations',
    defaultFrequency: 'on_demand',
    documentType: 'report',
    schema: wildlifeIncursionReportMovementArea,
    fieldMap: wildlifeIncursionReportMovementAreaMap,
    // BACC's staff list names nobody for wildlife. SMS is the nearest real post
    // and holds it until BACC says otherwise.
    assignments: [{ department: 'Operations', role: 'sms', frequency: 'on_demand' }],
  },
  {
    key: 'bird-sightings-log-sheet',
    group: 'Wildlife',
    code: birdSightingsLogSheet.code,
    version: 'ed01',
    title: birdSightingsLogSheet.title,
    annexLabel: birdSightingsLogSheet.annexLabel,
    family: 'AOM',
    manual: 'Aerodrome Operational Manual',
    department: 'Operations',
    defaultFrequency: 'on_demand',
    documentType: 'log',
    schema: birdSightingsLogSheet,
    fieldMap: birdSightingsLogSheetMap,
    assignments: [{ department: 'Operations', role: 'sms', frequency: 'on_demand' }],
  },
  {
    key: 'attendance-list-wildlife-attractant-inspection',
    group: 'Wildlife',
    code: attendanceListWildlifeAttractantInspection.code,
    version: 'ed01',
    title: attendanceListWildlifeAttractantInspection.title,
    annexLabel: attendanceListWildlifeAttractantInspection.annexLabel,
    family: 'AOM',
    manual: 'Aerodrome Operational Manual',
    department: 'Operations',
    defaultFrequency: 'on_demand',
    documentType: 'log',
    schema: attendanceListWildlifeAttractantInspection,
    fieldMap: attendanceListWildlifeAttractantInspectionMap,
    assignments: [{ department: 'Operations', role: 'sms', frequency: 'on_demand' }],
  },
  {
    key: 'monthly-wildlife-incursion-log-movement-area',
    group: 'Wildlife',
    code: monthlyWildlifeIncursionLogMovementArea.code,
    version: 'ed01',
    title: monthlyWildlifeIncursionLogMovementArea.title,
    annexLabel: monthlyWildlifeIncursionLogMovementArea.annexLabel,
    family: 'AOM',
    manual: 'Aerodrome Operational Manual',
    department: 'Operations',
    defaultFrequency: 'on_demand',
    documentType: 'log',
    schema: monthlyWildlifeIncursionLogMovementArea,
    fieldMap: monthlyWildlifeIncursionLogMovementAreaMap,
    assignments: [{ department: 'Operations', role: 'sms', frequency: 'on_demand' }],
  },
];

/**
 * PMM Annexes A–J below are generated — run
 * `node scripts/pmm-extract.mjs <pdf> src/data` to add or refresh one.
 *
 * Their `role` values are taken from the owner printed on each approved form
 * (CFR, Apron Supervisor, CEC, OM). `cfr` and `apron_supervisor` have no seeded
 * user yet, so today only OM/COO/admin can open those forms — the accounts are
 * a separate decision, not a mapping defect.
 */


/**
 * How the approved forms are filed in BACC's own document set — the folder a
 * form arrived in is the team that owns it, so the catalogue groups by this
 * rather than by the manual it belongs to.
 */
export const GROUP_ORDER = [
  'Apron Supervisor',
  'Civil Engineer',
  'Crash Fire & Rescue',
  'Duty Manager',
  'Electrical Engineer',
  'General Checklist',
  'Operations Manager',
  'SMS',
  'Wildlife',
];

/** Human labels for the approved document families. */
export const FAMILY_LABELS = {
  PMM: 'Maintenance Paved & Unpaved (Annex 1-1)',
  VAES: 'Visual Aids & Electrical Systems (Annex 1-2)',
  AOM: 'Aerodrome Operations Manual (Annexes 2-1)',
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

/**
 * The team that owns a form, by its form number.
 *
 * Incidents and approvals only carry the code of the form they came from, but
 * the useful question on both screens is "whose is this?" — and that answer
 * already exists here, in the folder the approved form arrived in.
 */
export function groupForCode(code) {
  return TEMPLATE_REGISTRY.find((t) => t.code === code)?.group ?? null;
}

/*
 * `templatesForProfile` used to live here — a second, uncalled copy of the
 * role-and-department filter that `templates.list` applied. It is deleted
 * rather than corrected: BACC's rule is that everyone can see every checklist
 * on file, and a dead function asserting the opposite is a trap for whoever
 * wires up the next template list.
 */
