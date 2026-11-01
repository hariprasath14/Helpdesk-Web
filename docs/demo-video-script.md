# Demo video script and interview walkthrough

A 2½-minute screen recording of the demo build, and how to show the project live in an interview. Every click below matches the sample workspace in `src/demo/snapshot.json` (Orbit Cycles, signed in as Priya Nair, admin).

## Before recording

- Open the demo (the live link, or `npm run dev:demo` and http://localhost:5173) in a fresh tab, so the sample data starts clean.
- Browser window about 1440 × 900, zoom 100%, bookmarks bar hidden. Light mode.
- Record at 1080p or more. Free tools: OBS Studio, or the Windows Snipping Tool's screen recorder (Win + Shift + R).
- Read the narration at a calm pace; it is written to fit the clicks. Pause a beat after each click so the screen settles.

## The video (about 2½ minutes)

| Time      | On screen                                                                                                                                                                                       | Say                                                                                                                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:15 | Home page. Point at the four counts, then at Due soonest.                                                                                                                                       | "This is a multi-tenant help desk I built on my own: React and TypeScript on the front, Fastify, PostgreSQL and a job worker on the back. Here a support agent starts the day: their open work, what's overdue, and what's due next." |
| 0:15–0:35 | Click **Tickets**. Click **Priority**, tick High and Urgent. Then **Order** → **Due soonest**. Click **Clear filters**.                                                                         | "Every ticket from email, the web form or the phone lands here. Filters and sorting are in the address, so any list can be shared or saved as a view."                                                                                |
| 0:35–1:05 | Open **#5 Bike arrived damaged: bent derailleur hanger**. Point at the SLA timers in the header, then at the line "Rule: Damaged on arrival: high priority…".                                   | "This customer emailed in. A rule I set up spotted the word _damaged_, raised the priority and tagged it. The SLA timers count only business hours, Monday to Saturday, nine to six India time, and skip holidays."                   |
| 1:05–1:35 | Click **Take it**. Click **Reply**, then **Canned response** → **Warranty claim received**. Show the filled-in names. In **Then set status** pick **Waiting on customer**, then **Send reply**. | "I take the ticket, insert a saved reply, and its placeholders fill in with the customer's first name and mine. Sending it stops the reply timer and puts the ticket on hold until the customer answers."                             |
| 1:35–1:50 | Click **Show changes** in the conversation. Point at the history lines.                                                                                                                         | "Every change is recorded: who did it, a person or a rule, and what it was before."                                                                                                                                                   |
| 1:50–2:10 | Click **Settings** → **Rules**, open **Route returns and refunds to Returns & Warranty**. Then **SLAs**.                                                                                        | "Admins build automation without code: conditions, actions, and time-based rules that run on a background worker. SLA policies can differ by customer, like this one for business accounts."                                          |
| 2:10–2:25 | Narrow the window to phone width (or open the browser's device toolbar) on the ticket list, then open a ticket.                                                                                 | "The whole app works on a phone."                                                                                                                                                                                                     |
| 2:25–2:40 | Back to full width. Show the README on GitHub (the Engineering highlights).                                                                                                                     | "Under the hood: row-level security in PostgreSQL keeps each company's data apart, the frontend's types are generated from the API contract, and every feature has unit and end-to-end tests. The links are in the description."      |

Description for the video (YouTube, unlisted, or LinkedIn):

> A multi-tenant help desk built end to end: React + TypeScript, Fastify, PostgreSQL with row-level security, a pg-boss job worker, AWS CDK. Try the live demo: DEMO_LINK. Code: https://github.com/hariprasath14/Helpdesk-Web and https://github.com/hariprasath14/Helpdesk-API

## Showing it in an interview

**Five minutes, screen share:** follow the video's clicks on the live demo. It needs nothing installed and resets on reload, so a mistake costs nothing.

**When they want more (the real app, on your laptop):** start the full stack as in "Run locally" (Docker for PostgreSQL and Mailpit, then the API, the worker and `npm run dev`). This shows what the demo can't:

- **Email to ticket:** send a mail to the workspace address from Mailpit (http://localhost:8025) and watch the ticket appear.
- **Live updates and collision warnings:** open the same ticket in two browser windows signed in as two agents; one sees the other viewing and replying, live.
- **Background jobs:** a time-based rule or an SLA warning firing from the worker.
- **The code:** a feature end to end, for example a ticket update: the route and its schema, the service in a transaction, the row-level security policy, the generated client on the front and its tests.

**Questions to be ready for:** why row-level security instead of a tenant filter in every query; how SLA time skips nights and holidays; how two agents replying at once is handled; why the demo snapshots the real API instead of hand-written sample data (it can't drift: a test checks it against the API contract).
