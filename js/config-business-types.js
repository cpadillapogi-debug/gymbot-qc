/* ============================================================
   GYMBOT QC — BUSINESS TYPE TEMPLATES (Phase 14, Global OS Sec. 4)
   Pure configuration data — no logic, no DOM, no storage reads.
   This is the "business type engine" starting point: a fixed set
   of templates a gym can be assigned (see gym-config-service.js),
   each describing which vocabulary/modules/membership-type
   defaults make sense for that kind of business.

   WHAT THIS DOES: gives every gym a `businessTypeId` and lets the
   UI show the right terminology (e.g. "Belt Level" for martial
   arts, "Weight Class" for boxing) and a sensible default set of
   membership types to pre-fill when a gym owner sets up billing.

   WHAT THIS DELIBERATELY DOES NOT DO YET: no page in this app
   actually branches its UI/copy based on businessTypeId — that's
   real UI work still to do (owner-dashboard-page-ui.js, the AI
   prompt builder, etc. would all need to read this and adapt).
   Wiring templates in without a single screen reading them would
   just be inert data, so treat this file as the foundation the
   next phase builds on, not a finished feature.
   ============================================================ */

export const BUSINESS_TYPES = Object.freeze([
  {
    id: "traditional_gym",
    label: "Traditional Gym",
    memberTermSingular: "member",
    staffTermSingular: "trainer",
    defaultMembershipTypes: ["Monthly", "Annual", "Day Pass", "Student"],
    defaultCustomFields: []
  },
  {
    id: "fitness_center",
    label: "Fitness Center",
    memberTermSingular: "member",
    staffTermSingular: "trainer",
    defaultMembershipTypes: ["Monthly", "Annual", "Class Pack", "Drop-in"],
    defaultCustomFields: []
  },
  {
    id: "boxing_gym",
    label: "Boxing Gym",
    memberTermSingular: "member",
    staffTermSingular: "coach",
    defaultMembershipTypes: ["Monthly", "Class Pack", "Drop-in"],
    defaultCustomFields: [
      { key: "weightClass", label: "Weight Class", type: "text", appliesTo: "member" }
    ]
  },
  {
    id: "martial_arts",
    label: "Martial Arts Academy",
    memberTermSingular: "student",
    staffTermSingular: "instructor",
    defaultMembershipTypes: ["Monthly", "Annual", "Family Membership"],
    defaultCustomFields: [
      { key: "beltLevel", label: "Belt Level", type: "text", appliesTo: "member" }
    ]
  },
  {
    id: "yoga_studio",
    label: "Yoga Studio",
    memberTermSingular: "student",
    staffTermSingular: "instructor",
    defaultMembershipTypes: ["Class Pack", "Monthly", "Drop-in"],
    defaultCustomFields: [
      { key: "experienceLevel", label: "Experience Level", type: "text", appliesTo: "member" }
    ]
  },
  {
    id: "pilates_studio",
    label: "Pilates Studio",
    memberTermSingular: "client",
    staffTermSingular: "instructor",
    defaultMembershipTypes: ["Class Pack", "Personal Training Package"],
    defaultCustomFields: []
  },
  {
    id: "dance_studio",
    label: "Dance Studio",
    memberTermSingular: "student",
    staffTermSingular: "instructor",
    defaultMembershipTypes: ["Class Pack", "Monthly", "Drop-in"],
    defaultCustomFields: []
  },
  {
    id: "personal_training",
    label: "Personal Training Studio",
    memberTermSingular: "client",
    staffTermSingular: "trainer",
    defaultMembershipTypes: ["Personal Training Package"],
    defaultCustomFields: []
  },
  {
    id: "sports_club",
    label: "Sports Club",
    memberTermSingular: "member",
    staffTermSingular: "coach",
    defaultMembershipTypes: ["Monthly", "Annual", "Corporate Membership"],
    defaultCustomFields: []
  },
  {
    id: "wellness_center",
    label: "Wellness Center",
    memberTermSingular: "client",
    staffTermSingular: "practitioner",
    defaultMembershipTypes: ["Monthly", "Class Pack", "Drop-in"],
    defaultCustomFields: []
  }
]);

export const DEFAULT_BUSINESS_TYPE_ID = "traditional_gym";

export function getBusinessType(id){
  return BUSINESS_TYPES.find(t => t.id === id) || BUSINESS_TYPES.find(t => t.id === DEFAULT_BUSINESS_TYPE_ID);
}
