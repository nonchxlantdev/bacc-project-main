# Production stress report

Ran against https://bacc.visionforgestudio.app on 2026-10-24T15:54:15.238Z.
Build seen in Help: cc7ac8f.
Elapsed: 578s.
Forms: 36/36 passed.
Filed records had a row before the attendance sign-off: yes.

## Forms

| Form | Result | Seconds | Notes |
| --- | --- | --- | --- |
| EGSO-PR-001 Aerodrome Hazard Reporting Form | pass | 9.8 | 0 items, 0 tables, 1 signatures. |
| PGIA-PMM-F01 Daily Routine Inspection Checklist | pass | 44.1 | 69 items, 0 tables, 3 signatures. |
| PGIA-PMM-F02 Operational Control Inspection Checklist | pass | 45.0 | 67 items, 0 tables, 2 signatures. |
| PGIA-PMM-F03 Technical Oversight Inspection Field Record | pass | 54.4 | 84 items, 0 tables, 3 signatures. |
| PGIA-PMM-F04 Drainage System Inspection Checklist | pass | 21.2 | 26 items, 0 tables, 2 signatures. |
| PGIA-PMM-F05 Aerodrome Sign Inspection Checklist | pass | 19.8 | 22 items, 0 tables, 2 signatures. |
| PGIA-PMM-F06 Unpaved Area Routine Inspection Checklist | pass | 24.3 | 34 items, 0 tables, 2 signatures. |
| PGIA-PMM-F09 Grass-Cutting Activity Log | pass | 7.5 | 0 items, 0 tables, 2 signatures. |
| PGIA-PMM-F10 Construction Area Daily Safety Inspection Checklist | pass | 20.6 | 24 items, 0 tables, 2 signatures. |
| PGIA-PMM-F11 Construction Safety Plan — Minimum Format Template | pass | 9.6 | 0 items, 0 tables, 3 signatures. |
| PGIA 16-14 Reference Documents | pass | 2.1 | Reference sheet — opened, nothing to fill. |
| PGIA-CL-VAES-01 Monthly Safety Board and Equipment Inspection | pass | 13.1 | 18 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-02 Daily Airfield Lighting Visual Inspection — Airfield Inspection | pass | 14.8 | 19 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-03 Monthly Runway and Taxiway Light Fixture PMI | pass | 13.2 | 17 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-04 Semi-Annual Runway/Taxiway Photometric Measurement | pass | 10.7 | 11 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-05 Monthly PAPI Inspection | pass | 9.6 | 8 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-06 Annual PAPI Alignment Verification | pass | 11.2 | 11 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-07 Monthly Illuminated Guidance Signs Inspection | pass | 10.4 | 9 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-08 Monthly Wind Cone Assembly Inspection | pass | 10.3 | 9 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-09 Monthly Obstruction Light Inspection | pass | 9.8 | 7 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-10 Annual Obstruction Light Engineering Inspection | pass | 8.6 | 5 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-11 Daily Airport Lighting Vault Inspection | pass | 11.9 | 14 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-12 Weekly Airport Lighting Vault Inspection | pass | 10.7 | 10 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-13 Monthly Vault — Insulation Resistance Test | pass | 12.4 | 14 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-14 Semi-Annual Airport Lighting Vault Inspection | pass | 11.7 | 14 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-15 Annual Vault Engineering Inspection | pass | 10.6 | 10 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-16 Daily CCR Inspection Log | pass | 10.3 | 8 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-17 Monthly CCR Inspection | pass | 10.0 | 8 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-18 Weekly Standby Generator Operational Check | pass | 14.6 | 20 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-19 Monthly Blackout Transfer Test Record | pass | 12.2 | 15 items, 0 tables, 2 signatures. |
| PGIA-CL-VAES-20 Construction Area — Signage, Lighting, and NAVAID Inspection | pass | 14.5 | 16 items, 0 tables, 2 signatures. |
| PGIA-AOM-A5-04 Attendance List for Wildlife Attractant Inspection | pass | 13.3 | 0 items, 1 tables, 15 signatures. |
| PGIA-AOM-A5-01 Bird Sightings Log Sheet | pass | 11.4 | 0 items, 1 tables, 0 signatures. |
| PGIA-AOM-A5-08 Monthly Wildlife Incursion Log for the Movement Area | pass | 8.2 | 0 items, 1 tables, 0 signatures. |
| PGIA-AOM-A5-06 Wildlife Findings Report | pass | 5.5 | 0 items, 0 tables, 2 signatures. |
| PGIA-AOM-A5-07 Wildlife Incursion Report for the Movement Area | pass | 4.8 | 0 items, 0 tables, 0 signatures. |

## Attendance sign-off

The filled Attendance List was submitted, approved and signed by the OM account, and then downloaded from the inspector's Completed tab. The first look ran before that list had finished loading and reported the row missing. A recheck once the list had loaded found it.

Signed PDF: 15 signature images (the bar is 13), 5 pages, worst-case text present (101 hits). Saved as `qa-artifacts/prod-stress/attendance-signed.pdf`.

## Other checks

- Sidebar: 9 screens, three passes, including back, forward, and a mid-navigation refresh. No error boundary.
- Rapid save: 10 saves finished in 7720ms with no 409 or 5xx.
- Offline: the connection was dropped for half a second. The offline notice waits 3 seconds, so no banner appeared. Not counted as a failure.
- My Checklists tabs and Filed records loaded. The records banner did not stick. Drafts were deleted at the end. Filed records already had a row before this sign-off.
- No `/api/client-error` calls. Worker tail had no `level:"error"` lines.

## HTTP and console

Login returns 401 for `/api/auth/me` and `/api/data/settings.get` until a session exists. That is the session probe, not a broken page.

Build cc7ac8f asks for `/api/data/settings.audit` on every visit to Settings. An inspector is not allowed to read that log, so production answered 403 five times during navigation. The page hides the error. The working tree now requests that log only for an OM or an administrator. That change is not in build cc7ac8f.

Cloudflare's analytics beacon is blocked by the portal's Content Security Policy (`script-src 'self'`). The browser logs that block. It is the policy working.

Preview page images, where Poppler could rasterise them, are under `qa-artifacts/prod-stress/`.
