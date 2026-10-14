// Client-safe pieces of onboarding (§23.2 step 3e): the prompt the founder copies into their own AI assistant, and
// the name its answer goes by once pasted back.

/** The name the pasted summary goes by, as a file the agent can read. */
export const PASTED = "Your AI summary";

/** The prompt the founder pastes into ChatGPT, Claude or Gemini; the answer comes back as a source (§23.2 step 3e). */
export const CONTEXT_PROMPT = `I'm setting up a growth plan for my consumer brand in a tool called Athena. From everything I've told you in our past conversations, write a summary of my business that Athena can read. Use these headings, and only include what I've actually told you; write "not discussed" where you don't know, and mark anything you're inferring as (inferred).

- Brand name and website
- What we sell: products, prices, what makes them different
- Who buys: the customers we have and the ones we want
- Where we sell now: our own site, marketplaces, shops and stockists, cities or regions
- Stage and size: launch date, revenue or units if I mentioned them, team
- Brands our customers also love, and our competitors
- Goals for the next 6–12 months, budget, and constraints (capacity, margins, timing)
- Upcoming launches, dates or events`;
