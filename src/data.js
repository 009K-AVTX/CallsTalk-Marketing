// Page content. Placeholder values (prices, testimonials, phone) must be replaced before launch.

export const navLinks = [
  { href: '/#features', label: 'Platform' },
  { href: '/#solutions', label: 'Use Cases' },
  { href: '/#integrations', label: 'Connected Apps' },
  { href: '/#resources', label: 'Insights' },
];

export const updates = [
  { title: 'Lead scores now come with every plan', tag: 'Product update' },
  { title: 'Closed deals now sync back to your ad accounts', tag: 'New feature' },
  { title: 'Building a client report that answers the Monday question', tag: 'Guide' },
];

export const features = [
  {
    eyebrow: 'Lead Capture',
    title: 'Every ring has a source.',
    body: 'Calls, forms and chats land with the ad, keyword and page that sent them.',
    cta: 'Explore lead capture',
    links: [
      { name: 'Call Attribution', text: 'Unique numbers reveal the ad behind each call.' },
      { name: 'Form Monitoring', text: 'Each submission brings its visit history.' },
      { name: 'Chat Attribution', text: 'Chats stay tied to the visit that began them.' },
      { name: 'Purchase Tracking', text: 'Phone and online orders, back to first touch.' },
    ],
  },
  {
    eyebrow: 'Lead Qualification',
    title: 'Hot leads reach sales first.',
    body: 'CallsTalk scores each lead on intent and hands the best ones to the right person in seconds.',
    cta: 'Explore lead qualification',
    links: [
      { name: 'Lead Prioritization', text: 'The most serious callers float to the top.' },
      { name: 'Labels & Comments', text: 'Notes and outcomes travel with the lead.' },
      { name: 'Real-Time Notifications', text: 'A ping the moment a good lead lands.' },
      { name: 'Conversation Recording', text: 'Replay what was said and promised.' },
    ],
  },
  {
    eyebrow: 'Reporting & Intelligence',
    title: 'Show what every dollar earned.',
    body: 'Closed revenue flows back to the campaign that earned it, ready for any report.',
    cta: 'Explore reporting',
    links: [
      { name: 'Custom Dashboards', text: 'A view for every team and client.' },
      { name: 'Conversion Sync', text: 'Closed deals teach your ad platforms.' },
      { name: 'Cross-Channel Attribution', text: 'Every touch earns its share.' },
      { name: 'Automated Reporting', text: 'Reports land in inboxes on schedule.' },
    ],
  },
];

export const solutions = {
  role: [
    { title: 'Agencies', text: 'Hand clients reports under your own brand.' },
    { title: 'Marketing Teams', text: 'Move budget to the ads that ring.' },
    { title: 'Owners & Operators', text: 'Finally see how customers find you.' },
    { title: 'Sales Leaders', text: 'Call back the serious buyers first.' },
  ],
  industry: [
    { title: 'Home & Field Services', text: 'Know which ad booked each job.' },
    { title: 'Law Firms', text: 'Price each signed case by its source.' },
    { title: 'Healthcare Providers', text: 'Trace bookings, keep patient details private.' },
    { title: 'Auto Dealerships', text: 'See which campaign filled the showroom.' },
    { title: 'Property & Real Estate', text: 'Spot the listings that make phones ring.' },
    { title: 'Higher Education', text: 'Follow each enrollment to its first click.' },
    { title: 'Financial Services', text: 'Judge leads by the accounts they open.' },
    { title: 'Online Retail', text: 'Join phone orders to their online journey.' },
  ],
};

export const integrations = [
  'Advertising Networks', 'CRM Platforms', 'Web Analytics', 'Contact Centers', 'Email Marketing', 'Live Chat',
  'Online Forms', 'Custom Webhooks', 'Workflow Automation', 'Cloud Data Warehouses', 'Team Messaging', 'Developer API',
];

export const steps = [
  { title: 'Open an account', text: 'Takes under a minute.', link: 'Get started', href: '/#access' },
  { title: 'Paste the snippet', text: 'Or drop it in your tag manager.', link: 'View setup guide', href: '/#how' },
  { title: 'Plug in your platforms', text: 'Ad accounts, CRM, messaging.', link: 'See connections', href: '/#integrations' },
  { title: 'Get a setup check', text: 'A specialist confirms it all lines up.', link: 'Speak with us', href: '/#access' },
];

// Rates mirror the Avortyx platform's published usage pricing: committing more each month lowers every rate.
export const RATE_COLUMNS = ['Pay as you go', '$50', '$250', '$1,000', '$4,000', '$8,000'];
export const RATES = [
  { name: 'Tracking number', unit: 'per number / month', values: ['$4.00', '$3.00', '$2.00', '$1.50', '$1.00', '$1.00'] },
  { name: 'Spam tag protection', unit: 'per number / month', values: ['$5.00', '$4.00', '$3.00', '$2.50', '$2.00', '$2.00'] },
  { name: 'Local call tracking', unit: 'per minute', values: ['$0.0550', '$0.0500', '$0.0400', '$0.0350', '$0.0300', '$0.0250'] },
  { name: 'Toll-free call tracking', unit: 'per minute', values: ['$0.0600', '$0.0550', '$0.0450', '$0.0400', '$0.0350', '$0.0300'] },
  { name: 'Outbound to consumer', unit: 'per minute', values: ['$0.0450', '$0.0400', '$0.0300', '$0.0250', '$0.0200', '$0.0150'] },
  { name: 'SMS out', unit: 'per message', values: ['$0.0400', '$0.0350', '$0.0300', '$0.0250', '$0.0200', '$0.0150'] },
  { name: 'AI transcription', unit: 'per minute', values: ['$0.0350', '$0.0325', '$0.0300', '$0.0275', '$0.0250', '$0.0200'] },
  { name: 'Recording retention', unit: 'per minute / month', values: ['$0.00040', '$0.00040', '$0.00040', '$0.00040', '$0.00025', '$0.00015'] },
];

// The plan cards show four of the commit levels and the headline rates from the table above.
const col = (i) => ({ number: RATES[0].values[i], local: RATES[2].values[i], tollFree: RATES[3].values[i], transcription: RATES[6].values[i] });
export const PLANS = [
  { name: 'Pay as you go', price: '$0', unit: 'monthly commit', note: 'Start tracking with no commitment.', ...col(0) },
  { name: 'Starter', price: '$250', unit: 'monthly commit', note: 'For a growing team on a few channels.', ...col(2) },
  { name: 'Growth', price: '$1,000', unit: 'monthly commit', note: 'Lower rates for busy call lines.', popular: true, ...col(3) },
  { name: 'Enterprise', price: 'Custom', unit: 'tailored rates', note: 'Dedicated number pools, 99.99% uptime SLA and a dedicated account manager.', sales: true },
];

export const reviews = ['A', 'B', 'C', 'D', 'E', 'F'].map((initial) => ({
  initial,
  quote: 'Placeholder: insert a genuine customer testimonial here.',
  name: 'Full Name',
  role: 'Job Title, Organization',
}));

export const footerColumns = [
  { title: 'Platform', links: [['Call Attribution', '/#features'], ['Lead Scoring', '/#features'], ['Reporting', '/#features'], ['Plans & Pricing', '/#pricing']] },
  { title: 'Use Cases', links: [['Agencies', '/#solutions'], ['Marketing Teams', '/#solutions'], ['Owners & Operators', '/#solutions'], ['Sales Leaders', '/#solutions']] },
  { title: 'Resources', links: [['Getting Started', '/#how'], ['Integrations', '/#integrations'], ['Latest Updates', '/#resources']] },
  { title: 'Legal', links: [['Legal Center', '/legal'], ['Terms of Service', '/terms'], ['Privacy Policy', '/privacy'], ['Cookie Policy', '/cookies']] },
];
