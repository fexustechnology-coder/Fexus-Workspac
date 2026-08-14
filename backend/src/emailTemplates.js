// =============================================================================
// BUILT-IN EMAIL TEMPLATE LIBRARY (Phase 22)
// =============================================================================
// These are deliberately NOT seeded into the database — they're served
// read-only, directly from here, alongside any real custom EmailTemplate
// rows (routes/emailTemplates.js). "Duplicate" copies one of these into a
// real, editable database row for a specific account; until duplicated,
// these are shared, static content, not per-account data.
//
// Every template uses the real merge-field syntax {name}/{email}/
// {company}/{phone}, resolved by the exact same replacePlaceholders()
// function campaignEngine.js uses at actual send time — never a second,
// possibly-divergent rendering implementation.
// =============================================================================

const BUILT_IN_TEMPLATES = [
  // --- Website Design ---
  {
    id: 'builtin-website-design-1', category: 'Website Design', name: 'New Website Outreach',
    subject: 'A modern website for {company}?',
    body: `Hi {name},

I took a look at {company}'s current online presence and think there's a real opportunity to make a stronger first impression with a modern, fast-loading website.

Would you be open to a quick chat about what that could look like for {company}?

Best,
The team`
  },
  {
    id: 'builtin-website-design-2', category: 'Website Design', name: 'Website Redesign Pitch',
    subject: '{company} — is your website working as hard as you are?',
    body: `Hi {name},

Most visitors decide whether to trust a business within seconds of landing on its website. I'd love to show {company} a few quick wins that could turn more of those visitors into customers.

Worth a 15-minute call?

Best,
The team`
  },

  // --- SEO ---
  {
    id: 'builtin-seo-1', category: 'SEO', name: 'SEO Opportunity',
    subject: '{company} is missing out on search traffic',
    body: `Hi {name},

I ran a quick look at how {company} shows up in search results, and there are a few clear opportunities to capture more of the people already searching for what you offer.

Want me to send over what I found?

Best,
The team`
  },
  {
    id: 'builtin-seo-2', category: 'SEO', name: 'SEO Content Gap',
    subject: 'A content gap I noticed for {company}',
    body: `Hi {name},

While researching your industry, I noticed a few high-intent search terms {company} isn't ranking for yet — but your competitors are.

Happy to walk you through what I found — takes 10 minutes.

Best,
The team`
  },

  // --- Google Ranking ---
  {
    id: 'builtin-google-ranking-1', category: 'Google Ranking', name: 'Local Google Ranking',
    subject: 'Is {company} showing up when local customers search?',
    body: `Hi {name},

When someone nearby searches for what {company} offers, are you showing up on the first page? If you're not sure, that's usually a sign there's room to improve.

I'd be glad to check and share the results — free of charge.

Best,
The team`
  },
  {
    id: 'builtin-google-ranking-2', category: 'Google Ranking', name: 'Ranking Drop Alert',
    subject: 'Noticed a ranking change for {company}',
    body: `Hi {name},

I noticed some movement in {company}'s Google rankings recently. It might be nothing, but it's worth a quick look before it affects your traffic.

Want me to send over the details?

Best,
The team`
  },

  // --- Business Automation ---
  {
    id: 'builtin-automation-1', category: 'Business Automation', name: 'Automate Repetitive Work',
    subject: 'How much time does {company} spend on repetitive tasks?',
    body: `Hi {name},

A lot of businesses like {company} are still doing manually what could easily be automated — data entry, follow-ups, scheduling.

I'd love to show you a couple of quick automation wins specific to your workflow.

Best,
The team`
  },
  {
    id: 'builtin-automation-2', category: 'Business Automation', name: 'Workflow Audit Offer',
    subject: 'A free workflow audit for {company}',
    body: `Hi {name},

I offer a quick, no-cost audit that identifies where {company} could save hours every week through simple automation.

Interested in seeing what it turns up?

Best,
The team`
  },

  // --- Digital Marketing ---
  {
    id: 'builtin-marketing-1', category: 'Digital Marketing', name: 'Marketing Strategy Intro',
    subject: 'A marketing idea for {company}',
    body: `Hi {name},

I've been following {company} and have a specific idea for how you could reach more of your ideal customers online — happy to share it, no strings attached.

Would a quick call work this week?

Best,
The team`
  },
  {
    id: 'builtin-marketing-2', category: 'Digital Marketing', name: 'Social Media Growth',
    subject: 'Growing {company}\'s social presence',
    body: `Hi {name},

I noticed {company}'s social channels have real potential that isn't being fully tapped yet. I put together a few ideas that could help grow your audience — want me to send them over?

Best,
The team`
  },

  // --- E-commerce ---
  {
    id: 'builtin-ecommerce-1', category: 'E-commerce', name: 'Cart Abandonment Fix',
    subject: 'Is {company} losing sales at checkout?',
    body: `Hi {name},

Most online stores lose a significant share of sales to abandoned carts. I'd like to show {company} a few proven ways to recover more of those lost sales.

Open to a quick look?

Best,
The team`
  },
  {
    id: 'builtin-ecommerce-2', category: 'E-commerce', name: 'Store Conversion Review',
    subject: 'A quick conversion review for {company}',
    body: `Hi {name},

I reviewed a few areas of {company}'s online store and spotted some quick changes that typically improve conversion rate.

Want me to send over the specifics?

Best,
The team`
  },

  // --- Follow-up ---
  {
    id: 'builtin-followup-1', category: 'Follow-up', name: 'Gentle Follow-up',
    subject: 'Following up, {name}',
    body: `Hi {name},

Just wanted to follow up on my last note — I know things get busy at {company}. Still happy to help whenever the timing's right.

Best,
The team`
  },
  {
    id: 'builtin-followup-2', category: 'Follow-up', name: 'Final Check-in',
    subject: 'One last check-in, {name}',
    body: `Hi {name},

I don't want to keep filling your inbox, so this will be my last note for now. If {company}'s needs change down the road, I'm just an email away.

Best,
The team`
  },

  // --- Website Audit ---
  {
    id: 'builtin-audit-1', category: 'Website Audit', name: 'Free Website Audit',
    subject: 'A free audit of {company}\'s website',
    body: `Hi {name},

I put together a quick audit of {company}'s website covering speed, mobile experience, and a few other key areas — happy to send it over at no cost.

Want a look?

Best,
The team`
  },
  {
    id: 'builtin-audit-2', category: 'Website Audit', name: 'Speed & Performance Audit',
    subject: 'How fast is {company}\'s website, really?',
    body: `Hi {name},

Website speed has a direct impact on how many visitors stick around. I ran a quick performance check on {company}'s site and found a few things worth fixing.

Should I send over the results?

Best,
The team`
  },

  // --- Reminder ---
  {
    id: 'builtin-reminder-1', category: 'Reminder', name: 'Appointment Reminder',
    subject: 'Reminder: your upcoming appointment',
    body: `Hi {name},

Just a quick reminder about your upcoming appointment with {company}. Let us know if you need to reschedule.

Best,
The team`
  },
  {
    id: 'builtin-reminder-2', category: 'Reminder', name: 'Offer Expiring Reminder',
    subject: 'A quick reminder before this offer ends',
    body: `Hi {name},

Just a friendly reminder that the offer we discussed for {company} is ending soon. Let me know if you'd like to move forward.

Best,
The team`
  },

  // --- Partnership ---
  {
    id: 'builtin-partnership-1', category: 'Partnership', name: 'Partnership Proposal',
    subject: 'A potential partnership with {company}',
    body: `Hi {name},

I think there could be a great opportunity for {company} and us to work together in a way that benefits both sides. Would you be open to exploring it?

Best,
The team`
  },
  {
    id: 'builtin-partnership-2', category: 'Partnership', name: 'Referral Partnership',
    subject: 'A referral partnership idea for {company}',
    body: `Hi {name},

I work with a lot of businesses similar to {company} and thought a referral partnership could be a great fit for both of us. Interested in hearing more?

Best,
The team`
  },

  // --- Re-engagement ---
  {
    id: 'builtin-reengagement-1', category: 'Re-engagement', name: 'It\'s Been a While',
    subject: 'It\'s been a while, {name}',
    body: `Hi {name},

It's been a while since we last connected. I wanted to check in and see how things are going at {company}, and whether there's anything I can help with now.

Best,
The team`
  },
  {
    id: 'builtin-reengagement-2', category: 'Re-engagement', name: 'What\'s New Update',
    subject: 'What\'s new since we last spoke',
    body: `Hi {name},

A lot has changed since we last talked, and I thought some of it might be relevant to {company}. Would you like a quick update?

Best,
The team`
  },

  // --- AI Automation ---
  {
    id: 'builtin-ai-1', category: 'AI Automation', name: 'AI for Your Business',
    subject: 'How AI could save {company} real time',
    body: `Hi {name},

More businesses like {company} are starting to use AI for the repetitive parts of their day — responding to leads, drafting content, scheduling. I'd love to show you what that could look like specifically for you.

Best,
The team`
  },
  {
    id: 'builtin-ai-2', category: 'AI Automation', name: 'AI Customer Response',
    subject: 'Never miss a lead again',
    body: `Hi {name},

Every hour a lead waits for a reply, the odds of converting them drop. I can show {company} how AI-assisted response handling keeps every lead engaged instantly.

Worth a quick look?

Best,
The team`
  }
]

const TEMPLATE_CATEGORIES = [
  'Website Design', 'SEO', 'Google Ranking', 'Business Automation', 'Digital Marketing',
  'E-commerce', 'Follow-up', 'Website Audit', 'Reminder', 'Partnership', 'Re-engagement', 'AI Automation'
]

module.exports = { BUILT_IN_TEMPLATES, TEMPLATE_CATEGORIES }
