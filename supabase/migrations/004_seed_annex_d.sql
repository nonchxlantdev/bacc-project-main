-- Seed Annex D (PGIA-PMM-F04 / ed01) from local JSON artifacts. Idempotent on (code, version).

insert into public.checklist_templates (
  code, version, title, annex_label, document_family, department,
  content_schema, field_map, base_pdf_path, effective_date, status
) values (
  'PGIA-PMM-F04',
  'ed01',
  'Drainage System Inspection Checklist',
  'Annex D',
  'PMM',
  'Maintenance',
  $schema${
  "code": "PGIA-PMM-F04",
  "annexLabel": "Annex D",
  "title": "Drainage System Inspection Checklist",
  "description": "Used for monthly routine drainage inspections and semi-annual CEC structural assessments. Completed form submitted to OM.",
  "manualHeader": {
    "line1": "AERODROME OPERATIONS MANUAL",
    "line2": "PHILIP S.W. GOLDSON INTERNATIONAL AIRPORT",
    "pageRef": "ANNEX 1-1\nPGIA 16-14"
  },
  "footer": {
    "reviewLine": "Review: Ed. 01 Annex 2-1",
    "dateLine": "Date: March 12, 2026. Maintenance Paved and Unpaved Manual.",
    "pages": [110, 111, 112]
  },
  "headerFields": [
    { "key": "date", "label": "Date", "type": "date", "required": true },
    {
      "key": "inspectionType",
      "label": "Inspection Type",
      "type": "radio",
      "required": true,
      "options": [
        { "value": "monthly_routine", "label": "Monthly Routine" },
        { "value": "semi_annual_cec", "label": "Semi-Annual Structural (CEC)" },
        { "value": "post_storm_emergency", "label": "Post-Storm Emergency" }
      ]
    },
    { "key": "conductedBy", "label": "Conducted by (Name / Position)", "type": "text", "required": true },
    { "key": "rainfallMm", "label": "Rainfall lasts 24 hrs. (mm, if applicable)", "type": "text", "required": false }
  ],
  "sections": [
    {
      "title": "SECTION 1 — RUNWAY DRAINAGE",
      "items": [
        { "code": "DR-01", "text": "Runway 07 end drainage swale clear of sediment, vegetation, and debris" },
        { "code": "DR-02", "text": "Runway 25 end drainage swales clear of sediment, vegetation, and debris" },
        { "code": "DR-03", "text": "Runway east edge drainage channel (full length) free of blockage" },
        { "code": "DR-04", "text": "Runway west edge drainage channel (full length) free of blockage" },
        { "code": "DR-05", "text": "Runway drainage outlets water discharging freely to aerodrome drainage network" },
        { "code": "DR-06", "text": "No ponding adjacent to runway edges 1 hour after end of rainfall" },
        { "code": "DR-07", "text": "No erosion channels created by surface water at runway edges" }
      ]
    },
    {
      "title": "SECTION 2 — TAXIWAY DRAINAGE",
      "items": [
        { "code": "DR-08", "text": "Taxiway Alpha drainage channels (east and west) clear, flowing" },
        { "code": "DR-09", "text": "Taxiway Bravo drainage gutters clear" },
        { "code": "DR-10", "text": "Taxiway Charlie drainage gutters clear" },
        { "code": "DR-12", "text": "No standing water on any taxiway surface 30 min after end of rainfall" }
      ]
    },
    {
      "title": "SECTION 3 — APRON DRAINAGE",
      "items": [
        { "code": "DR-13", "text": "All apron drainage channels clear and unobstructed" },
        { "code": "DR-14", "text": "All apron drainage sumps clear and flowing" },
        { "code": "DR-15", "text": "Apron drainage outlets to aerodrome storm network functioning" },
        { "code": "DR-16", "text": "No standing water on apron 30 min after end of rainfall" }
      ]
    },
    {
      "title": "SECTION 4 — CULVERTS AND CROSS-DRAINAGE STRUCTURES",
      "items": [
        { "code": "DR-17", "text": "Culvert at [Location 1] invert clear, headwalls intact, no structural cracking" },
        { "code": "DR-18", "text": "Culvert at [Location 2] invert clear, headwalls intact, no structural cracking" },
        { "code": "DR-19", "text": "Culvert at [Location 3] invert clear, headwalls intact, no structural cracking" },
        { "code": "DR-20", "text": "All identified culverts no sedimentation reducing flow area > 25%" },
        { "code": "DR-21", "text": "All culvert headwalls and wingwalls structurally intact, no separation from embankment" }
      ]
    },
    {
      "title": "SECTION 5 — UNPAVED AREA DRAINAGE (CHANNELS AND SWALES)",
      "items": [
        { "code": "DR-22", "text": "All open channels in runway strips free of vegetation blockage and sediment" },
        { "code": "DR-23", "text": "All open channels in infield areas free of blockage" },
        { "code": "DR-24", "text": "All swale slopes at minimum 1% longitudinal gradient to outlet" },
        { "code": "DR-25", "text": "No channel bank erosion creating structural failure of channel" },
        { "code": "DR-26", "text": "No channel blockage causing overflow onto adjacent safety areas" },
        { "code": "DR-27", "text": "Saturated Zone 7 areas no expansion of flooded zone beyond mapped boundaries" }
      ]
    }
  ],
  "deficienciesField": {
    "label": "DRAINAGE DEFICIENCIES FOUND (describe location, type, severity, and recommended action):",
    "type": "textarea"
  },
  "signoffs": [
    { "role": "inspector", "label": "Conducted by (Name / Position / Signature)", "dateLabel": "Date:" },
    { "role": "om_acknowledgment", "label": "OM Acknowledgment (Name / Signature / Date)", "dateLabel": "Date:" }
  ],
  "validationRules": [
    "Every item marked NO SAT requires non-empty remarks before submission."
  ],
  "notes": [
    "DR-11 is intentionally absent — the source form's numbering skips from DR-10 to DR-12. Preserve this gap exactly; do not renumber.",
    "DR-17/18/19 contain literal '[Location N]' placeholder text in the source document. Confirm with BACC whether these should be replaced with actual named culvert locations before go-live, or left as fill-in text per submission."
  ]
}$schema$::jsonb,
  $map${
  "templateKey": "annex-d-drainage",
  "templateVersion": "ed01",
  "basePdf": "annex-d-drainage-ed01.pdf",
  "origin": "pdf-points-bottom-left",
  "originNote": "Coordinates are PDF points with a bottom-left origin (pdf-lib / pdf.js). Canvas clicks in /dev/field-mapper convert as pdfY = pageHeight - (clickY / canvasHeight) * pageHeight.",
  "mapping": {
    "method": "pdf.js text positions from approved base PDF (same origin as field-mapper)",
    "durationMinutes": 22,
    "note": "Measured from pdf.js text positions on the approved Ed.01 PDF (same bottom-left origin as /dev/field-mapper). Use this number to scope the remaining 30 forms.",
    "measuredAt": "2026-08-15T15:55:10.183Z"
  },
  "pageSize": {
    "width": 612.12,
    "height": 792.12
  },
  "fields": {
    "inspection_date": {
      "page": 0,
      "x": 100,
      "y": 585.5,
      "size": 9,
      "width": 90
    },
    "inspection_type.monthly_routine": {
      "page": 0,
      "x": 279.7,
      "y": 564.7,
      "type": "mark"
    },
    "inspection_type.semi_annual_cec": {
      "page": 0,
      "x": 420,
      "y": 564.7,
      "type": "mark"
    },
    "inspection_type.post_storm_emergency": {
      "page": 0,
      "x": 260.2,
      "y": 552.7,
      "type": "mark"
    },
    "conducted_by": {
      "page": 0,
      "x": 168,
      "y": 533.8,
      "size": 9,
      "width": 360,
      "wrap": true,
      "maxLines": 2,
      "overflow": "continuation"
    },
    "rainfall_mm": {
      "page": 0,
      "x": 200,
      "y": 505,
      "size": 9,
      "width": 80
    },
    "DR-01.sat": {
      "page": 0,
      "x": 392.2,
      "y": 430.6,
      "type": "mark",
      "size": 9
    },
    "DR-01.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 430.6,
      "type": "mark",
      "size": 9
    },
    "DR-01.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 430.6,
      "width": 90,
      "height": 26,
      "size": 7,
      "wrap": true,
      "maxLines": 2,
      "overflow": "continuation"
    },
    "DR-02.sat": {
      "page": 0,
      "x": 392.2,
      "y": 401.8,
      "type": "mark",
      "size": 9
    },
    "DR-02.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 401.8,
      "type": "mark",
      "size": 9
    },
    "DR-02.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 401.8,
      "width": 90,
      "height": 26,
      "size": 7,
      "wrap": true,
      "maxLines": 2,
      "overflow": "continuation"
    },
    "DR-03.sat": {
      "page": 0,
      "x": 392.2,
      "y": 373,
      "type": "mark",
      "size": 9
    },
    "DR-03.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 373,
      "type": "mark",
      "size": 9
    },
    "DR-03.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 373,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-04.sat": {
      "page": 0,
      "x": 392.2,
      "y": 352.9,
      "type": "mark",
      "size": 9
    },
    "DR-04.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 352.9,
      "type": "mark",
      "size": 9
    },
    "DR-04.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 352.9,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-05.sat": {
      "page": 0,
      "x": 392.2,
      "y": 332.8,
      "type": "mark",
      "size": 9
    },
    "DR-05.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 332.8,
      "type": "mark",
      "size": 9
    },
    "DR-05.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 332.8,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-06.sat": {
      "page": 0,
      "x": 392.2,
      "y": 304,
      "type": "mark",
      "size": 9
    },
    "DR-06.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 304,
      "type": "mark",
      "size": 9
    },
    "DR-06.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 304,
      "width": 90,
      "height": 26,
      "size": 7,
      "wrap": true,
      "maxLines": 2,
      "overflow": "continuation"
    },
    "DR-07.sat": {
      "page": 0,
      "x": 392.2,
      "y": 284,
      "type": "mark",
      "size": 9
    },
    "DR-07.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 284,
      "type": "mark",
      "size": 9
    },
    "DR-07.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 284,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-08.sat": {
      "page": 0,
      "x": 392.2,
      "y": 219.5,
      "type": "mark",
      "size": 9
    },
    "DR-08.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 219.5,
      "type": "mark",
      "size": 9
    },
    "DR-08.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 219.5,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-09.sat": {
      "page": 0,
      "x": 392.2,
      "y": 199.4,
      "type": "mark",
      "size": 9
    },
    "DR-09.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 199.4,
      "type": "mark",
      "size": 9
    },
    "DR-09.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 199.4,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-10.sat": {
      "page": 0,
      "x": 392.2,
      "y": 179.3,
      "type": "mark",
      "size": 9
    },
    "DR-10.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 179.3,
      "type": "mark",
      "size": 9
    },
    "DR-10.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 179.3,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-12.sat": {
      "page": 0,
      "x": 392.2,
      "y": 159.3,
      "type": "mark",
      "size": 9
    },
    "DR-12.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 159.3,
      "type": "mark",
      "size": 9
    },
    "DR-12.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 159.3,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-13.sat": {
      "page": 0,
      "x": 392.2,
      "y": 86.1,
      "type": "mark",
      "size": 9
    },
    "DR-13.no_sat": {
      "page": 0,
      "x": 428.2,
      "y": 86.1,
      "type": "mark",
      "size": 9
    },
    "DR-13.remarks": {
      "page": 0,
      "x": 456.1,
      "y": 86.1,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-14.sat": {
      "page": 1,
      "x": 392.2,
      "y": 680.1,
      "type": "mark",
      "size": 9
    },
    "DR-14.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 680.1,
      "type": "mark",
      "size": 9
    },
    "DR-14.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 680.1,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-15.sat": {
      "page": 1,
      "x": 392.2,
      "y": 660.1,
      "type": "mark",
      "size": 9
    },
    "DR-15.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 660.1,
      "type": "mark",
      "size": 9
    },
    "DR-15.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 660.1,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-16.sat": {
      "page": 1,
      "x": 392.2,
      "y": 640.1,
      "type": "mark",
      "size": 9
    },
    "DR-16.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 640.1,
      "type": "mark",
      "size": 9
    },
    "DR-16.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 640.1,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-17.sat": {
      "page": 1,
      "x": 392.2,
      "y": 575.5,
      "type": "mark",
      "size": 9
    },
    "DR-17.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 575.5,
      "type": "mark",
      "size": 9
    },
    "DR-17.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 575.5,
      "width": 90,
      "height": 26,
      "size": 7,
      "wrap": true,
      "maxLines": 2,
      "overflow": "continuation"
    },
    "DR-18.sat": {
      "page": 1,
      "x": 392.2,
      "y": 546.7,
      "type": "mark",
      "size": 9
    },
    "DR-18.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 546.7,
      "type": "mark",
      "size": 9
    },
    "DR-18.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 546.7,
      "width": 90,
      "height": 26,
      "size": 7,
      "wrap": true,
      "maxLines": 2,
      "overflow": "continuation"
    },
    "DR-19.sat": {
      "page": 1,
      "x": 392.2,
      "y": 517.9,
      "type": "mark",
      "size": 9
    },
    "DR-19.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 517.9,
      "type": "mark",
      "size": 9
    },
    "DR-19.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 517.9,
      "width": 90,
      "height": 26,
      "size": 7,
      "wrap": true,
      "maxLines": 2,
      "overflow": "continuation"
    },
    "DR-20.sat": {
      "page": 1,
      "x": 392.2,
      "y": 489.1,
      "type": "mark",
      "size": 9
    },
    "DR-20.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 489.1,
      "type": "mark",
      "size": 9
    },
    "DR-20.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 489.1,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-21.sat": {
      "page": 1,
      "x": 392.2,
      "y": 469,
      "type": "mark",
      "size": 9
    },
    "DR-21.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 469,
      "type": "mark",
      "size": 9
    },
    "DR-21.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 469,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-22.sat": {
      "page": 1,
      "x": 392.2,
      "y": 395.8,
      "type": "mark",
      "size": 9
    },
    "DR-22.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 395.8,
      "type": "mark",
      "size": 9
    },
    "DR-22.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 395.8,
      "width": 90,
      "height": 26,
      "size": 7,
      "wrap": true,
      "maxLines": 2,
      "overflow": "continuation"
    },
    "DR-23.sat": {
      "page": 1,
      "x": 392.2,
      "y": 367,
      "type": "mark",
      "size": 9
    },
    "DR-23.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 367,
      "type": "mark",
      "size": 9
    },
    "DR-23.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 367,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-24.sat": {
      "page": 1,
      "x": 392.2,
      "y": 347,
      "type": "mark",
      "size": 9
    },
    "DR-24.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 347,
      "type": "mark",
      "size": 9
    },
    "DR-24.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 347,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-25.sat": {
      "page": 1,
      "x": 392.2,
      "y": 326.9,
      "type": "mark",
      "size": 9
    },
    "DR-25.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 326.9,
      "type": "mark",
      "size": 9
    },
    "DR-25.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 326.9,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-26.sat": {
      "page": 1,
      "x": 392.2,
      "y": 306.8,
      "type": "mark",
      "size": 9
    },
    "DR-26.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 306.8,
      "type": "mark",
      "size": 9
    },
    "DR-26.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 306.8,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "DR-27.sat": {
      "page": 1,
      "x": 392.2,
      "y": 286.7,
      "type": "mark",
      "size": 9
    },
    "DR-27.no_sat": {
      "page": 1,
      "x": 428.2,
      "y": 286.7,
      "type": "mark",
      "size": 9
    },
    "DR-27.remarks": {
      "page": 1,
      "x": 456.1,
      "y": 286.7,
      "width": 90,
      "height": 18,
      "size": 7,
      "wrap": true,
      "maxLines": 1,
      "overflow": "continuation"
    },
    "deficiencies_summary": {
      "page": 1,
      "x": 76,
      "y": 228,
      "width": 460,
      "height": 148,
      "size": 9,
      "wrap": true,
      "maxLines": 10,
      "overflow": "continuation"
    },
    "inspector_signature": {
      "page": 2,
      "x": 72,
      "y": 572,
      "type": "image",
      "width": 150,
      "height": 36
    },
    "inspector_name": {
      "page": 2,
      "x": 72,
      "y": 572,
      "size": 9,
      "width": 150
    },
    "inspector_date": {
      "page": 2,
      "x": 110,
      "y": 547.5,
      "size": 9,
      "width": 80
    },
    "om_signature": {
      "page": 2,
      "x": 306.1,
      "y": 572,
      "type": "image",
      "width": 150,
      "height": 36
    },
    "om_name": {
      "page": 2,
      "x": 306.1,
      "y": 572,
      "size": 9,
      "width": 180
    },
    "om_date": {
      "page": 2,
      "x": 344,
      "y": 547.5,
      "size": 9,
      "width": 80
    }
  }
}$map$::jsonb,
  'annex-d-drainage-ed01.pdf',
  '2026-03-12',
  'active'
)
on conflict (code, version) do update set
  title = excluded.title,
  content_schema = excluded.content_schema,
  field_map = excluded.field_map,
  base_pdf_path = excluded.base_pdf_path,
  status = 'active';

insert into public.checklist_assignment_rules (template_id, department, role, frequency, inspection_type)
select id, 'Maintenance', 'inspector', 'monthly', 'monthly_routine'
from public.checklist_templates
where code = 'PGIA-PMM-F04' and version = 'ed01'
and not exists (
  select 1 from public.checklist_assignment_rules r
  where r.template_id = checklist_templates.id and r.role = 'inspector'
);
