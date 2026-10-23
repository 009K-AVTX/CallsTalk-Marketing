// Legal Center content, structured after the Avortyx Legal Center and adapted to CallsTalk.
// Contact addresses live here so they can be changed in one place.
export const SUPPORT_EMAIL = 'support@callstalk.com';
export const TELEGRAM_HANDLE = 'callstalk';
export const LEGAL_EMAIL = 'legal@callstalk.com';
const EFFECTIVE = 'October 23, 2026';

export const DOCS = {
  terms: {
    title: 'Terms of Service',
    summary: 'The agreement that governs every CallsTalk account: access, use, billing, liability and disputes.',
    effective: EFFECTIVE,
    intro: [
      'These Terms of Service (the "Terms") set out the agreement between you and CallsTalk ("we", "us" or "our"). They govern the CallsTalk attribution platform, its web application, tracking code, APIs, tracking numbers and related services, and this website (together, the "Service").',
      'Please read Section 20 closely: it sends most disputes to individual arbitration and waives class actions. Section 9 makes you responsible for claims that come from how you use the Service.',
      'You accept these Terms when you create an account, sign an Order Form that refers to them, or otherwise use the Service. If you do not accept them, you may not use the Service. You must be an adult (18 or over) with the legal capacity to make a binding contract.',
    ],
    sections: [
      { title: 'Who may use the Service', blocks: [
        '1.1. Businesses only. The Service is for businesses and for individuals acting on behalf of a business. It is not offered for personal, family or household use.',
        '1.2. Accepting for an organization. If you accept these Terms for a company or other organization, you confirm that you have authority to bind it. In that case "you" means both you and that organization.',
        '1.3. Verification. You will give us accurate business, identity and contact details when we ask, including anything carriers need to register tracking numbers, and you will keep them up to date. We may refuse, suspend or close an account whose details we cannot verify.',
      ] },
      { title: 'Your account', blocks: [
        `2.1. Sign-in details. Each user signs in with their own credentials. Do not share them, use anyone else's, or try to get around any sign-in or access control. Tell us straight away at ${SUPPORT_EMAIL} if you suspect someone has gained access to your account without permission.`,
        '2.2. Activity on your account. You are responsible for everything done through your account and for the accuracy of the data in it. We are not responsible for losses caused by someone using your credentials.',
        '2.3. Clients and people working for you. If you use the Service for clients, or let contractors or agencies act for you, you are responsible for them, and you will make sure they follow these Terms and the law.',
      ] },
      { title: 'Using the platform', blocks: [
        '3.1. Permission to use the Service. While your account is in good standing, we give you a limited, non-exclusive, non-transferable and revocable right to use the Service to track and attribute calls, forms and chats for your own business or for your clients, and to view the reports that come with them.',
        '3.2. What belongs to CallsTalk. CallsTalk and its licensors own the Service, including its software, design, documentation and the CALLSTALK name and logos. All rights not expressly given to you in these Terms are kept by CallsTalk.',
        { list: [
          'resell or sublicense the Service, or use it to build a product that competes with it, except through a plan that includes white-label reporting;',
          'copy or reuse any part of the Service, including its text, screens or code, except as these Terms allow;',
          'reverse engineer, decompile or disassemble the Service, or try to work out its source code or algorithms;',
          'collect data from the Service with bots, scrapers or other automated tools, other than through our published APIs used as documented.',
        ], lead: '3.3. What you may not do. Unless we agree in writing, you may not:' },
        '3.4. Security. You may not overload or disrupt the Service, probe or test its security, or introduce malware or spam.',
        '3.5. Changes to the Service. We may add, change, limit or remove features, and set usage limits, at any time. Where a change materially reduces what you have paid for, we will tell you in advance where we reasonably can.',
      ] },
      { title: 'Following the law', blocks: [
        '4.1. Your responsibility. You will use the Service only in ways that comply with every law and industry rule that applies to you, including privacy, consumer protection, telemarketing and call recording laws.',
        '4.2. Tracking on your websites. When you place the CallsTalk tracking code on a website, you are responsible for telling visitors about it in your own privacy policy and for obtaining any consent the law requires for analytics and attribution in their location.',
        { list: [
          'track people for unlawful purposes or collect information you have no right to collect;',
          'give false or misleading information, or impersonate any person or brand;',
          'handle protected health information as defined under HIPAA unless we have agreed to it in writing;',
          'use tracking numbers for unlawful, unwanted or deceptive calls or messages; or',
          'connect to or stand in for emergency services such as 911 or E911.',
        ], lead: '4.3. Prohibited activity. In particular, you may not use the Service to:' },
      ] },
      { title: 'Consent and records', blocks: [
        '5.1. Consent first. Before you, or anyone acting for you, contacts a consumer using data from the Service, you must have any consent the law requires.',
        '5.2. Keep your own copies. The Service records and attributes activity; it is not an archive. Export what you need to prove compliance and store it in your own systems. We are not liable if records held only in the Service are deleted or unavailable.',
      ] },
      { title: 'Your content and our oversight', blocks: [
        '6.1. Your content. "Content" means anything you send, track, upload or store through the Service, including call recordings, form and chat data, and lead details. You are responsible for your Content and promise that you have the rights and consents needed to use it.',
        '6.2. Review. We may, but do not have to, review Content, and we may remove Content that we believe is unlawful or against these Terms.',
        '6.3. Monitoring. You agree that we may monitor use of the Service to detect and stop activity that does not comply with these Terms or the law.',
      ] },
      { title: 'Tracking numbers, recording and emergency calls', blocks: [
        '7.1. Numbers. Tracking numbers are assigned by carriers and regulators. You may use the numbers on your account while it is active and paid up, but you do not own them. Porting follows the carriers\' own processes.',
        '7.2. Recording. Some states and countries require every party to agree before a call is recorded. You are responsible for any notice and consent each recorded or transcribed call needs. Recording announcements and settings help with this but do not shift your responsibility to us.',
        '7.3. No emergency calling. The Service cannot be used to call 911, E911 or any other emergency number. We are not liable if emergency services cannot be reached through the Service.',
      ] },
      { title: 'Fees and payment', blocks: [
        '8.1. Fees. You will pay the fees for your plan at the rates on our pricing page or in your Order Form. Fees are in U.S. dollars and do not include taxes, which you will pay.',
        '8.2. Billing details. You confirm that you are entitled to use the payment method you give us. We use third-party payment processors and may give them the information they need to take payment.',
        '8.3. Unpaid fees. If you do not pay on time, we may suspend or close your account and release its tracking numbers.',
        '8.4. Refunds. Fees already charged are not refundable except where these Terms or the law say otherwise.',
      ] },
      { title: 'Your responsibility for claims', blocks: [
        'You will defend CallsTalk, together with its owners, staff and affiliates, and hold them harmless against any claim, penalty, loss or cost (including reasonable attorneys\' fees) that arises from how you, or anyone acting for you, use the Service, including breaches of these Terms and violations of law.',
      ] },
      { title: 'Term, suspension and cancellation', blocks: [
        '10.1. Term. These Terms apply from the moment you register until your account is closed by you or by us.',
        '10.2. Suspension or closure by CallsTalk. We may suspend or close your account for a breach of these Terms, unpaid fees, a request from a regulator or carrier, or our reasonable view that your use creates legal or reputational risk. Where reasonable, we will let you know.',
        '10.3. Cancelling. You may cancel at any time from your dashboard or by contacting support. Your account stays available until the end of your current billing period, and you still owe fees for usage before cancellation.',
        '10.4. When access ends. When your account closes you lose access to your reports, call logs and recordings, and we may delete them. Numbers you have not ported out are released to the carriers.',
      ] },
      { title: 'Third-party services', blocks: [
        '11.1. Links and content. The Service may link to other websites. We do not control or endorse them, and they have their own terms and privacy policies.',
        '11.2. Integrations you connect. When you connect an integration, such as an ad platform, a CRM or Zapier, that provider\'s terms govern your use of it, and we are not responsible for how it handles data you choose to send to it.',
      ] },
      { title: 'AI features', blocks: [
        '12.1. Outputs. Lead scores, transcripts, summaries and the website assistant\'s answers are produced automatically and may be incomplete or wrong. Check them before relying on them.',
        '12.2. Providers. Some AI features use third-party model providers, as the Privacy Policy describes.',
      ] },
      { title: 'Beta and preview features', blocks: [
        'Features marked beta or preview are offered as they are, for evaluation. They may change or be withdrawn at any time and may be less reliable than the rest of the Service.',
      ] },
      { title: 'Confidentiality', blocks: [
        'Each party will use the other\'s non-public information, such as Order Form pricing, product plans, security details and customer data, only for the purposes of these Terms, share it only with people who need it and are bound by similar duties, and protect it with at least reasonable care.',
      ] },
      { title: 'Feedback', blocks: [
        'Ideas and suggestions you send us about the Service are ours to use for any purpose, without payment or credit to you.',
      ] },
      { title: 'Communications and privacy', blocks: [
        `16.1. Messages from us. You agree that CallsTalk may contact you by email, phone or chat about your account and our services. You can opt out of marketing messages at any time by writing to ${SUPPORT_EMAIL}.`,
        '16.2. Your data. The Privacy Policy explains how we collect, use and share information, and forms part of these Terms.',
      ] },
      { title: 'Copyright complaints', blocks: [
        `To report material on the Service that you believe infringes your copyright, email ${SUPPORT_EMAIL} with the subject "Copyright Infringement", identifying the work, the material and where it appears, your contact details, a good-faith statement, a statement under penalty of perjury that your notice is accurate and that you may act for the owner, and your signature.`,
      ] },
      { title: 'Disclaimers', blocks: [
        'The Service is provided "as is" and "as available". To the extent the law allows, CallsTalk makes no warranties of any kind, and does not promise that the Service will run without interruption or errors.',
        'We do not promise any particular number of leads, calls, conversions or revenue, and attribution reports are estimates based on the data available to the Service.',
      ] },
      { title: 'Limits on liability', blocks: [
        'To the fullest extent the law allows, CallsTalk is not liable for indirect, incidental, special or consequential damages, or for lost profits, revenue or data, and its combined liability for all claims is capped at the amount you paid CallsTalk for the Service in the twelve (12) months before the claim.',
      ] },
      { title: 'Disputes and arbitration', blocks: [
        '20.1. Arbitration instead of court. Except as Section 20.2 allows, you and CallsTalk agree to resolve any dispute about these Terms or the Service only by final and binding individual arbitration, and both waive any right to a jury or to a class or representative action.',
        '20.2. Exceptions. Either party may bring an individual claim in small claims court, and CallsTalk may ask a court for urgent relief to protect its intellectual property or stop unauthorized access.',
        '20.3. Rules. The American Arbitration Association administers any arbitration under its Commercial Arbitration Rules, with a single arbitrator.',
        '20.4. One year to bring a claim. A claim must be raised in writing within one (1) year of the events giving rise to it, or it is permanently barred.',
      ] },
      { title: 'Events beyond our control', blocks: [
        'CallsTalk is not liable for any failure or delay caused by events beyond its reasonable control, including failures of carriers or hosting providers, cyberattacks, government orders and natural disasters.',
      ] },
      { title: 'Export controls and sanctions', blocks: [
        'You will follow U.S. export control and sanctions laws, and confirm that neither you nor anyone who controls you is located in a sanctioned country or appears on a U.S. restricted-party list.',
      ] },
      { title: 'Changes to these Terms', blocks: [
        'We may revise these Terms. We will post the new version here with its effective date and, for material changes, make reasonable efforts to give you at least thirty (30) days\' notice. Using the Service after a change takes effect means you accept it.',
      ] },
      { title: 'Notices', blocks: [
        `24.1. Notices to you. We may send notices to the email address on your account or post them in the dashboard.`,
        `24.2. Legal notices to CallsTalk. Legal notices must be emailed to ${LEGAL_EMAIL} with "Legal Notice" in the subject line, and take effect when we confirm receipt.`,
        `24.3. Everyday questions. For support and other questions, write to ${SUPPORT_EMAIL}. Those messages are not legal notices.`,
      ] },
      { title: 'General terms', blocks: [
        '25.1. Governing law. The laws of the U.S. state in which CallsTalk is organized govern these Terms, together with applicable U.S. federal law.',
        '25.2. Policies that form part of these Terms. The Privacy Policy and Cookie Policy in the Legal Center are part of these Terms. An Order Form signed by both parties prevails over both.',
        '25.3. Whole agreement. These Terms, with the policies and any Order Form, are the complete agreement between you and CallsTalk about the Service.',
        '25.4. Other terms. If part of these Terms is unenforceable, the rest continues in force. Not enforcing a right is not a waiver. We may transfer these Terms; you may not without our written consent. You and CallsTalk are independent parties.',
      ] },
    ],
  },

  privacy: {
    title: 'Privacy Policy',
    summary: 'How CallsTalk collects, uses and protects personal information.',
    effective: EFFECTIVE,
    intro: [
      'This Privacy Policy explains how CallsTalk ("we", "us" or "our") collects, uses, shares and protects information through this website and the CallsTalk attribution platform, its tracking code, applications and APIs (together, the "Service"). Terms in capitals that are not defined here have the meaning given in our Terms of Service.',
      'We handle information in two roles. For our website visitors and for the businesses that use CallsTalk, we decide how information is used. For the data our customers track through the platform (their visitors, callers, form and chat leads), we act on our customers\' instructions as their service provider, and our customer is responsible for how that data is collected and used.',
      `Questions about this policy can be sent to ${SUPPORT_EMAIL}.`,
    ],
    sections: [
      { title: 'Information we collect', blocks: [
        '1.1. Information you give us. When you request access, create an account, contact us or use the Service, you may give us your name, email address, phone number, company name and other business details, account settings, and the content of messages and support requests you send us.',
        '1.2. Billing information. To bill you we collect billing contact details and payment information. Payments are handled by third-party payment processors.',
        '1.3. Information collected automatically. When you visit this website, our hosting provider receives technical information such as your IP address, browser type and the pages you request, which it uses to deliver and secure the site. This website does not use advertising or analytics cookies.',
        '1.4. The chat. When you use the chat on this website, the assistant\'s answers are generated by a third-party AI provider that receives your questions. If you choose to talk to our team, we keep the name, email address and messages you send, together with the page you wrote from and your IP address, and our team receives them through Telegram, which processes them on our behalf. Your browser keeps your open conversation (an ID, your name and email) in its local storage so a reload does not lose it; you can remove it by ending the chat or clearing your browser\'s site data. We use IP addresses to spot spam and abuse and to limit how many chats one network can start.',
        '1.5. Data our customers track through CallsTalk. Our customers use CallsTalk to attribute calls, forms and chats. That data can include callers\' phone numbers, form and chat details, visit and campaign information, call logs, recordings and transcripts.',
        '1.6. Children. The Service is for businesses and is not directed to children. We do not knowingly collect personal information from anyone under 13, and we delete it if we learn that we have.',
      ] },
      { title: 'How we use information', blocks: [
        { lead: 'We use information to:', list: [
          'provide, operate and maintain the Service, including attributing calls, forms and chats as our customers configure;',
          'create and manage accounts and register tracking numbers with carriers;',
          'bill for the Service and collect payment;',
          'respond to requests and provide support, including through the chat;',
          'tell you about changes to the Service, and send marketing to business contacts, who can opt out at any time;',
          'understand how the Service is used so we can improve it;',
          'detect, prevent and investigate fraud, abuse and security incidents; and',
          'meet our legal obligations and enforce our agreements.',
        ] },
        '2.1. AI features. When a customer turns on AI features such as lead scoring, transcription or summaries, we process the related call audio and content with our AI service providers to produce those results. Our customers remain responsible for any consent that recording and analyzing their calls requires.',
      ] },
      { title: 'How we share information', blocks: [
        { lead: 'We do not sell personal information. We share it only as follows:', list: [
          'Service providers that host, store, secure, support and bill for the Service, including our hosting provider, our AI provider and Telegram for team chat, under terms that limit how they use it.',
          'Carriers, when needed to provide tracking numbers and connect calls.',
          'Integrations that you choose to connect, such as an ad platform, a CRM or Zapier. Once data reaches them, their own terms and privacy policies apply.',
          'Authorities and others when the law requires it, or when needed to protect the rights, property or safety of CallsTalk, our customers or others.',
          'A buyer or successor if CallsTalk is involved in a merger, acquisition, financing or sale of assets.',
        ] },
        '3.1. Our customers\' data. We do not sell or rent the data our customers track through CallsTalk, and we do not combine it across customers to build our own marketing lists.',
        '3.2. Aggregated statistics. We may produce statistics, such as overall call volumes or attribution coverage, that cannot reasonably be traced back to you, your company or any consumer, and use them to run and improve the Service.',
      ] },
      { title: 'Keeping information', blocks: [
        '4.1. Account and website data. Account, contact and chat information is kept while your account or conversation is active and afterwards as needed to meet legal, tax and accounting obligations, resolve disputes and enforce our agreements.',
        '4.2. Customer data. Our customers choose how long recordings, transcripts and call logs are kept, using the retention settings in their account, and are responsible for choosing periods that comply with the law.',
        '4.3. Legal holds. We may keep information longer when the law requires it or when it is needed for a legal claim or investigation.',
      ] },
      { title: 'Security', blocks: [
        'We protect information with encryption in transit (TLS), access controls and monitoring. No system is completely secure, so we cannot guarantee that information will never be accessed without permission. If a breach affects your personal information, we will tell you promptly, as the law requires.',
      ] },
      { title: 'Where information is processed', blocks: [
        'CallsTalk is based in the United States, and information is stored and processed there and in other countries where our providers operate. If you use the Service from outside the United States, your information will be transferred to and handled in the United States.',
      ] },
      { title: 'Your choices and rights', blocks: [
        `7.1. Marketing. You can stop marketing emails from us at any time with the unsubscribe link in each one or by writing to ${SUPPORT_EMAIL}.`,
        '7.2. Browser storage. You can clear the chat data this website keeps in your browser at any time from your browser\'s settings. This website does not currently act on the Do Not Track setting.',
        '7.3. Access and correction. You can see and update most account information in your dashboard, or ask us for a copy of the personal information we hold about you.',
        '7.4. U.S. state privacy rights. If you live in a U.S. state with a consumer privacy law, such as California, Colorado, Connecticut, Utah or Virginia, you may be entitled to learn which personal information we collected about you, to receive a copy, to have it corrected or deleted, and to opt out of its sale or use for targeted advertising. We do not sell personal information or use it for cross-context behavioral advertising, and we will not treat you differently for exercising these rights.',
        `7.5. Making a request. Send your request to ${SUPPORT_EMAIL}, headed "Privacy Request". We will need to confirm your identity before acting on it. If your request is about data one of our customers tracks through CallsTalk, we will pass it to that customer.`,
      ] },
      { title: 'Other websites', blocks: [
        'Our website and the Service may link to sites and services we do not own or control. Their privacy practices are their own, so please read their policies before giving them your information.',
      ] },
      { title: 'Changes to this policy', blocks: [
        'We may update this policy from time to time. We will post the new version here with its effective date and, for material changes, tell you by email, in the dashboard or on our website.',
      ] },
      { title: 'Contact us', blocks: [
        `For questions or requests about this policy, email ${SUPPORT_EMAIL}. Formal notices can be sent to ${LEGAL_EMAIL}.`,
      ] },
    ],
  },

  cookies: {
    title: 'Cookie Policy',
    summary: 'The cookies and browser storage the CallsTalk website uses, and how to control them.',
    effective: EFFECTIVE,
    intro: [
      'This Cookie Policy explains what this website stores in your browser and why. It forms part of our Privacy Policy.',
    ],
    sections: [
      { title: 'Cookies', blocks: [
        'This website does not set cookies, and it does not use advertising, analytics or social media trackers. Our fonts and images are served from our own domain, so loading the site does not contact third-party font or tracking services.',
      ] },
      { title: 'Browser storage', blocks: [
        { lead: 'The website uses your browser\'s local storage for one functional purpose:', list: [
          'Chat with our team: when you start a conversation with our team, your browser keeps the conversation ID, your name and your email so a page reload does not lose the chat. It is removed when you end the chat.',
        ] },
        'Local storage stays on your device and is not sent to us except as part of the chat you choose to start.',
      ] },
      { title: 'Your choices', blocks: [
        'You can clear local storage at any time from your browser\'s settings for this site. The website works without it; only the chat history in your browser is lost.',
      ] },
      { title: 'The CallsTalk tracking code', blocks: [
        'This policy covers the CallsTalk website only. Businesses that place the CallsTalk tracking code on their own websites are responsible for describing it in their own cookie and privacy notices.',
      ] },
      { title: 'Changes and contact', blocks: [
        `We will post any update to this policy here with its effective date. Questions can be sent to ${SUPPORT_EMAIL}.`,
      ] },
    ],
  },
};

// Legal Center groups, following the Avortyx layout. Only published documents are listed.
export const LEGAL_GROUPS = [
  { title: 'Agreements', docs: ['terms', 'privacy'] },
  { title: 'Policies', docs: ['cookies'] },
];
