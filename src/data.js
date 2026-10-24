// Page content. Placeholder values (prices, testimonials, phone) must be replaced before launch.

export const navLinks = [
  { href: '/#features', label: 'Platform' },
  { href: '/#solutions', label: 'Use Cases' },
  { href: '/#integrations', label: 'Connected Apps' },
  { href: '/#resources', label: 'Insights' },
];

export const updates = [
  { title: 'Lead Scores Now Come with Every Plan', tag: 'Product update' },
  { title: 'Closed Deals Now Sync Back to Your Ad Accounts', tag: 'New feature' },
  { title: 'Building a Client Report That Answers the Monday Question', tag: 'Guide' },
];

export const features = [
  {
    eyebrow: 'Lead Capture',
    title: 'Every ring has a source.',
    body: 'Calls, forms and chats land with the ad, keyword and page that sent them.',
    cta: 'Explore lead capture',
    links: [
      { name: 'Call Attribution', text: 'Unique numbers reveal the ad behind each call.' },
      { name: 'Form Monitoring', text: 'Each submission arrives with its visit history.' },
      { name: 'Chat Attribution', text: 'Chats stay tied to the visit that began them.' },
      { name: 'Purchase Tracking', text: 'Phone and online orders traced to their first touch.' },
    ],
  },
  {
    eyebrow: 'Lead Qualification',
    title: 'Your hottest leads reach sales first.',
    body: 'CallsTalk scores each lead on intent and hands the best ones to the right person in seconds.',
    cta: 'Explore lead qualification',
    links: [
      { name: 'Lead Prioritization', text: 'The most serious callers float to the top.' },
      { name: 'Labels & Comments', text: 'Notes and outcomes travel with the lead.' },
      { name: 'Real-Time Notifications', text: 'An alert the moment a qualified lead arrives.' },
      { name: 'Conversation Recording', text: 'Replay what was said and promised.' },
    ],
  },
  {
    eyebrow: 'Reporting & Intelligence',
    title: 'Show what every dollar returned.',
    body: 'Closed revenue flows back to the campaign that earned it, ready for any report.',
    cta: 'Explore reporting',
    links: [
      { name: 'Custom Dashboards', text: 'A view for every team and client.' },
      { name: 'Conversion Sync', text: 'Closed deals feed back into your ad platforms.' },
      { name: 'Cross-Channel Attribution', text: 'Every touchpoint receives its share of credit.' },
      { name: 'Automated Reporting', text: 'Scheduled reports delivered straight to inboxes.' },
    ],
  },
];

export const solutions = {
  role: [
    { title: 'Agencies', text: 'Give clients reports under your own brand.' },
    { title: 'Marketing Teams', text: 'Move budget to the ads that ring.' },
    { title: 'Owners & Operators', text: 'Finally see how customers find you.' },
    { title: 'Sales Leaders', text: 'Call back the serious buyers first.' },
  ],
  industry: [
    { title: 'Home & Field Services', text: 'Know which ad booked each job.' },
    { title: 'Law Firms', text: 'Price each signed case by its source.' },
    { title: 'Healthcare Providers', text: 'Trace bookings while keeping patient details private.' },
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
  { title: 'Open an Account', text: 'It takes less than a minute.', link: 'Get Started', href: '/request-access' },
  { title: 'Add the Snippet', text: 'Paste it into your site or add it through your tag manager.', link: 'View Setup Guide', href: '/#how' },
  { title: 'Connect Your Platforms', text: 'Link your ad accounts, CRM and messaging tools.', link: 'See Connections', href: '/#integrations' },
  { title: 'Get a Setup Review', text: 'A specialist confirms that everything is configured correctly.', link: 'Speak With Us', href: '/request-access' },
];

// Attribution plans shown in the pricing section. Prices are per month in USD.
export const PLANS = [
  {
    name: 'Starter',
    price: '$49',
    period: 'per month',
    fit: 'For one business that wants to see which marketing brings in customers.',
    features: [
      'Call, form and chat attribution',
      '1 website',
      'Campaign, keyword and page reports',
      'Real-time lead alerts',
      'Email and chat support',
    ],
    cta: 'Request Access',
  },
  {
    name: 'Growth',
    price: '$149',
    period: 'per month',
    fit: 'For teams that want revenue by channel and leads synced to their tools.',
    features: [
      'Everything in Starter',
      'Up to 5 websites',
      'Lead scoring and labels',
      'Revenue by channel and campaign',
      'CRM and ad platform sync',
      'Priority support',
    ],
    cta: 'Request Access',
    featured: true,
  },
  {
    name: 'Agency',
    price: 'Custom',
    period: 'for many clients',
    fit: 'For agencies that report on results across many client accounts.',
    features: [
      'Everything in Growth',
      'Unlimited client websites',
      'Client workspaces and branded reports',
      'Developer API',
      'Dedicated account manager',
    ],
    cta: 'Talk to Us',
  },
];

export const PLAN_NOTES = ['No setup fees', 'A specialist sets you up', 'Change plans anytime'];

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
