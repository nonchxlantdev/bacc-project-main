import { EMAIL_INTEGRATION_READY } from '../config/settingsDefaults.js';
import { WORK_ORDERS_ENABLED } from '../lib/incidentLifecycle.js';

/**
 * Portal guidance for field and management staff.
 *
 * Wording lives here so BACC can revise answers without touching UI code.
 * Write for an inspector on the apron: no file names, no code, no requirement
 * section numbers. Where behaviour depends on a feature flag, read the switch
 * rather than stating a fixed state.
 */
export const FAQ_GROUPS = [
  {
    id: 'getting-started',
    title: 'Getting started',
    questions: [
      {
        q: 'What is this portal for?',
        a: 'The portal replaces paper inspection forms. You complete the same approved form on screen, sign it, and file it when you submit. Items marked NO SAT can be tracked through correction and re-inspection. The exported PDF is the approved form with your entries, signatures, and dates applied.',
      },
      {
        q: 'Which checklists can I see?',
        a: 'Every approved form is available to all staff. You may open any checklist to cover for a colleague or review another team’s submissions. Each form shows its owning post and scheduled frequency. That indicates who normally completes it, not who may open it.',
      },
      {
        q: 'What do SAT, NO SAT and N/A mean?',
        a: 'SAT means the item was inspected and is satisfactory. NO SAT means the item was inspected and a deficiency was found. N/A means the item does not apply to the inspection being carried out. Every item must have one of these results before you submit.',
      },
      {
        q: 'What do the colours mean?',
        a: 'Green indicates completion or a satisfactory result. Amber indicates due soon or awaiting action. Red indicates overdue work or a NO SAT item that remains open. Grey indicates no activity yet.',
      },
    ],
  },
  {
    id: 'checklists',
    title: 'Filling in a checklist',
    questions: [
      {
        q: 'How do I start an inspection?',
        a: 'Open My Checklists, select New Inspection, and choose the form you need. Any inspection you start but have not submitted remains on that page as a draft.',
      },
      {
        q: 'Do I have to finish it in one sitting?',
        a: 'No. Your entries save automatically and remain as a draft until you submit. You may close the page and return later.',
      },
      {
        q: 'Does it work without a signal on the airfield?',
        a: 'Yes. Entries are stored on the device and sent when connectivity returns. Keep the browser session open until sync completes.',
      },
      {
        q: 'Can I change an answer after I have submitted?',
        a: 'No. A submitted checklist is the permanent record of what you observed on that date. If a correction is required, contact the Operations Manager. Corrections are recorded as separate events; submitted records are not rewritten.',
      },
      {
        q: 'I submitted the wrong form by mistake. What now?',
        a: 'Notify the Operations Manager. The submitted record remains on file. A new inspection is completed and filed alongside it. Records are not deleted.',
      },
      {
        q: 'How do I add a photo?',
        a: 'Use the attach control on the relevant item. Photos are stored with the inspection and appear on the exported PDF as additional pages after the form.',
      },
      {
        q: 'Where do I attach a drawing?',
        a: 'Drawing attachment is available only on sections that require it. Those sections show “Attach drawing” on the approved form.',
      },
      {
        q: 'Who has to sign?',
        a: 'Whoever the approved form specifies. Most forms require the inspector’s signature; some also require manager acknowledgment. The form shows which signatures are still required.',
      },
      {
        q: 'Does a signature drawn on a phone count?',
        a: 'The portal records your drawn signature together with your name, position, and the time signed, and places that information on the exported form. Whether that meets your auditor’s requirements is subject to BACC confirmation.',
      },
    ],
  },
  {
    id: 'no-sat',
    title: 'When something is NO SAT',
    questions: [
      {
        q: 'What happens when I mark an item NO SAT?',
        a: 'The form requires a description of the deficiency and its location. When you submit, you may raise an incident so corrective action can be assigned and tracked.',
      },
      {
        q: 'Do I have to raise an incident for every NO SAT?',
        a: 'Not when you correct the item on the spot; record the action in the remarks. Raise an incident when the work requires another unit, parts, or more time than you have available.',
      },
      {
        q: 'Does raising an incident change my checklist?',
        a: 'No. Your checklist remains as submitted, with the item still marked NO SAT. The item shows that corrective action is in progress so later readers can see the deficiency was not ignored.',
      },
    ],
  },
  {
    id: 'incidents',
    title: 'Incidents',
    questions: [
      {
        q: 'What is a deficiency level?',
        a: 'Deficiency level indicates severity on a scale of 1 to 4. BACC has not yet confirmed the definition of each level or the required response time. Levels and response times are configured on the Settings page and can be updated when BACC confirms them.',
      },
      {
        q: 'How do I assign an incident?',
        a: 'Open the incident, select the responsible unit under Assigned Unit (Grounds, Electrical, or Plumbing), and set a target date. The incident cannot advance past Reported until both are complete. You assign a unit, not an individual.',
      },
      {
        q: 'Why can I not assign it to a named person?',
        a: 'Grounds, Electrical, and Plumbing do not have portal accounts. The manager who owns the incident records progress, verification, and closure on their behalf while the unit performs the work in the field.',
      },
      {
        q: 'Who gets told about it?',
        a: EMAIL_INTEGRATION_READY
          ? 'The owning manager and anyone configured in Settings for that alert type receive notification in the portal and by email. The assigned unit is notified through your usual operational channels.'
          : 'The owning manager and anyone configured in Settings for that alert type receive notification in the portal. The assigned unit is notified through your usual operational channels. Email alerts are configured but not yet connected; BACC IT must provide a sending address.',
      },
      {
        q: 'What does verification mean?',
        a: 'Verification confirms on site that corrective work is complete and acceptable. Reporting work as finished is not the same as verification, and an incident cannot be closed on the word of the unit alone.',
      },
      {
        q: 'When does the original NO SAT become SAT?',
        a: 'When you confirm the item as SAT on the incident. The original checklist item then changes from NO SAT to SAT, with a record of when it changed and which incident caused the change. If verification is withdrawn, the item returns to NO SAT.',
      },
      {
        q: 'It is still not fixed. What do I do?',
        a: 'Mark the item NO SAT on the incident rather than SAT. Keep the incident open and retain its history. Do not close it and raise a new one.',
      },
      ...(WORK_ORDERS_ENABLED
        ? [
            {
              q: 'What is a work order?',
              a: 'A work order is the formal instruction to carry out corrective work, raised from the incident. It records what was done, area clearance, and any NOTAM reference required.',
            },
          ]
        : []),
    ],
  },
  {
    id: 'approvals',
    title: 'Approvals',
    questions: [
      {
        q: 'What am I approving?',
        a: 'You are confirming that you have reviewed a submitted inspection and accept it as filed. You are not repeating the inspection; you are providing the acknowledgment the approved form requires.',
      },
      {
        q: 'Why is my approvals list grouped by team?',
        a: 'Each approved form belongs to a team such as Apron Supervisor or Crash Fire and Rescue. Grouping the queue the same way lets you work through one team at a time.',
      },
      {
        q: 'Can I reject something?',
        a: 'Not at present. How rejection should work in your process, whether by return for correction or by requiring a new inspection, is pending BACC confirmation. The feature will be implemented once that is agreed.',
      },
    ],
  },
  {
    id: 'reports',
    title: 'Reports and PDFs',
    questions: [
      {
        q: 'How do I get a PDF of a checklist?',
        a: 'Open the checklist, select Show preview, then export. The output is the approved form with your answers, signatures, and dates placed on it, not a redesigned copy.',
      },
      {
        q: 'Why is my drawing on a separate page instead of on the form?',
        a: 'The approved form does not include space for drawings, and its layout may not be altered. Each drawing is added as a separate page after the form, labelled with the relevant section.',
      },
      {
        q: 'Can I choose what goes in a report?',
        a: 'Yes. On the Reports page you can select which sections to include, so you can produce a summary for one audience and a full report for another.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Your account and settings',
    questions: [
      {
        q: 'Why can I not change some settings?',
        a: 'Most settings affect the whole airport and are managed by the Operations Manager. Your own profile remains editable at all times.',
      },
      {
        q: 'Who can change the deficiency levels?',
        a: 'The Operations Manager, on the Settings page. Changes apply to every incident in the portal and are recorded with the author and timestamp.',
      },
      {
        q: 'Some posts show as having no account. Why?',
        a: 'Some approved forms name posts, such as Crash Fire and Rescue or Civil Engineering Consultant, for which BACC has not yet provided staff accounts. Those forms can still be opened and completed. The Users page lists posts that still require an assigned person.',
      },
    ],
  },
];
