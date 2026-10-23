// Tools CallsTalk connects to, grouped as on the Avortyx integrations board.
// `logo` is a file in public/logos (Simple Icons); tools without one show a monogram tile.
export const INTEGRATION_GROUPS = [
  { title: 'Ad Platforms', items: [
    { name: 'Google Ads', logo: 'googleads', color: '#4285F4' },
    { name: 'Meta', logo: 'meta', color: '#0467DF' },
  ] },
  { title: 'CRM', items: [
    { name: 'HubSpot', logo: 'hubspot', color: '#FF7A59' },
    { name: 'Salesforce', mark: 'SF', color: '#00A1E0' },
    { name: 'Zoho CRM', mark: 'Zo', color: '#E42527' },
    { name: 'GoHighLevel', mark: 'HL', color: '#10B981' },
  ] },
  { title: 'Analytics', items: [
    { name: 'Google Analytics', logo: 'googleanalytics', color: '#F9AB00' },
    { name: 'Mixpanel', logo: 'mixpanel', color: '#7856FF' },
    { name: 'Segment', mark: 'Sg', color: '#52BD95' },
    { name: 'Datadog', logo: 'datadog', color: '#632CA6' },
  ] },
  { title: 'Data Warehouses', items: [
    { name: 'Snowflake', logo: 'snowflake', color: '#29B5E8' },
    { name: 'BigQuery', logo: 'googlebigquery', color: '#669DF6' },
    { name: 'PostgreSQL', logo: 'postgresql', color: '#4169E1' },
  ] },
  { title: 'Team Messaging', items: [
    { name: 'Slack', mark: 'Sl', color: '#E01E5A' },
    { name: 'Microsoft Teams', mark: 'MT', color: '#6264A7' },
    { name: 'Discord', logo: 'discord', color: '#5865F2' },
    { name: 'Telegram', logo: 'telegram', color: '#26A5E4' },
  ] },
  { title: 'Automation & Billing', items: [
    { name: 'Zapier', mark: 'Za', color: '#FF4F00' },
    { name: 'Make', logo: 'make', color: '#6D00CC' },
    { name: 'Stripe', logo: 'stripe', color: '#635BFF' },
  ] },
  { title: 'Telephony', items: [
    { name: 'Bandwidth', mark: 'Bw', color: '#0072CE' },
    { name: 'Plivo', mark: 'Pl', color: '#5856D6' },
  ] },
];

export const ALL_INTEGRATIONS = INTEGRATION_GROUPS.flatMap((g) => g.items);

// The row under the hero: the names visitors recognise first.
export const FEATURED = ['Google Ads', 'Meta', 'HubSpot', 'Salesforce', 'Google Analytics', 'Slack', 'Zapier', 'Stripe']
  .map((n) => ALL_INTEGRATIONS.find((i) => i.name === n));
