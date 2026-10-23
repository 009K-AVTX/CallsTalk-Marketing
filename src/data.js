// Page content. Placeholder values (prices, testimonials, phone) must be replaced before launch.

export const navLinks = [
  { href: '#features', label: 'Platform' },
  { href: '#solutions', label: 'Use Cases' },
  { href: '#integrations', label: 'Connected Apps' },
  { href: '#resources', label: 'Insights' },
];

export const updates = [
  { title: 'AI-powered lead scoring is now included with all plans', tag: 'Product update' },
  { title: 'Introducing offline conversion sync for leading ad networks', tag: 'New feature' },
  { title: 'How to design attribution dashboards your clients will trust', tag: 'Guide' },
];

export const features = [
  {
    eyebrow: 'Lead Capture',
    title: 'Never miss an opportunity.',
    body: 'Dynamic number insertion, form monitoring and chat attribution automatically record where each inquiry originated.',
    links: ['Call Attribution', 'Form Monitoring', 'Chat Attribution', 'Purchase Tracking'],
  },
  {
    eyebrow: 'Lead Qualification',
    title: 'Respond with confidence.',
    body: 'Prioritize, label and value every lead from a single workspace, then assign it to the right team member while interest is high.',
    links: ['Lead Prioritization', 'Labels & Comments', 'Real-Time Notifications', 'Conversation Recording'],
  },
  {
    eyebrow: 'Reporting & Intelligence',
    title: 'Demonstrate your return.',
    body: 'Connect leads to closed revenue across all channels and deliver clear reports that quantify the return on every dollar invested.',
    links: ['Custom Dashboards', 'Conversion Sync', 'Cross-Channel Attribution', 'Automated Reporting'],
  },
];

export const solutions = {
  role: [
    { title: 'Agencies', text: 'Demonstrate measurable value with white-label client reporting.' },
    { title: 'Marketing Teams', text: 'Allocate budget to the campaigns that perform.' },
    { title: 'Owners & Operators', text: 'Understand exactly how customers find you.' },
    { title: 'Sales Leaders', text: 'Prioritize follow-up on your highest-intent prospects.' },
  ],
  industry: [
    { title: 'Home & Field Services', text: 'Attribute each service request to its originating channel.' },
    { title: 'Law Firms', text: 'Calculate the acquisition cost of every retained client.' },
    { title: 'Healthcare Providers', text: 'Attribute patient bookings with privacy built in.' },
    { title: 'Auto Dealerships', text: 'Link dealership visits to the campaigns that drove them.' },
    { title: 'Property & Real Estate', text: 'Identify the listings that generate the most interest.' },
    { title: 'Higher Education', text: 'Follow each enrollment back to its first interaction.' },
    { title: 'Financial Services', text: 'Assess lead quality by the business it produces.' },
    { title: 'Online Retail', text: 'Unite phone sales with the digital journey behind them.' },
  ],
};

export const integrations = [
  'Advertising Networks', 'CRM Platforms', 'Web Analytics', 'Contact Centers', 'Email Marketing', 'Live Chat',
  'Online Forms', 'Custom Webhooks', 'Workflow Automation', 'Cloud Data Warehouses', 'Team Messaging', 'Developer API',
];

export const steps = [
  { title: 'Create your account', text: 'Registration takes less than sixty seconds.', link: 'Get started' },
  { title: 'Install the tracking code', text: 'Add a single snippet directly or through your tag manager.', link: 'View setup guide' },
  { title: 'Link your platforms', text: 'Connect your advertising accounts and CRM.', link: 'See connections' },
  { title: 'Work with our experts', text: 'Our specialists make sure your configuration is accurate.', link: 'Speak with us' },
];

export const pricing = {
  business: [
    { name: 'Essentials', price: '$29', note: 'Ideal for single-location businesses.', items: [['Monthly leads', '100'], ['Seats', '2'], [null, 'Form and chat attribution']] },
    { name: 'Standard', price: '$79', note: 'Adds call attribution and lead scoring.', items: [['Monthly leads', '500'], ['Seats', '5'], [null, 'Call attribution and recording']] },
    { name: 'Premium', price: '$149', note: 'Complete attribution and advanced reporting.', popular: true, items: [['Monthly leads', '2,000'], ['Seats', 'Unlimited'], [null, 'Offline conversion sync']] },
    { name: 'Enterprise', price: 'Tailored', note: 'High-volume plans with SSO and priority support.', sales: true, items: [['Monthly leads', 'Flexible'], ['SLA', 'Guaranteed'], [null, 'Dedicated account manager']] },
  ],
  agency: [
    { name: 'Agency Starter', price: '$99', note: 'Manage up to 5 client accounts.', items: [['Client accounts', '5'], [null, 'White-label reporting']] },
    { name: 'Agency Plus', price: '$249', note: 'Manage up to 20 client accounts.', items: [['Client accounts', '20'], [null, 'Dedicated client portals']] },
    { name: 'Agency Premium', price: '$499', note: 'No limit on client accounts.', popular: true, items: [['Client accounts', 'Unlimited'], [null, 'Branded custom domain']] },
    { name: 'Agency Enterprise', price: 'Tailored', note: 'Designed around your client portfolio.', sales: true, items: [['Client accounts', 'Flexible'], [null, 'API access and SSO']] },
  ],
};

export const reviews = ['A', 'B', 'C', 'D', 'E', 'F'].map((initial) => ({
  initial,
  quote: 'Placeholder: insert a genuine customer testimonial here.',
  name: 'Full Name',
  role: 'Job Title, Organization',
}));

export const footerColumns = [
  { title: 'Platform', links: ['Call Attribution', 'Form Monitoring', 'Chat Attribution', 'Analytics & Reports'] },
  { title: 'Use Cases', links: ['Agencies', 'Marketing Teams', 'Owners & Operators', 'Sales Leaders'] },
  { title: 'Learn', links: ['Articles', 'Support Center', 'Developer Documentation', 'Connected Apps'] },
  { title: 'About', links: ['Our Story', 'Join Our Team', 'Contact Us', 'Plans & Pricing'] },
];
