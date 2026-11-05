# Client Brief

## Client
Company A, Ahmedabad. Residential developer with 2 live projects (420 apartments, 2 and 3 BHK, ₹65 lakh to ₹1.2 crore). 60 staff including 11 in sales, annual bookings ₹180–220 crore.

## Today
Leads come from property portals, social media ads, the website and a hoarding phone number, and land in an inbox and an Excel sheet. A telecaller calls them the next morning. Site visits are fixed on WhatsApp and nobody records who came.

## The problem
Assumptions: 3,000 leads a month from ₹30 lakh of monthly ad and portal spend, ₹1,000 per lead. Median first response is 14 hours, and 35% of leads are never reached within 48 hours. 3,000 × 35% = 1,050 wasted leads × ₹1,000 = ₹10.5 lakh a month, or ₹1.26 crore a year. Only 6% of leads visit a site.

## Users
Home buyers (mostly on phones), sales executives and the sales head. The Director of sales and marketing signs the deal.

## The ask
We pay for every lead and then let a third of them go cold. I want every enquiry answered within two minutes, at any hour, in the buyer's language. The assistant should answer basic questions, learn what they want and book a site visit in a real free slot. Serious buyers should go to a named salesperson with the chat history.

## Must have
- One lead list from all sources, with source tags and duplicate checks
- AI chat assistant (web chat now, WhatsApp later) in English, Hindi or Gujarati that answers from a fact sheet and asks budget and needs
- Site-visit booking against free slots, with location pin and reminders 1 day and 2 hours before
- Handoff to a named executive with a chat summary
- Dashboard of response time, visits, show-up rate and cost per visit by source
- Admin editor for the fact sheet and visit slots

## Core build
Software Engineering candidates must ship this slice end to end, in about 6 to 8 screens: lead list with duplicate check, AI chat from the fact sheet, site-visit booking with reminders, handoff, and source dashboard. Roles: buyer and sales executive. AI: chat assistant with a booking tool. Hard part: booking only real free slots, with no double booking. Mock payments, messages and outside systems, and seed from the sample data. The rest of MUST HAVE is optional depth.

## Out of scope
- Full CRM replacement
- Booking payments and allotment letters
- Outbound voice calling

## Ai or automation
The assistant is an AI agent with a booking tool. When it is wrong: it can only state facts from the sales head's fact sheet; if a fact is missing it says a person will confirm and hands off; it never quotes a final price or discount. Buyers can ask for a person at any time, and the sales head reviews flagged chats daily.

## Constraints
Under RERA, promotional messages must show the project registration number and make no claims beyond registered details. Buyer numbers are personal data under the DPDP Act 2023: contact only with consent and honour opt-outs. WhatsApp business messages need opt-in templates.

## Design
The client values good, minimal design: clean layouts, white space, a restrained palette and clear type, with nothing on screen that lacks a purpose. Design counts as much as features. The chat and booking flow should feel calm and premium, in keeping with the price of the homes.

## Budget and time
₹6 lakh, 6 weeks. Success: median first response under 5 minutes; leads not reached in 48 hours from 35% to under 5%; lead-to-visit rate from 6% to 8% in 3 months.

## Sample data
| Lead ID | Name | Source | Project | Wants | Visit Status |
|---|---|---|---|---|---|
| LD-58210 | Hardik Patel | Property portal | Project 1 | 3 BHK | Booked 2026-11-01 11:00 |
| LD-58211 | Nidhi Shah | Social media ad | Project 2 | 2 BHK | Not booked |
| LD-58224 | Kavita Joshi | Hoarding call | Project 2 | 2 BHK | Visited |

