// Fix It. Clean It. Maintain It. — server function (Vercel) — Learn...Wow! / NuSparkLearnWow
// One endpoint, several modes:
//   triage   — reads the question, picks the right helpers (advisors), asks clarifying questions only if needed
//   guide    — the full, source-checked guided fix (quick answer, causes, tools, steps, safety, prevention)
//   diagram  — draws a simple labeled diagram (SVG) for the whole job or for one step
//   stuck    — "Still not fixed?" next steps based on what the visitor already tried
//   ask      — follow-up questions to one helper or the whole crew
//   calendar — the Maintenance Calendar (monthly / seasonal / yearly checklists)
//   more     — 6 new starter jobs for a room
//   compare  — Gain Another Perspective: blends another AI's answer with ours
// Honesty rule: every source shown is a page Claude actually retrieved with web search during THIS request.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const FAST_MODEL = process.env.FAST_MODEL || "claude-haiku-5-5";
// Diagrams use the fast model so they draw quickly. To trade speed for detail, set DIAGRAM_MODEL to claude-sonnet-5-5 in Vercel.
const DIAGRAM_MODEL = process.env.DIAGRAM_MODEL || FAST_MODEL;
const DAILY_LIMIT = parseInt(process.env.DAILY_LIVE_LIMIT || "40", 10);
const ALLOWED = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);

// ---------- the helpers (advisors) ----------
const ADVISORS = {
  tess:   "Tech Tess, the tech helper: computers, phones, tablets, email programs, Wi-Fi, printers, TVs, smart home gadgets and software. Patient, explains tech without jargon.",
  pete:   "Plumber Pete, the plumbing helper: drains, toilets, faucets, pipes, garbage disposals, water heaters, leaks. Practical and calm.",
  sparky: "Sparky Sue, the electrical helper: outlets, breakers, light fixtures, bulbs, switches, extension cords. Safety-first: she explains what is going on and what is safe for a homeowner, and sends any wiring, panel or sparking problem to a licensed electrician.",
  al:     "Appliance Al, the appliance helper: washers, dryers, refrigerators, dishwashers, ovens, stoves, microwaves and small appliances. Knows the common error codes and quick resets.",
  mo:     "Mechanic Mo, the car and bike helper: warning lights, batteries, tires, wipers, fluids, odd noises, bikes, lawn mower engines. Straight talker.",
  hank:   "Handy Hank, the handyman: doors, drawers, walls, drywall, floors, furniture, painting, caulking, hanging things, basic carpentry, hand and power tools.",
  carla:  "Clean Carla, the cleaning pro: stains, odors, laundry, kitchens, bathrooms, floors, carpets, upholstery, windows, and which cleaners are safe on which surfaces (and which must never be mixed).",
  harry:  "HVAC Harry, the heating and cooling helper: furnaces, air conditioners, heat pumps, thermostats, filters, vents, humidifiers, space heaters.",
  gail:   "Garden Gail, the yard and outdoor helper: lawns, gardens, gutters, decks, patios, fences, sheds, outdoor gear and seasonal yard care.",
  tina:   "Tailor Tina, the clothes and shoes helper: zippers, buttons, small tears, hems, shrinking, pilling, shoe care, bags and fabric care labels.",
  supervisor: "The Supervisor, a veteran job-site supervisor with decades across every trade. Calm, direct and reassuring. Catches the mistakes people usually make, shares the shortcuts pros use, and explains why a step matters."
};
const ADVISOR_IDS = Object.keys(ADVISORS).filter(id => id !== "supervisor"); // room helpers (The Supervisor oversees every job)
const INTENTS = { fix: "FIX IT (repair something broken or not working)", clean: "CLEAN IT (clean something or remove a stain, odor or buildup)", maintain: "MAINTAIN IT (keep something in good shape, prevent problems, or learn upkeep)" };

const ROOMS = {
  tech: "Tech & Gadgets", plumbing: "Plumbing", electrical: "Electrical & Lighting", appliances: "Appliances",
  car: "Car & Bike", house: "Around the House", kitchenbath: "Kitchen & Bath", hvac: "Heating & Cooling",
  yard: "Yard & Outdoor", clothes: "Clothes & Shoes", calendar: "Maintenance Calendar", toolbox: "The Toolbox"
};

// --- simple per-IP daily limit (resets when the server instance restarts; the Anthropic spend cap is the real backstop)
const hits = new Map();
function overLimit(ip, limit) {
  const key = ip + "|" + new Date().toISOString().slice(0, 10);
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (hits.size > 5000) hits.clear();
  return n > limit;
}

const SYSTEM = `You are the editor of "Fix It. Clean It. Maintain It.", an interactive how-to tool from NuSparkLearnWow.com (part of the Learn...Wow! series from NuSpark Publishing). It is a LEARNING tool: people read it to understand how to do a job, often before they start. It works like a search engine for anything broken, dirty or due for upkeep: computers and software, phones, the home, plumbing, appliances, cars and bikes, heating and cooling, the yard, clothes and shoes. The host is Mr. Paul, a warm, upbeat teacher in a hard hat, and a crew of helpers (advisors) each bring their own specialty.

HONESTY RULES:
1. Use the web_search tool before answering when it is available. Base your steps on what reliable sources say: manufacturer support pages and manuals, government safety agencies (CPSC, EPA, Energy Star, NHTSA, NFPA, OSHA), university extension services, and established home, auto and tech publications. Avoid forums, content farms and social media.
2. Every source you list MUST be a URL that appeared in your search results in this conversation. Never invent or guess URLs.
3. Never make anything up. No invented error codes, part numbers, settings paths, measurements or prices. If menus differ by version or model, say so and describe the common path.
4. If you are not sure, say so plainly and point to the manufacturer's manual or support site.

SAFETY RULES (always):
- Rate each job: "diy" (safe for most beginners), "caution" (doable with care: unplug, shut off water, wear gloves or eye protection), or "pro" (call a licensed professional).
- Always "pro": gas smells or gas lines, electrical panels, new wiring, sparking or burning smells, anything structural, roof work, working at heights, refrigerant, car airbags, brake hydraulics, fuel system leaks, carbon monoxide alarms going off, mold covering large areas, asbestos or old lead paint. For "pro" jobs, give ONLY the safe immediate actions (for example: leave the house and call the gas company from outside; switch off the breaker if it is safe to do so) and explain what the pro will check. Do not give the repair walkthrough.
- Emergencies (gas smell, smoke, fire, flooding near electricity, carbon monoxide alarm): the very first line tells them to get to safety and call 911 or the utility.
- Always remind people to unplug, turn off the breaker, shut off water, or let things cool before working on them, when it applies. Never suggest mixing cleaning chemicals (for example bleach with ammonia or vinegar).
- Never help bypass safety devices, break into locked devices or accounts that are not theirs, defeat emissions systems, or remove copy protection.

TOPIC RULES:
- Stay on fixing, cleaning, maintaining, and understanding how to care for things. If a question is off-topic, set ok/onTopic to false and kindly suggest The Answer Man on NuSparkLearnWow.com for general knowledge questions.
- Do not recommend or rank specific companies, stores, service providers or local businesses, and no "near me" answers. Product TYPES are fine (for example "an enzyme cleaner" or "a plunger with a flange"). Brand names may appear only when the visitor's own device or product is that brand (for example Outlook, a Honda, a Whirlpool washer).
- Use national, everyday examples. US measurements, with metric in parentheses where it helps.

WRITING STYLE: clear, friendly and encouraging, like a patient expert standing next to them. Short sentences. Plain words; explain any term the first time. Never call the tool or its content "free." No markdown, no asterisks, plain sentences.

OUTPUT: Never put citation tags or markup (like <cite ...>) inside the JSON text. After your research, reply with ONLY a JSON object wrapped in <json> and </json> tags, in the exact shape the user message asks for.`;

const SAFETY_NOTE = "Safety first: unplug it, switch off the breaker, shut off the water or let it cool before you start, and follow the manufacturer's manual. For gas, wiring, structural or roof work, call a licensed pro.";
const sourcesShape = `"sources": [{"title": "Publisher: page title", "url": "https://..."}]`;
const advisorList = () => ADVISOR_IDS.map(id => `- ${id}: ${ADVISORS[id]}`).join("\n");
const crewText = ids => ids.map(id => `- ${id}: ${ADVISORS[id]}`).join("\n");
const cleanIds = a => (Array.isArray(a) ? a : []).map(x => String(x).toLowerCase().trim()).filter(x => ADVISORS[x]).filter((x, i, arr) => arr.indexOf(x) === i);

function jobContext(b) {
  const q = String(b.question || "").slice(0, 500);
  const clar = Array.isArray(b.answers) ? b.answers.slice(0, 4).map(a => `- ${String(a.q || "").slice(0, 160)} -> ${String(a.a || "").slice(0, 200)}`).join("\n") : "";
  const extra = String(b.details || "").slice(0, 600);
  return `Visitor's job: "${q}"` + (clar ? `\nThey answered these clarifying questions:\n${clar}` : "") + (extra ? `\nMore details from them: "${extra}"` : "") + (ROOMS[b.room] ? `\nRoom they came from: ${ROOMS[b.room]}` : "") + (INTENTS[b.intent] ? `\nThey want to: ${INTENTS[b.intent]}` : "");
}

function modePrompt(mode, b) {
  if (mode === "triage") {
    const already = b.answers && b.answers.length ? "They already answered clarifying questions, so set clarify to false." : "";
    return `${jobContext(b)}
${already}
Read the job and set up the crew. Do not research or answer it yet.
The helpers:
${advisorList()}
Pick the ONE helper who fits best, and add a SECOND only if the job clearly crosses into another specialty (for example a dishwasher leak = Appliance Al + Plumber Pete; a stain on a wool coat = Clean Carla + Tailor Tina).
CLARIFY only when the right steps would be quite different depending on the answer (for example "my car is making a noise" needs what kind of noise and when; "Outlook isn't working" needs what happens or what the error says; "clean my couch" needs the fabric type or the cleaning code on its tag; "my toilet keeps running" usually does not). Ask at most 2 short questions, each with 2-5 tap options. Never ask for personal information.
Reply with ONLY this JSON inside <json></json>:
{"onTopic": true,
 "message": "if onTopic is false, one kind sentence pointing them to The Answer Man for general questions; otherwise empty",
 "title": "a short, clear name for the job (max 8 words), e.g. 'Fix a Running Toilet'",
 "room": "one of: ${Object.keys(ROOMS).filter(r => r !== "calendar").join(", ")}",
 "advisors": ["1 or 2 helper ids"],
 "safety": "diy | caution | pro",
 "emergency": false,
 "clarify": false,
 "questions": [{"q": "short question", "options": ["2-5 short choices"]}]}`;
  }

  if (mode === "guide") {
    const crew = cleanIds(b.advisors).slice(0, 3);
    const style = b.style === "simple"
      ? `STYLE: SIMPLIFIED. Very plain words for a total beginner. 4-7 steps, each 1-2 short sentences. Keep only the 3 most likely causes.`
      : b.style === "extended"
        ? `STYLE: EXTENDED (double length). Go deep: 10-14 steps, each 3-5 sentences with what to look for, what it should feel or look like, and why the step matters. 5-6 causes. Fill "deeper" with 3 sections (4-6 sentences each), for example how the part works, signs it is wearing out, and repair vs. replace.`
        : `STYLE: FULL. 7-10 steps, each 2-4 sentences. 3-5 causes. Fill "deeper" with 2 short sections.`;
    return `${jobContext(b)}
Crew on this job (write one tip from each, in their own voice and specialty):
${crewText(crew.length ? crew : ["hank"])}
${style}
Research the job with web search (several searches: the main fix, the manufacturer's or official guidance, and safety). Then write an interactive guided lesson.
THE SUPERVISOR watches every job. Add 2-3 notes from him, each attached to a step number (1-based), each one of: "Pro Tip" (what a 30-year pro does that the steps don't say), "Safety Catch" (the mistake or hazard people miss right there), or "The Why" (why that step matters). Make them genuinely useful, not repeats of the step.
TERMS: list 4-8 part names or terms from the guide a beginner may not know (for example flapper, P-trap, GFCI outlet, lint trap), spelled exactly as they appear in the steps. Order the steps from easiest and most likely to harder and less likely, so the visitor can stop when it is fixed. Each step needs a quick "check" telling them how to tell if that step worked.
If the job is "pro" or an emergency, follow the safety rules: safe immediate actions only, no repair walkthrough.
If the job is really a "how do I clean" or "how do I maintain" job, the steps are the cleaning or maintenance steps, and "causes" can list why it gets dirty or wears out.
Reply with ONLY this JSON inside <json></json>:
{"ok": true,
 "title": "clear job title",
 "quickAnswer": "4-6 sentences that answer it right away, like the top answer on a search page",
 "safety": "diy | caution | pro",
 "safetyNote": "1-2 sentences on the main safety point for this job",
 "emergency": false,
 "difficulty": "Easy | Medium | Hard",
 "time": "typical time, e.g. '15 to 30 minutes'",
 "causes": [{"cause": "likely cause", "sign": "how you can tell"}],
 "tools": ["tools needed (plain names)"],
 "supplies": ["supplies or parts needed"],
 "before": ["2-4 before-you-start safety steps"],
 "steps": [{"title": "short step title", "text": "the step", "check": "how to tell if this fixed it or worked"}],
 "tips": [{"id": "helper id from the crew", "tip": "1-3 sentences in that helper's voice"}],
 "mistakes": ["3-4 common mistakes to avoid"],
 "prevent": ["3-5 ways to keep it from happening again, or a maintenance schedule"],
 "callPro": "2-3 sentences: when to stop and call a pro, and what kind of pro (by trade, never a company name)",
 "deeper": [{"heading": "short heading", "text": "section text"}],
 "supervisor": [{"step": 2, "kind": "Pro Tip | Safety Catch | The Why", "text": "2-3 sentences from The Supervisor"}],
 "terms": [{"term": "a part name or term used in the guide that a beginner may not know (exact wording as it appears in the steps)", "def": "one plain sentence"}],
 "followups": ["4 short follow-up questions a visitor might ask next"],
 "wiki": "the exact English Wikipedia article title that best pictures the main object (e.g. 'Flush toilet', 'Microsoft Outlook', 'Garbage disposal unit')",
 ${sourcesShape}}`;
  }

  if (mode === "diagram") {
    const steps = (Array.isArray(b.steps) ? b.steps : []).slice(0, 14).map((s, i) => `${i + 1}. ${String(s).slice(0, 140)}`).join("\n") || `(steps not written yet) The visitor's job: "${String(b.question || b.title || "").slice(0, 300)}"`;
    const focus = b.step ? `Draw the diagram for THIS ONE STEP only: "${String(b.step.title || "").slice(0, 160)}: ${String(b.step.text || "").slice(0, 600)}"` :
      `Draw the main diagram for the whole job. Pick the most useful kind: a labeled cutaway or front view of the object showing the parts named in the steps (for example the inside of a toilet tank, the back of a dryer, a sink trap, a car's battery terminals), OR for software and settings, a simplified mock screen or a flow of the menu path. Number the labels to match the step numbers where it helps.`;
    return `Job: "${String(b.title || "").slice(0, 160)}"
Steps:
${steps}
${focus}
Rules for the drawing:
- One clean, simple, beginner-friendly SVG diagram, like an illustration in a good how-to book. Flat colors, clear outlines, plenty of white space.
- Keep it compact so it draws fast: about 40 shapes or fewer, no gradients, no filters, no decorative detail. Short labels only (2-5 words).
- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520">. A white background rect first.
- Only basic SVG shapes, paths, lines, polylines, polygons and text. No images, no scripts, no links, no foreignObject, no external fonts, no CSS animations.
- Text: font-family="Arial, Helvetica, sans-serif", at least 15px, dark gray #1f2a44. Short labels with thin leader lines pointing to the parts. Keep every label inside the canvas and never let labels overlap.
- Colors: steel blue #2f5f96, safety yellow #f2b12a, warm red #d9482b for warnings, green #3f8f5a for "correct", light grays for surfaces.
- Add a short title at the top. If there is a hazard (water, power, heat, sharp edge), mark it with a small yellow warning triangle and a label.
- Be accurate. Draw parts where they really are; if unsure, keep it simpler rather than wrong.
Reply with exactly two things and nothing else:
CAPTION: one sentence describing what the diagram shows
then the complete <svg ...>...</svg> code.`;
  }

  if (mode === "stuck") {
    const tried = (Array.isArray(b.tried) ? b.tried : []).slice(0, 16).map(s => "- " + String(s).slice(0, 160)).join("\n") || "- (all the steps in the guide)";
    const crew = cleanIds(b.advisors).slice(0, 3);
    return `Job: "${String(b.title || "").slice(0, 160)}"
${jobContext(b)}
The visitor has learned these steps from the guide:
${tried}
They want to know: what if those steps don't solve it?
${b.notes ? `What they noticed: "${String(b.notes).slice(0, 600)}"` : ""}
Crew: ${crew.join(", ") || "hank"}
Research with web search for less common causes and what to check next. Do not repeat the guide's steps. If the next steps need a pro, say so honestly.
Reply with ONLY this JSON inside <json></json>:
{"speaker": "the crew helper id who leads this answer",
 "message": "2-3 encouraging sentences in that helper's voice about what this likely means now",
 "causes": [{"cause": "less common cause", "sign": "how you can tell"}],
 "steps": [{"title": "short step title", "text": "the step, 2-4 sentences", "check": "how to tell if it worked"}],
 "callPro": "honest 1-2 sentences on whether it is time for a pro and which trade",
 ${sourcesShape}}`;
  }

  if (mode === "ask") {
    const crew = cleanIds(b.advisors).slice(0, 4);
    const to = ADVISORS[b.to] ? b.to : "crew";
    const hist = (Array.isArray(b.history) ? b.history : []).slice(-6).map(h => `Visitor: ${String(h.q || "").slice(0, 300)}\n${String(h.who || "Crew")}: ${String(h.a || "").slice(0, 600)}`).join("\n\n");
    return `Job being worked on: "${String(b.title || "").slice(0, 160)}"
${b.summary ? `Guide summary: ${String(b.summary).slice(0, 1200)}` : ""}
Crew on this job:
${crewText(crew.length ? crew : ["hank"])}
${hist ? `Conversation so far:\n${hist}\n` : ""}
${b.step && b.step.title ? `The question is about step ${parseInt(b.step.n, 10) || ""}: "${String(b.step.title).slice(0, 160)}: ${String(b.step.text || "").slice(0, 700)}"` : ""}
The visitor asks ${to === "crew" ? "the whole crew" : ADVISORS[to].split(",")[0]}: "${String(b.q || "").slice(0, 600)}"
${to === "crew" ? "Have the best-fitting crew helper answer (you may add one short line from a second helper if it truly adds something)." : "Answer in that helper's voice. If the question is outside their specialty, they say so kindly and answer what they safely can."}
Research with web search if the answer depends on facts, models, settings or safety. Answer in 1-3 short paragraphs. If you truly need one detail to answer correctly (for example the model, the error message, or what they see), answer what you can and put one short clarifying question in "clarify".
Reply with ONLY this JSON inside <json></json>:
{"replies": [{"id": "helper id", "text": "the answer"}], "clarify": "one short question, or empty", ${sourcesShape}}`;
  }

  if (mode === "calendar") {
    const what = { home: "a house or apartment", car: "a car", tech: "computers, phones and home tech", appliances: "home appliances", yard: "the yard, garden and outside of the house", all: "a whole household (home, car, appliances, tech and yard)" }[b.what] || "a house";
    return `Make a maintenance calendar for ${what}.
${b.details ? `Details from the visitor: "${String(b.details).slice(0, 400)}"` : ""}
Research with web search (manufacturer guidance, Energy Star, NFPA, CPSC, university extension services and similar). Each task is short and specific (what to do, and one plain reason why). Put tasks in the right time slot. If a timing depends on climate, model or usage, say so in the task.
Reply with ONLY this JSON inside <json></json>:
{"title": "calendar title", "intro": "2-3 sentences",
 "monthly": ["6-10 tasks"],
 "spring": ["5-8 tasks"], "summer": ["5-8 tasks"], "fall": ["5-8 tasks"], "winter": ["5-8 tasks"],
 "yearly": ["5-8 tasks"], "fewYears": ["3-6 tasks done every 2-10 years, with the interval"],
 "tips": [{"id": "helper id", "tip": "one tip in that helper's voice"}],
 ${sourcesShape}}
Helpers you may use for tips (pick 2-3 that fit): ${ADVISOR_IDS.join(", ")}.`;
  }

  if (mode === "glossary") {
    return `Shop Glossary request: "${String(b.term || "").slice(0, 120)}"
${ROOMS[b.room] ? `Area: ${ROOMS[b.room]}` : ""}
Define this home, car, tech or tool term for a beginner. If it is not a term about fixing, cleaning or maintaining things, set ok to false with a kind note in "def". Be accurate; if a term has two common meanings, give the one most people mean around the house and mention the other briefly.
Reply with ONLY this JSON inside <json></json>:
{"ok": true, "term": "the term, properly written", "def": "one plain sentence", "more": "2-4 sentences: what it does and why it matters", "where": "where you usually find it, or empty", "related": ["3-5 related terms"]}`;
  }

  if (mode === "more") {
    const ex = (Array.isArray(b.exclude) ? b.exclude : []).slice(0, 60).map(x => String(x).slice(0, 80));
    const room = ROOMS[b.room] || "Around the House";
    const kind = INTENTS[b.intent] || "a mix of fixing, cleaning and maintaining";
    return `Room: ${room}
Type of job: ${kind}
Suggest 6 NEW, specific, common jobs of that type that people search for in this room. Write them the way a person would type them into a search box, 3-9 words. Mix quick fixes with bigger jobs. No brand names except famous software or devices (like Outlook or an iPhone). Do not repeat or closely resemble: ${JSON.stringify(ex)}.
Reply with ONLY this JSON inside <json></json>: {"topics": ["...", "...", "...", "...", "...", "..."]}`;
  }

  if (mode === "compare") {
    return `Here is our guide:
TITLE: ${String(b.title || "").slice(0, 200)}
TEXT: ${String(b.guide || "").slice(0, 5000)}

Here is another AI's answer on the same job, pasted by the visitor:
${String(b.other || "").slice(0, 6000)}

Blend the two into one stronger answer. Use web search to check any point where they differ. Keep the tone positive: this is about gaining another perspective, not about who was wrong. Keep every safety warning from both. Drop anything unsafe or unsupported and say why in "checked".
Reply with ONLY this JSON inside <json></json>:
{"headline": "one upbeat sentence summing up the combined view",
 "blend": ["3-5 short paragraphs: the combined best answer"],
 "added": ["useful points the other AI added"],
 "checked": ["points that were double-checked or adjusted, with what the sources support"],
 ${sourcesShape}}`;
  }
  return null;
}

// ---------- helpers
function normUrl(u) {
  try { const x = new URL(String(u).trim()); return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "")).toLowerCase(); }
  catch (e) { return ""; }
}
function hostOf(u) { try { return new URL(String(u).trim()).hostname.replace(/^www\./, "").toLowerCase(); } catch (e) { return ""; } }
const words = t => new Set(String(t || "").toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3));

// strong-source filter: official, manufacturer, safety-agency and established how-to sites only
const STRONG_SUFFIX = [".edu", ".gov", ".mil", ".int", ".ac.uk", ".gov.uk", ".gc.ca", ".edu.au", ".gov.au"];
const STRONG_HOSTS = [
  // tech makers and support
  "microsoft.com", "support.microsoft.com", "learn.microsoft.com", "apple.com", "support.apple.com", "google.com", "support.google.com", "android.com",
  "samsung.com", "lg.com", "sony.com", "dell.com", "hp.com", "lenovo.com", "asus.com", "acer.com", "canon.com", "usa.canon.com", "epson.com", "brother-usa.com", "brother.com",
  "netgear.com", "tp-link.com", "linksys.com", "arris.com", "logitech.com", "amazon.com", "roku.com", "intel.com", "nvidia.com", "mozilla.org", "support.mozilla.org", "zoom.us", "adobe.com", "helpx.adobe.com",
  "ifixit.com", "howtogeek.com", "pcmag.com", "pcworld.com", "zdnet.com", "cnet.com", "tomsguide.com", "tomshardware.com", "theverge.com", "wired.com", "lifewire.com", "makeuseof.com", "macrumors.com", "9to5mac.com", "androidauthority.com", "consumer.ftc.gov", "cisa.gov",
  // home, appliances, cleaning
  "whirlpool.com", "geappliances.com", "maytag.com", "kitchenaid.com", "frigidaire.com", "electrolux.com", "boschhome.com", "bosch-home.com", "kenmore.com", "dyson.com", "carrier.com", "trane.com", "lennox.com", "honeywellhome.com", "resideo.com", "aosmith.com", "rheem.com", "kohler.com", "moen.com", "deltafaucet.com", "americanstandard-us.com", "insinkerator.com",
  "energystar.gov", "epa.gov", "cpsc.gov", "nfpa.org", "osha.gov", "energy.gov", "ul.com", "redcross.org", "ready.gov", "fema.gov", "usfa.fema.gov", "cleaninginstitute.org", "americancleaninginstitute.org", "iicrc.org", "carpet-rug.org", "woolmark.com", "ftc.gov",
  "familyhandyman.com", "thisoldhouse.com", "bobvila.com", "popularmechanics.com", "consumerreports.org", "thespruce.com", "bhg.com", "goodhousekeeping.com", "marthastewart.com", "realsimple.com", "finehomebuilding.com", "homedepot.com", "lowes.com", "acehardware.com", "sherwin-williams.com", "benjaminmoore.com", "dap.com", "3m.com",
  // auto and bike
  "nhtsa.gov", "fueleconomy.gov", "aaa.com", "exchange.aaa.com", "caranddriver.com", "motortrend.com", "edmunds.com", "kbb.com", "cars.com", "consumerreports.org", "carcare.org", "tirerack.com", "bridgestonetire.com", "michelinman.com", "goodyear.com", "firestonecompleteautocare.com", "parktool.com", "bicycling.com",
  "toyota.com", "honda.com", "owners.honda.com", "ford.com", "chevrolet.com", "gm.com", "nissanusa.com", "hyundaiusa.com", "kia.com", "subaru.com", "tesla.com", "bmwusa.com", "mbusa.com", "vw.com", "mazdausa.com", "jeep.com", "ramtrucks.com",
  // yard, garden
  "almanac.com", "extension.org", "rhs.org.uk", "gardeners.com", "toro.com", "johndeere.com", "deere.com", "briggsandstratton.com", "hondapowerequipment.com", "stihlusa.com",
  // general reference
  "britannica.com", "howstuffworks.com", "wikipedia.org", "en.wikipedia.org", "bbc.co.uk", "bbc.com", "pbs.org", "npr.org", "nytimes.com", "wirecutter.com", "washingtonpost.com", "reuters.com", "apnews.com", "smithsonianmag.com", "scientificamerican.com", "mayoclinic.org", "clevelandclinic.org", "poison.org"
];
function isStrong(url) {
  const h = hostOf(url); if (!h) return false;
  if (STRONG_SUFFIX.some(sfx => h.endsWith(sfx))) return true;
  return STRONG_HOSTS.some(d => h === d || h.endsWith("." + d));
}
// A source counts only if it is a page Claude actually retrieved in THIS request.
function verifySources(list, retrieved) {
  const out = [], seen = new Set(), pages = [...retrieved.values()];
  for (const s of Array.isArray(list) ? list : []) {
    if (!s || !s.url) continue;
    let r = retrieved.get(normUrl(s.url));
    if (!r) {
      const host = hostOf(s.url), want = words((s.title || "") + " " + s.url);
      let best = null, bestScore = -1;
      for (const pg of pages) {
        if (hostOf(pg.url) !== host) continue;
        const have = words(pg.title + " " + pg.url);
        let score = 0; want.forEach(w => { if (have.has(w)) score++; });
        if (score > bestScore) { best = pg; bestScore = score; }
      }
      r = best;
    }
    if (!r || !isStrong(r.url) || /[?&]comment/i.test(r.url)) continue;
    const n = normUrl(r.url);
    if (seen.has(n)) continue;
    seen.add(n);
    out.push({ title: String(r.title || s.title || r.url).slice(0, 200), url: r.url });
  }
  return out.slice(0, 6);
}
function extractJson(text) {
  let raw = null;
  const low = text.toLowerCase();
  for (let i = low.lastIndexOf("<json>"); i >= 0; i = low.lastIndexOf("<json>", i - 1)) {
    const end = low.indexOf("</json>", i);
    if (end > i) { raw = text.slice(i + 6, end); break; }
    if (i === 0) break;
  }
  if (!raw) { const a = text.indexOf("{"), z = text.lastIndexOf("}"); if (a >= 0 && z > a) raw = text.slice(a, z + 1); }
  if (!raw) return null;
  raw = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(raw); } catch (e) { return null; }
}
const cleanText = s => String(s || "").replace(/<\/?cite\b[^>]*>/gi, "").replace(/<\/?[a-z_]+:[a-z_]+\b[^>]*>/gi, "").replace(/\*\*/g, "").replace(/[ \t]{2,}/g, " ").trim();
const clip = (s, n) => cleanText(s).slice(0, n);
const clipList = (a, n, len) => (Array.isArray(a) ? a : []).slice(0, n).map(x => clip(x, len)).filter(Boolean);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const cleanSteps = (a, n) => (Array.isArray(a) ? a : []).slice(0, n).map(s => ({ title: clip(s && s.title, 120), text: clip(s && s.text, 1400), check: clip(s && s.check, 400) })).filter(s => s.text);
const cleanCauses = (a, n) => (Array.isArray(a) ? a : []).slice(0, n).map(c => typeof c === "string" ? { cause: clip(c, 200), sign: "" } : { cause: clip(c && c.cause, 200), sign: clip(c && c.sign, 300) }).filter(c => c.cause);
const cleanTips = (a, crew) => (Array.isArray(a) ? a : []).slice(0, 4).map(t => ({ id: String(t && t.id || "").toLowerCase(), tip: clip(t && t.tip, 600) })).filter(t => ADVISORS[t.id] && t.tip && (!crew || !crew.length || crew.includes(t.id)));

// Diagram safety: keep only the SVG, strip anything active (it is also shown as an <img>, which never runs scripts)
function cleanSvg(text) {
  let s = String(text || "");
  const a = s.indexOf("<svg");
  if (a < 0) return "";
  let z = s.lastIndexOf("</svg>");
  if (z < a) { // cut off before the end: drop the unfinished last tag and close the drawing
    const lastClose = s.lastIndexOf(">");
    if (lastClose <= a) return "";
    s = s.slice(0, lastClose + 1).replace(/<(g|text|tspan)\b[^>]*>(?![\s\S]*<\/\1>)/gi, "") + "</svg>";
    z = s.lastIndexOf("</svg>");
  }
  s = s.slice(a, z + 6)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<image\b[^>]*>/gi, "")
    .replace(/<a\b[^>]*>|<\/a>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/\s(xlink:)?href\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, "none");
  if (!/xmlns=/.test(s.slice(0, 300))) s = s.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  return s.length > 90000 ? "" : s;
}

async function anthropic(messages, maxSearches, model, maxTokens) {
  const body = { model: model || MODEL, max_tokens: maxTokens || 9000, system: SYSTEM, messages };
  // the fast model must have thinking turned off, or it spends its whole budget thinking and returns nothing (the stronger model refuses this setting)
  if (/haiku/i.test(body.model)) body.thinking = { type: "disabled" };
  if (maxSearches > 0) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches }];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) { const t = await r.text(); throw new Error("Anthropic API error " + r.status + ": " + t.slice(0, 300)); }
  return r.json();
}
const textOf = data => (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");

async function callClaude(userPrompt, maxSearches) {
  const messages = [{ role: "user", content: userPrompt }];
  const retrieved = new Map();
  let finalText = "";
  const absorb = data => {
    for (const block of data.content || []) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const res of block.content) if (res && res.url) retrieved.set(normUrl(res.url), { url: res.url, title: res.title || "" });
      }
      if (block.type === "text") {
        finalText += block.text;
        for (const c of block.citations || []) if (c && c.url) retrieved.set(normUrl(c.url), { url: c.url, title: c.title || "" });
      }
    }
  };
  let data = null;
  for (let round = 0; round < 4; round++) {
    data = await anthropic(messages, maxSearches);
    absorb(data);
    if (data.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: data.content }); continue; }
    break;
  }
  if (!extractJson(finalText) && data) {
    messages.push({ role: "assistant", content: data.content });
    messages.push({ role: "user", content: "Thank you. Now reply with ONLY the final <json>...</json> object in the exact shape requested, using only the pages you already found. Do not search again." });
    try { const d2 = await anthropic(messages, 1); absorb(d2); } catch (e) { console.error(e); }
  }
  return { text: finalText, retrieved };
}

const NO_SOURCES = "Mr. Paul couldn't match these steps to strong sources this time, so treat them as general guidance and double-check your owner's manual or the maker's support site.";

module.exports = async (req, res) => {
  if (!(await require("./_lwgate")(req, res, "fix-clean-maintain"))) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const origin = req.headers.origin || "";
  if (ALLOWED.length && origin && !ALLOWED.some(a => origin === a)) return res.status(403).json({ error: "This tool only works on its home website." });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY." });

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "x").split(",")[0].trim();
  const b = req.body || {};
  const mode = String(b.mode || "");
  if (mode !== "more" && mode !== "triage" && mode !== "glossary" && overLimit(ip, DAILY_LIMIT)) {
    return res.status(429).json({ error: "limit", message: "You've reached today's limit. Come back tomorrow and the crew will be ready." });
  }
  const prompt = modePrompt(mode, b);
  if (!prompt) return res.status(400).json({ error: "Unknown mode" });

  try {
    // ---- quick modes (no web search)
    if (mode === "triage") {
      const j = extractJson(textOf(await anthropic([{ role: "user", content: prompt }], 0, FAST_MODEL, 1500))) || {};
      if (j.onTopic === false) return res.status(200).json({ onTopic: false, message: clip(j.message, 300) || "This tool is for fixing, cleaning and maintaining things. For other questions, try The Answer Man on NuSparkLearnWow.com." });
      let advisors = cleanIds(j.advisors).filter(id => id !== "supervisor").slice(0, 2);
      if (!advisors.length) advisors = ["hank"];
      const questions = (Array.isArray(j.questions) ? j.questions : []).slice(0, 2)
        .map(q => ({ q: clip(q && q.q, 160), options: clipList(q && q.options, 5, 60) })).filter(q => q.q);
      return res.status(200).json({
        onTopic: true, title: clip(j.title, 100) || clip(b.question, 100), room: ROOMS[j.room] ? j.room : (ROOMS[b.room] ? b.room : "house"),
        advisors, safety: oneOf(j.safety, ["diy", "caution", "pro"], "caution"), emergency: j.emergency === true,
        clarify: j.clarify === true && questions.length > 0 && !(b.answers && b.answers.length), questions
      });
    }
    if (mode === "glossary") {
      const j = extractJson(textOf(await anthropic([{ role: "user", content: prompt }], 0, MODEL, 1200))) || {};
      if (j.ok === false) return res.status(200).json({ ok: false, def: clip(j.def, 300) || "The Shop Glossary covers home, car, tech and tool terms. Try another word." });
      return res.status(200).json({ ok: true, term: clip(j.term, 80) || clip(b.term, 80), def: clip(j.def, 400), more: clip(j.more, 900), where: clip(j.where, 300), related: clipList(j.related, 5, 60) });
    }
    if (mode === "more") {
      const j = extractJson(textOf(await anthropic([{ role: "user", content: prompt }], 0, FAST_MODEL, 800))) || {};
      return res.status(200).json({ topics: clipList(j.topics, 6, 80) });
    }
    if (mode === "diagram") {
      let text = textOf(await anthropic([{ role: "user", content: prompt }], 0, DIAGRAM_MODEL, 7000));
      let svg = cleanSvg(text);
      if (!svg && DIAGRAM_MODEL !== MODEL) { // backup: the stronger model draws it
        text = textOf(await anthropic([{ role: "user", content: prompt }], 0, MODEL, 9000));
        svg = cleanSvg(text);
      }
      const cap = (text.match(/CAPTION:\s*([^\n<]+)/i) || [])[1] || "";
      if (!svg) return res.status(200).json({ ok: false, message: "The diagram didn't come out right. Tap Try Again." });
      return res.status(200).json({ ok: true, svg, caption: clip(cap, 240) });
    }

    // ---- researched modes
    const searches = mode === "guide" ? (b.style === "extended" ? 7 : 5) : mode === "calendar" ? 5 : 3;
    const { text, retrieved } = await callClaude(prompt, searches);
    const j = extractJson(text) || {};
    const sources = verifySources(j.sources, retrieved);

    if (mode === "guide") {
      if (j.ok === false) return res.status(200).json({ ok: false, message: clip(j.quickAnswer || j.message, 400) || "This tool is for fixing, cleaning and maintaining things. For other questions, try The Answer Man on NuSparkLearnWow.com." });
      const steps = cleanSteps(j.steps, 14);
      if (!steps.length && !j.quickAnswer) return res.status(200).json({ ok: false, message: "The crew couldn't put that guide together just now. Please try again in a minute." });
      const crew = cleanIds(b.advisors);
      return res.status(200).json({
        ok: true, title: clip(j.title, 140), quickAnswer: clip(j.quickAnswer, 1400),
        safety: oneOf(j.safety, ["diy", "caution", "pro"], "caution"), safetyNote: clip(j.safetyNote, 500), emergency: j.emergency === true,
        difficulty: oneOf(j.difficulty, ["Easy", "Medium", "Hard"], "Medium"), time: clip(j.time, 60),
        causes: cleanCauses(j.causes, 6), tools: clipList(j.tools, 12, 100), supplies: clipList(j.supplies, 12, 100), before: clipList(j.before, 5, 300),
        steps, tips: cleanTips(j.tips, crew), mistakes: clipList(j.mistakes, 5, 300), prevent: clipList(j.prevent, 6, 300),
        callPro: clip(j.callPro, 600), deeper: (Array.isArray(j.deeper) ? j.deeper : []).slice(0, 3).map(d => ({ heading: clip(d && d.heading, 80), text: clip(d && d.text, 1400) })).filter(d => d.text),
        supervisor: (Array.isArray(j.supervisor) ? j.supervisor : []).slice(0, 3).map(x => ({ step: Math.max(1, Math.min(steps.length, parseInt(x && x.step, 10) || 1)), kind: oneOf(String(x && x.kind || "").trim(), ["Pro Tip", "Safety Catch", "The Why"], "Pro Tip"), text: clip(x && x.text, 700) })).filter(x => x.text),
        terms: (Array.isArray(j.terms) ? j.terms : []).slice(0, 8).map(t => ({ term: clip(t && t.term, 60), def: clip(t && t.def, 300) })).filter(t => t.term && t.def),
        followups: clipList(j.followups, 4, 140), wiki: clip(j.wiki, 120), sources, sourceNote: sources.length ? "" : NO_SOURCES, safetyFooter: SAFETY_NOTE
      });
    }
    if (mode === "stuck") {
      return res.status(200).json({
        speaker: ADVISORS[String(j.speaker || "").toLowerCase()] ? String(j.speaker).toLowerCase() : (cleanIds(b.advisors)[0] || "hank"),
        message: clip(j.message, 600), causes: cleanCauses(j.causes, 5), steps: cleanSteps(j.steps, 8), callPro: clip(j.callPro, 500),
        sources, sourceNote: sources.length ? "" : NO_SOURCES
      });
    }
    if (mode === "ask") {
      const replies = (Array.isArray(j.replies) ? j.replies : []).slice(0, 2).map(r => ({ id: String(r && r.id || "").toLowerCase(), text: clip(r && r.text, 2200) }))
        .filter(r => r.text).map(r => ({ id: ADVISORS[r.id] ? r.id : (ADVISORS[b.to] ? b.to : (cleanIds(b.advisors)[0] || "hank")), text: r.text }));
      if (!replies.length) return res.status(200).json({ replies: [{ id: ADVISORS[b.to] ? b.to : "hank", text: "The crew couldn't confirm an answer to that one. Try asking it a different way." }], clarify: "", sources: [] });
      return res.status(200).json({ replies, clarify: clip(j.clarify, 200), sources });
    }
    if (mode === "calendar") {
      const L = k => clipList(j[k], 10, 300);
      return res.status(200).json({
        title: clip(j.title, 120), intro: clip(j.intro, 600), monthly: L("monthly"), spring: L("spring"), summer: L("summer"), fall: L("fall"), winter: L("winter"),
        yearly: L("yearly"), fewYears: L("fewYears"), tips: cleanTips(j.tips), sources, sourceNote: sources.length ? "" : NO_SOURCES
      });
    }
    if (mode === "compare") {
      return res.status(200).json({ headline: clip(j.headline, 300), blend: clipList(j.blend, 6, 1400), added: clipList(j.added, 6, 400), checked: clipList(j.checked, 6, 400), sources });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "The crew couldn't reach the workshop just now. Please try again in a minute." });
  }
};
