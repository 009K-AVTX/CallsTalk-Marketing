// Page content. Placeholder values (prices, testimonials, phone) must be replaced before launch.

export const navLinks = [
  { href: '#features', label: 'Features' },
  { href: '#solutions', label: 'Solutions' },
  { href: '#integrations', label: 'Integrations' },
  { href: '#resources', label: 'Resources' },
];

export const updates = [
  { title: 'AI lead scoring is now available on every plan', thumb: 't1' },
  { title: 'New report: offline conversions sent back to your ad platforms', thumb: 't2' },
  { title: 'Guide: building a client-ready attribution dashboard', thumb: 't3' },
];

export const features = [
  {
    eyebrow: 'Lead Tracking',
    title: 'Capture every lead.',
    body: 'Dynamic phone numbers, form capture and chat tracking record the full source of every inquiry automatically.',
    art: 'art1',
    links: ['📞 Call Tracking', '📝 Form Tracking', '💬 Chat Tracking', '🛒 Transaction Tracking'],
  },
  {
    eyebrow: 'Lead Management',
    title: 'Qualify faster.',
    body: 'Score, tag and assign value to leads in one inbox, then route them to the right person before they go cold.',
    art: 'art2',
    links: ['⭐ Lead Scoring', '🏷️ Tagging & Notes', '🔔 Alerts', '🎧 Call Recording'],
  },
  {
    eyebrow: 'Analytics & Insights',
    title: 'Prove the ROI.',
    body: 'Tie leads to revenue across every channel and share clear reports that show what each dollar returned.',
    art: 'art3',
    links: ['📊 Dashboards', '🔁 Offline Conversions', '🧭 Multi-touch Attribution', '📤 Scheduled Reports'],
  },
];

export const solutions = {
  role: [
    { icon: '🏢', title: 'Agencies', text: 'Prove results to every client with branded reports.' },
    { icon: '📈', title: 'Marketers', text: 'Know which campaigns deserve more budget.' },
    { icon: '🧑‍💼', title: 'Business Owners', text: 'See where your customers really come from.' },
    { icon: '🛎️', title: 'Sales Teams', text: 'Follow up on the hottest leads first.' },
  ],
  industry: [
    { icon: '🔧', title: 'Home Services', text: 'Track every service call to its source.' },
    { icon: '⚖️', title: 'Legal', text: 'Measure cost per signed case.' },
    { icon: '🩺', title: 'Healthcare', text: 'Attribute appointments, privately and securely.' },
    { icon: '🚗', title: 'Automotive', text: 'Connect showroom visits to campaigns.' },
    { icon: '🏠', title: 'Real Estate', text: 'Know which listings drive inquiries.' },
    { icon: '🎓', title: 'Education', text: 'Trace enrollments to their first touch.' },
    { icon: '🏦', title: 'Finance', text: 'Value leads by the deals they close.' },
    { icon: '🛍️', title: 'E‑commerce', text: 'Pair phone orders with online journeys.' },
  ],
};

export const integrations = [
  'Ad Platforms', 'CRMs', 'Analytics', 'Call Centers', 'Email', 'Chat Widgets',
  'Form Builders', 'Webhooks', 'Zapier‑style Automations', 'Data Warehouses', 'Slack', 'REST API',
];

export const steps = [
  { title: 'Start your trial', text: 'Create an account in under a minute.', link: 'Sign up →' },
  { title: 'Add the script', text: 'Paste one snippet or use a tag manager.', link: 'Install guide →' },
  { title: 'Connect your tools', text: 'Link ad accounts and your CRM.', link: 'Integrations →' },
  { title: 'Get support', text: 'Our team helps you configure it right.', link: 'Contact us →' },
];

export const pricing = {
  business: [
    { name: 'Starter', price: '$29', note: 'For a single location getting started.', items: [['Leads', '100/mo'], ['Users', '2'], [null, 'Form & chat tracking']] },
    { name: 'Growth', price: '$79', note: 'Add call tracking and scoring.', items: [['Leads', '500/mo'], ['Users', '5'], [null, 'Call tracking & recording']] },
    { name: 'Pro', price: '$149', note: 'Full attribution and reporting.', popular: true, items: [['Leads', '2,000/mo'], ['Users', 'Unlimited'], [null, 'Offline conversions']] },
    { name: 'Enterprise', price: 'Custom', note: 'Volume, SSO and dedicated support.', sales: true, items: [['Leads', 'Custom'], ['SLA', 'Included'], [null, 'Dedicated manager']] },
  ],
  agency: [
    { name: 'Agency Lite', price: '$99', note: 'Up to 5 client accounts.', items: [['Clients', '5'], [null, 'White‑label reports']] },
    { name: 'Agency', price: '$249', note: 'Up to 20 client accounts.', items: [['Clients', '20'], [null, 'Client dashboards']] },
    { name: 'Agency Pro', price: '$499', note: 'Unlimited clients.', popular: true, items: [['Clients', 'Unlimited'], [null, 'Custom domain']] },
    { name: 'Agency Enterprise', price: 'Custom', note: 'Built around your portfolio.', sales: true, items: [['Clients', 'Custom'], [null, 'API & SSO']] },
  ],
};

export const reviews = ['A', 'B', 'C', 'D', 'E', 'F'].map((initial) => ({
  initial,
  quote: 'Placeholder review: add a real customer quote here.',
  name: 'Name',
  role: 'Title, Company',
}));

export const footerColumns = [
  { title: 'Product', links: ['Call Tracking', 'Form Tracking', 'Chat Tracking', 'Reporting'] },
  { title: 'Solutions', links: ['Agencies', 'Marketers', 'Business Owners', 'Sales Teams'] },
  { title: 'Resources', links: ['Blog', 'Help Center', 'API Docs', 'Integrations'] },
  { title: 'Company', links: ['About', 'Careers', 'Contact', 'Pricing'] },
];
