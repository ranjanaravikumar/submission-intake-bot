// Field catalog: the ACORD 125-aligned fields this bot extracts.
// `formLabel` is the printed label on the form (used by the offline layout extractor).
const US_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');

const SECTIONS = [
  { id: 'applicant', title: 'Applicant' },
  { id: 'business', title: 'Nature of business' },
  { id: 'policy', title: 'Coverage requested' },
  { id: 'contacts', title: 'Agency and contacts' },
  { id: 'prior', title: 'Prior carrier and losses' },
];

const FIELDS = [
  { key: 'applicant_name', label: 'Named insured', section: 'applicant', formLabel: 'NAME (FIRST NAMED INSURED)', required: true, type: 'text', acord: 'Applicant.NamedInsured' },
  { key: 'dba', label: 'DBA', section: 'applicant', formLabel: 'DBA', type: 'text', acord: 'Applicant.DBA' },
  { key: 'mailing_street', label: 'Mailing address', section: 'applicant', formLabel: 'MAILING ADDRESS', required: true, type: 'text', acord: 'Applicant.MailingAddress.Street' },
  { key: 'mailing_city', label: 'City', section: 'applicant', formLabel: 'CITY', required: true, type: 'text', acord: 'Applicant.MailingAddress.City' },
  { key: 'mailing_state', label: 'State', section: 'applicant', formLabel: 'STATE', required: true, type: 'state', acord: 'Applicant.MailingAddress.State' },
  { key: 'mailing_zip', label: 'ZIP', section: 'applicant', formLabel: 'ZIP', required: true, type: 'zip', acord: 'Applicant.MailingAddress.PostalCode' },
  { key: 'fein', label: 'FEIN', section: 'applicant', formLabel: 'FEIN', required: true, type: 'fein', acord: 'Applicant.FEIN' },
  { key: 'legal_entity', label: 'Legal entity', section: 'applicant', formLabel: 'LEGAL ENTITY', required: true, type: 'choice',
    options: ['Corporation', 'LLC', 'Partnership', 'Individual'], acord: 'Applicant.LegalEntity' },
  { key: 'business_phone', label: 'Business phone', section: 'applicant', formLabel: 'BUSINESS PHONE', type: 'phone', acord: 'Applicant.Phone' },
  { key: 'website', label: 'Website', section: 'applicant', formLabel: 'WEBSITE', type: 'text', acord: 'Applicant.Website' },

  { key: 'description_of_operations', label: 'Description of operations', section: 'business', formLabel: 'DESCRIPTION OF OPERATIONS', required: true, type: 'longtext', acord: 'BusinessInfo.DescriptionOfOperations' },
  { key: 'years_in_business', label: 'Years in business', section: 'business', formLabel: 'YEARS IN BUSINESS', required: true, type: 'int', acord: 'BusinessInfo.YearsInBusiness' },
  { key: 'naics_code', label: 'NAICS code', section: 'business', formLabel: 'NAICS CODE', type: 'naics', acord: 'BusinessInfo.NAICSCode' },
  { key: 'annual_revenue', label: 'Annual revenues', section: 'business', formLabel: 'ANNUAL REVENUES', required: true, type: 'money', acord: 'BusinessInfo.AnnualRevenue' },
  { key: 'full_time_employees', label: 'Full-time employees', section: 'business', formLabel: 'FULL-TIME EMPLOYEES', required: true, type: 'int', acord: 'BusinessInfo.FullTimeEmployees' },
  { key: 'part_time_employees', label: 'Part-time employees', section: 'business', formLabel: 'PART-TIME EMPLOYEES', type: 'int', acord: 'BusinessInfo.PartTimeEmployees' },

  { key: 'effective_date', label: 'Proposed effective date', section: 'policy', formLabel: 'PROPOSED EFF DATE', required: true, type: 'date', future: true, acord: 'PolicyInfo.EffectiveDate' },
  { key: 'expiration_date', label: 'Proposed expiration date', section: 'policy', formLabel: 'PROPOSED EXP DATE', type: 'date', acord: 'PolicyInfo.ExpirationDate' },
  { key: 'lines_of_business', label: 'Lines of business', section: 'policy', formLabel: 'LINES OF BUSINESS', required: true, type: 'multi',
    options: ['General liability', 'Property', 'Business auto', 'Workers comp', 'Umbrella'], acord: 'PolicyInfo.LinesOfBusiness' },

  { key: 'agency_name', label: 'Agency', section: 'contacts', formLabel: 'AGENCY NAME', required: true, type: 'text', acord: 'Agency.Name' },
  { key: 'producer', label: 'Producer', section: 'contacts', formLabel: 'PRODUCER', type: 'text', acord: 'Agency.Producer' },
  { key: 'agency_phone', label: 'Agency phone', section: 'contacts', formLabel: 'AGENCY PHONE', type: 'phone', acord: 'Agency.Phone' },
  { key: 'agency_email', label: 'Agency email', section: 'contacts', formLabel: 'AGENCY EMAIL', type: 'email', acord: 'Agency.Email' },
  { key: 'contact_name', label: 'Applicant contact', section: 'contacts', formLabel: 'CONTACT NAME', required: true, type: 'text', acord: 'Applicant.Contact.Name' },
  { key: 'contact_phone', label: 'Contact phone', section: 'contacts', formLabel: 'CONTACT PHONE', type: 'phone', acord: 'Applicant.Contact.Phone' },
  { key: 'contact_email', label: 'Contact email', section: 'contacts', formLabel: 'CONTACT EMAIL', type: 'email', acord: 'Applicant.Contact.Email' },

  { key: 'prior_carrier', label: 'Prior carrier', section: 'prior', formLabel: 'PRIOR CARRIER', type: 'text', acord: 'PriorCoverage.Carrier' },
  { key: 'expiring_premium', label: 'Expiring premium', section: 'prior', formLabel: 'EXPIRING PREMIUM', type: 'money', acord: 'PriorCoverage.ExpiringPremium' },
  { key: 'losses_last_5_years', label: 'Losses in last 5 years', section: 'prior', formLabel: 'ANY LOSSES IN THE LAST 5 YEARS', required: true, type: 'choice',
    options: ['Yes', 'No'], acord: 'LossHistory.AnyLossesLast5Years' },
  { key: 'loss_summary', label: 'Loss summary', section: 'prior', formLabel: 'LOSS SUMMARY', type: 'longtext', acord: 'LossHistory.Summary' },
];

const FIELD_MAP = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

module.exports = { FIELDS, FIELD_MAP, SECTIONS, US_STATES };
